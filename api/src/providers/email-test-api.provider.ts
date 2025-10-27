import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import type { IEmailProvider } from './email.provider.interface.js';
import type {
  EmailSendRequest,
  EmailSendResponse,
  EmailProviderConfig,
  ApiMetrics,
} from '../types/email.types.js';
import { getTokenManager } from '../services/token-manager.service.js';
import { getRateLimiter } from '../services/rate-limiter.service.js';

/**
 * Email Test API Provider
 * 
 * Implementation of IEmailProvider for the CNX Email Test API.
 * 
 * Features:
 * - Token-based authentication with automatic renewal
 * - Idempotency key generation using SHA256
 * - 401 handling with token invalidation and retry
 * - Request metrics tracking
 * - Response truncation to prevent PII logging
 * - **Rate limiting via RateLimiter singleton** (prevents 429 errors)
 * 
 * IMPORTANT: Uses singleton services
 * - TokenManager MUST be initialized at API startup via initializeTokenManager()
 * - RateLimiter MUST be initialized at API startup via initializeRateLimiter()
 * - This provider automatically uses getTokenManager() and getRateLimiter()
 * - All authentication and rate limiting is handled transparently
 */
export class EmailTestApiProvider implements IEmailProvider {
  private config: EmailProviderConfig;
  private metrics: ApiMetrics;

  constructor(config: EmailProviderConfig) {
    this.config = {
      ...config,
      timeout: config.timeout ?? 30000, // 30 seconds default
      maxRetries: config.maxRetries ?? 1, // 1 retry on 401
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsByStatusCode: {},
      lastRequestAt: null,
    };
  }

  /**
   * Sends an email via the Email Test API
   * Uses RateLimiter to respect API limits
   */
  async sendEmail(request: EmailSendRequest): Promise<EmailSendResponse> {
    const { to, subject, body, idempotencyKey } = request;

    console.log(`📧 Sending email to ${to} (idempotency: ${this.truncateKey(idempotencyKey)})`);

    // Wrap the send logic in rate limiter
    return getRateLimiter().schedule(async () => {
      try {
        // Get token from TokenManager
        const token = await getTokenManager().getToken();

        // First attempt
        const response = await this.sendEmailRequest(
          { to, subject, body, idempotencyKey },
          token
        );

        return response;
      } catch (error) {
        // Check if it's a 401 error
        if (this.is401Error(error)) {
          console.warn('⚠️  Received 401, invalidating token and retrying...');

          try {
            // Invalidate token and get a new one
            const newToken = await getTokenManager().invalidateAndRenew();

            // Retry once with new token
            const retryResponse = await this.sendEmailRequest(
              { to, subject, body, idempotencyKey },
              newToken
            );

            console.log('✅ Retry successful after token renewal');
            return retryResponse;
          } catch (retryError) {
            console.error('❌ Retry failed after token renewal:', this.getErrorMessage(retryError));
            throw retryError;
          }
        }

        // Not a 401 error, throw original error
        throw error;
      }
    }, 5); // Priority 5 (normal priority)
  }

  /**
   * Performs the actual HTTP request to send email
   */
  private async sendEmailRequest(
    request: EmailSendRequest,
    token: string
  ): Promise<EmailSendResponse> {
    const { to, subject, body, idempotencyKey } = request;
    const url = `${this.config.baseUrl}/send-email`;

    this.metrics.totalRequests++;
    this.metrics.lastRequestAt = Date.now();

    try {
      const response = await axios.post(
        url,
        {
          to,
          subject,
          body,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          timeout: this.config.timeout,
        }
      );

      // Update metrics
      const statusCode = response.status;
      this.updateMetrics(statusCode, true);

      // Log response (truncated to avoid PII)
      console.log(`✅ Email sent successfully (status: ${statusCode})`);
      this.logTruncatedResponse(response.data);

      return {
        success: true,
        messageId: response.data?.message_id || response.data?.messageId || response.data?.id || `status:${response.data?.status}`,
        statusCode,
      };
    } catch (error) {
      const statusCode = this.getStatusCode(error);
      this.updateMetrics(statusCode, false);

      // Log error (truncated)
      console.error(`❌ Email send failed (status: ${statusCode})`);
      this.logTruncatedError(error);

      return {
        success: false,
        error: this.getErrorMessage(error),
        statusCode,
      };
    }
  }

  /**
   * Generates idempotency key using SHA256
   * Format: sha256(mailingId:email:attempt)
   */
  static generateIdempotencyKey(mailingId: string, email: string, attempt: number): string {
    const input = `${mailingId}:${email}:${attempt}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Updates request metrics
   */
  private updateMetrics(statusCode: number, success: boolean): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Track by status code
    if (!this.metrics.requestsByStatusCode[statusCode]) {
      this.metrics.requestsByStatusCode[statusCode] = 0;
    }
    this.metrics.requestsByStatusCode[statusCode]++;

    // Log Prometheus-style metric
    console.log(`📊 api_requests_total{status_code="${statusCode}"} ${this.metrics.requestsByStatusCode[statusCode]}`);
  }

  /**
   * Checks if error is a 401 Unauthorized
   */
  private is401Error(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      return error.response?.status === 401;
    }
    return false;
  }

  /**
   * Gets HTTP status code from error
   */
  private getStatusCode(error: unknown): number {
    if (axios.isAxiosError(error)) {
      return error.response?.status ?? 0;
    }
    return 0;
  }

  /**
   * Extracts error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.data) {
        const data = axiosError.response.data as any;
        return data.message || data.error || JSON.stringify(data);
      }
      return axiosError.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Logs truncated response to avoid PII exposure
   */
  private logTruncatedResponse(data: any): void {
    if (!data) {
      return;
    }

    // Only log safe fields
    const safe = {
      messageId: data.message_id || data.messageId || data.id,
      status: data.status,
      timestamp: data.timestamp,
    };

    console.log('   Response:', JSON.stringify(safe));
  }

  /**
   * Logs truncated error to avoid PII exposure
   */
  private logTruncatedError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const safe = {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          // Only log error field, not full data
          error: (axiosError.response.data as any)?.error || 'Unknown error',
        };
        console.error('   Error:', JSON.stringify(safe));
      } else if (axiosError.request) {
        console.error('   Error: No response received (timeout or network error)');
      } else {
        console.error('   Error:', axiosError.message);
      }
    }
  }

  /**
   * Truncates idempotency key for logging
   */
  private truncateKey(key: string): string {
    if (key.length <= 16) {
      return key;
    }
    return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
  }

  /**
   * Gets provider metrics
   */
  getMetrics(): ApiMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets provider name
   */
  getName(): string {
    return 'EmailTestApi';
  }
}
