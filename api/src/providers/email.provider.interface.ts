import type { EmailSendRequest, EmailSendResponse, ApiMetrics } from '../types/email.types.js';

/**
 * Email Provider Interface
 * 
 * Defines contract for email sending implementations.
 * Allows easy swapping between different email services (SendGrid, AWS SES, custom API, etc.)
 */
export interface IEmailProvider {
  /**
   * Sends an email
   * @param request - Email send request with to, subject, body, idempotencyKey
   * @returns Email send response with success status and metadata
   */
  sendEmail(request: EmailSendRequest): Promise<EmailSendResponse>;

  /**
   * Gets provider metrics
   * @returns API request metrics
   */
  getMetrics(): ApiMetrics;

  /**
   * Gets provider name
   * @returns Provider name (e.g., "EmailTestApi", "SendGrid")
   */
  getName(): string;
}
