/**
 * Email validation types and enums
 */

/**
 * Reasons why an email is invalid
 */
export enum EmailInvalidReason {
  SYNTAX = 'syntax',
  DISPOSABLE = 'disposable',
  MX_FAIL = 'mx-fail',
  UNKNOWN = 'unknown',
}

/**
 * Result of email validation
 */
export interface EmailValidationResult {
  isValid: boolean;
  reason?: EmailInvalidReason;
  details?: string;
}

/**
 * Options for email validation
 */
export interface EmailValidationOptions {
  enableMxCheck: boolean;
  enableDisposableCheck: boolean;
}
