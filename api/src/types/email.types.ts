/**
 * Email provider types
 */

/**
 * Email send request
 */
export interface EmailSendRequest {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}

/**
 * Email send response
 */
export interface EmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Email provider configuration
 */
export interface EmailProviderConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * API request metrics
 */
export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsByStatusCode: Record<number, number>;
  lastRequestAt: number | null;
}
