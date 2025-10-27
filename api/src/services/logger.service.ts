/**
 * Structured Logger Service
 * 
 * Provides structured JSON logging with required fields for observability.
 * 
 * Required fields per event:
 * - timestamp: ISO 8601 timestamp
 * - level: log level (info, warn, error, debug)
 * - mailingId: mailing identifier (when applicable)
 * - email: email address (when applicable)
 * - status: current status (PENDING, SENDING, SENT, FAILED, etc.)
 * - attempts: number of attempts (when applicable)
 * - workerId: worker identifier (when applicable)
 * - http_status: HTTP status code (when applicable)
 * - error_code: error code (when applicable)
 * - message: human-readable message
 */

import pino from 'pino';
import { config } from '../config/env.js';

/**
 * Log context for mailing events
 */
export interface MailingLogContext {
  mailingId?: string;
  email?: string;
  status?: string;
  attempts?: number;
  workerId?: string;
  http_status?: number;
  error_code?: string;
  duration?: number;
  [key: string]: any;
}

/**
 * Create base logger instance
 */
const baseLogger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  
  // Format options
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  
  // Base fields included in every log
  base: {
    service: 'email-mailing-api',
    environment: config.nodeEnv,
  },
  
  // Timestamp in ISO 8601 format
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  
  // Pretty print in development
  transport: config.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  } : undefined,
});

/**
 * Structured Logger
 */
export class StructuredLogger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger = baseLogger) {
    this.logger = logger;
  }

  /**
   * Creates a child logger with additional context
   */
  child(bindings: Record<string, any>): StructuredLogger {
    return new StructuredLogger(this.logger.child(bindings));
  }

  /**
   * Logs mailing upload event
   */
  mailingUploaded(context: MailingLogContext & { filename: string; totalRows: number }) {
    this.logger.info({
      event: 'mailing.uploaded',
      mailingId: context.mailingId,
      filename: context.filename,
      totalRows: context.totalRows,
      status: 'PROCESSING',
      message: `Mailing uploaded: ${context.filename} (${context.totalRows} rows)`,
    });
  }

  /**
   * Logs CSV processing progress
   */
  csvProgress(context: MailingLogContext & { processedRows: number; totalRows: number }) {
    this.logger.info({
      event: 'csv.progress',
      mailingId: context.mailingId,
      processedRows: context.processedRows,
      totalRows: context.totalRows,
      percentage: ((context.processedRows / context.totalRows) * 100).toFixed(2),
      message: `CSV processing: ${context.processedRows}/${context.totalRows} rows`,
    });
  }

  /**
   * Logs checkpoint save
   */
  checkpointSaved(context: MailingLogContext & { lastLine: number }) {
    this.logger.debug({
      event: 'checkpoint.saved',
      mailingId: context.mailingId,
      lastLine: context.lastLine,
      message: `Checkpoint saved at line ${context.lastLine}`,
    });
  }

  /**
   * Logs email validation
   */
  emailValidated(context: MailingLogContext & { valid: boolean; reason?: string }) {
    this.logger.debug({
      event: 'email.validated',
      mailingId: context.mailingId,
      email: context.email,
      valid: context.valid,
      reason: context.reason,
      message: context.valid 
        ? `Email validated: ${context.email}` 
        : `Email invalid: ${context.email} (${context.reason})`,
    });
  }

  /**
   * Logs email sending attempt
   */
  emailSending(context: MailingLogContext) {
    this.logger.info({
      event: 'email.sending',
      mailingId: context.mailingId,
      email: context.email,
      status: 'SENDING',
      attempts: context.attempts || 1,
      workerId: context.workerId,
      message: `Sending email to ${context.email} (attempt ${context.attempts || 1})`,
    });
  }

  /**
   * Logs successful email send
   */
  emailSent(context: MailingLogContext & { externalId?: string }) {
    this.logger.info({
      event: 'email.sent',
      mailingId: context.mailingId,
      email: context.email,
      status: 'SENT',
      attempts: context.attempts,
      workerId: context.workerId,
      http_status: context.http_status || 200,
      externalId: context.externalId,
      duration: context.duration,
      message: `Email sent successfully to ${context.email}`,
    });
  }

  /**
   * Logs failed email send (will retry)
   */
  emailFailed(context: MailingLogContext & { error: string }) {
    this.logger.warn({
      event: 'email.failed',
      mailingId: context.mailingId,
      email: context.email,
      status: 'PENDING', // Will retry
      attempts: context.attempts,
      workerId: context.workerId,
      http_status: context.http_status,
      error_code: context.error_code,
      error: context.error,
      message: `Email failed: ${context.email} (attempt ${context.attempts}) - ${context.error}`,
    });
  }

  /**
   * Logs dead letter (permanent failure)
   */
  emailDeadLetter(context: MailingLogContext & { error: string }) {
    this.logger.error({
      event: 'email.dead_letter',
      mailingId: context.mailingId,
      email: context.email,
      status: 'FAILED',
      attempts: context.attempts,
      workerId: context.workerId,
      http_status: context.http_status,
      error_code: context.error_code,
      error: context.error,
      message: `Email moved to dead letter queue: ${context.email} - ${context.error}`,
    });
  }

  /**
   * Logs token renewal
   */
  tokenRenewed(context: { success: boolean; expiresAt?: string; error?: string }) {
    if (context.success) {
      this.logger.info({
        event: 'token.renewed',
        status: 'SUCCESS',
        expiresAt: context.expiresAt,
        message: `Authentication token renewed (expires: ${context.expiresAt})`,
      });
    } else {
      this.logger.error({
        event: 'token.renewal_failed',
        status: 'FAILED',
        error: context.error,
        message: `Token renewal failed: ${context.error}`,
      });
    }
  }

  /**
   * Logs crash recovery
   */
  crashRecovery(context: { staleJobs: number; staleMailings: number }) {
    this.logger.warn({
      event: 'crash.recovery',
      staleJobs: context.staleJobs,
      staleMailings: context.staleMailings,
      message: `Crash recovery: ${context.staleJobs} jobs, ${context.staleMailings} mailings`,
    });
  }

  /**
   * Logs graceful shutdown
   */
  shutdownStarted(context: { signal: string }) {
    this.logger.warn({
      event: 'shutdown.started',
      signal: context.signal,
      message: `Graceful shutdown initiated (${context.signal})`,
    });
  }

  /**
   * Logs shutdown completion
   */
  shutdownCompleted(context: { duration: number }) {
    this.logger.info({
      event: 'shutdown.completed',
      duration: context.duration,
      message: `Graceful shutdown completed (${context.duration}ms)`,
    });
  }

  /**
   * Generic info log
   */
  info(message: string, context?: MailingLogContext) {
    this.logger.info({ ...context, message });
  }

  /**
   * Generic warn log
   */
  warn(message: string, context?: MailingLogContext) {
    this.logger.warn({ ...context, message });
  }

  /**
   * Generic error log
   */
  error(message: string, context?: MailingLogContext & { error?: any }) {
    this.logger.error({
      ...context,
      error: context?.error?.message || context?.error,
      stack: context?.error?.stack,
      message,
    });
  }

  /**
   * Generic debug log
   */
  debug(message: string, context?: MailingLogContext) {
    this.logger.debug({ ...context, message });
  }

  /**
   * Gets the underlying Pino logger (for Fastify integration)
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}

/**
 * Global logger instance
 */
export const logger = new StructuredLogger();

/**
 * Creates a child logger with specific context
 */
export function createLogger(context: Record<string, any>): StructuredLogger {
  return logger.child(context);
}
