/**
 * Retry Policy Service
 * 
 * Implements sophisticated retry logic with:
 * - Exponential backoff with cap
 * - Jitter to prevent thundering herd
 * - Smart error classification (retryable vs permanent)
 * - Dead Letter Queue integration
 * - Audit logging
 * 
 * Formula: delay = min(base_delay * 2^attempt, max_delay) ± jitter%
 * Example: 1s, 2s, 4s, 8s, 16s, 32s, 60s, ... capped at 300s (5min)
 */

export interface RetryPolicyConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPercent: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  delayMs?: number;
  moveToDLQ: boolean;
}

export interface ErrorClassification {
  isRetryable: boolean;
  category: 'client_error' | 'server_error' | 'rate_limit' | 'timeout' | 'network' | 'unknown';
  reason: string;
}

/**
 * Retry Policy Service
 * Determines retry strategy based on error type and attempt count
 */
export class RetryPolicyService {
  private config: RetryPolicyConfig;

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.baseDelayMs ?? 1000, // 1 second
      maxDelayMs: config.maxDelayMs ?? 300000, // 5 minutes
      jitterPercent: config.jitterPercent ?? 20,
    };
  }

  /**
   * Classifies an error to determine if it's retryable
   * 
   * Non-retryable (4xx client errors):
   * - 400 Bad Request - Invalid request format
   * - 401 Unauthorized - Invalid credentials (handled separately)
   * - 403 Forbidden - Access denied
   * - 404 Not Found - Resource doesn't exist
   * - 422 Unprocessable Entity - Validation failed
   * 
   * Retryable errors:
   * - 408 Request Timeout
   * - 429 Too Many Requests - Rate limit
   * - 500 Internal Server Error
   * - 502 Bad Gateway
   * - 503 Service Unavailable
   * - 504 Gateway Timeout
   * - Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
   * 
   * @param statusCode - HTTP status code (if available)
   * @param error - Error object or message
   * @returns Error classification
   */
  classifyError(statusCode?: number, error?: any): ErrorClassification {
    // Network/timeout errors (no status code)
    if (!statusCode) {
      const errorMessage = error?.message || String(error);
      
      if (errorMessage.includes('ECONNREFUSED') || 
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('network')) {
        return {
          isRetryable: true,
          category: 'network',
          reason: 'Network error - connection failed',
        };
      }

      if (errorMessage.includes('timeout')) {
        return {
          isRetryable: true,
          category: 'timeout',
          reason: 'Request timeout',
        };
      }

      return {
        isRetryable: true,
        category: 'unknown',
        reason: 'Unknown error - will retry',
      };
    }

    // 4xx Client Errors (mostly non-retryable)
    if (statusCode >= 400 && statusCode < 500) {
      // Special retryable 4xx codes
      if (statusCode === 408) {
        return {
          isRetryable: true,
          category: 'timeout',
          reason: '408 Request Timeout',
        };
      }

      if (statusCode === 429) {
        return {
          isRetryable: true,
          category: 'rate_limit',
          reason: '429 Too Many Requests - rate limit exceeded',
        };
      }

      // Non-retryable 4xx (permanent client errors)
      const reasons: Record<number, string> = {
        400: '400 Bad Request - invalid request format',
        401: '401 Unauthorized - invalid credentials',
        403: '403 Forbidden - access denied',
        404: '404 Not Found - resource does not exist',
        422: '422 Unprocessable Entity - validation failed',
      };

      return {
        isRetryable: false,
        category: 'client_error',
        reason: reasons[statusCode] || `${statusCode} Client Error - permanent failure`,
      };
    }

    // 5xx Server Errors (retryable)
    if (statusCode >= 500 && statusCode < 600) {
      const reasons: Record<number, string> = {
        500: '500 Internal Server Error',
        502: '502 Bad Gateway',
        503: '503 Service Unavailable',
        504: '504 Gateway Timeout',
      };

      return {
        isRetryable: true,
        category: 'server_error',
        reason: reasons[statusCode] || `${statusCode} Server Error - temporary failure`,
      };
    }

    // 2xx Success (shouldn't happen in error handler)
    if (statusCode >= 200 && statusCode < 300) {
      return {
        isRetryable: false,
        category: 'unknown',
        reason: `${statusCode} Success - not an error`,
      };
    }

    // Other status codes
    return {
      isRetryable: true,
      category: 'unknown',
      reason: `${statusCode} Unknown status - will retry`,
    };
  }

  /**
   * Decides whether to retry based on attempt count and error classification
   * 
   * @param currentAttempt - Current attempt number (1-indexed)
   * @param statusCode - HTTP status code (if available)
   * @param error - Error object or message
   * @returns Retry decision with delay if applicable
   */
  shouldRetry(currentAttempt: number, statusCode?: number, error?: any): RetryDecision {
    const classification = this.classifyError(statusCode, error);

    // If error is not retryable (permanent client error), move to DLQ immediately
    if (!classification.isRetryable) {
      return {
        shouldRetry: false,
        reason: `Permanent error - ${classification.reason}`,
        moveToDLQ: true,
      };
    }

    // If max retries exceeded, move to DLQ
    if (currentAttempt >= this.config.maxRetries) {
      return {
        shouldRetry: false,
        reason: `Max retries exceeded (${currentAttempt}/${this.config.maxRetries}) - ${classification.reason}`,
        moveToDLQ: true,
      };
    }

    // Calculate delay with exponential backoff + jitter
    const delayMs = this.calculateDelay(currentAttempt);

    return {
      shouldRetry: true,
      reason: `Retryable error (attempt ${currentAttempt}/${this.config.maxRetries}) - ${classification.reason}`,
      delayMs,
      moveToDLQ: false,
    };
  }

  /**
   * Calculates retry delay with exponential backoff and jitter
   * 
   * Formula: delay = min(base_delay * 2^(attempt-1), max_delay) ± jitter%
   * 
   * Examples (base=1000ms, max=300000ms, jitter=20%):
   * - Attempt 1: 1s ± 20% = 800ms-1200ms
   * - Attempt 2: 2s ± 20% = 1600ms-2400ms
   * - Attempt 3: 4s ± 20% = 3200ms-4800ms
   * - Attempt 4: 8s ± 20% = 6400ms-9600ms
   * - Attempt 5: 16s ± 20% = 12800ms-19200ms
   * - Attempt 10+: 300s ± 20% = 240000ms-360000ms (capped)
   * 
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    // Exponential backoff: base * 2^(attempt-1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Apply jitter: ±jitterPercent%
    const jitterRange = cappedDelay * (this.config.jitterPercent / 100);
    const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -jitterRange and +jitterRange

    const finalDelay = Math.round(cappedDelay + jitter);

    // Ensure minimum delay of 0
    return Math.max(0, finalDelay);
  }

  /**
   * Formats delay for human-readable logging
   * @param delayMs - Delay in milliseconds
   * @returns Formatted string (e.g., "1.5s", "2m 30s")
   */
  formatDelay(delayMs: number): string {
    if (delayMs < 1000) {
      return `${delayMs}ms`;
    }

    if (delayMs < 60000) {
      return `${(delayMs / 1000).toFixed(1)}s`;
    }

    const minutes = Math.floor(delayMs / 60000);
    const seconds = Math.floor((delayMs % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  /**
   * Gets current configuration
   * @returns Retry policy config
   */
  getConfig(): RetryPolicyConfig {
    return { ...this.config };
  }
}

/**
 * Default retry policy instance
 * Can be customized per use case
 */
export const defaultRetryPolicy = new RetryPolicyService({
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 300000,
  jitterPercent: 20,
});
