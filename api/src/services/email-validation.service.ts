import validator from 'validator';
import disposableDomains from 'disposable-email-domains' with { type: 'json' };
import { promises as dns } from 'dns';
import {
  EmailValidationResult,
  EmailInvalidReason,
  EmailValidationOptions,
} from '../types/validation.types.js';

/**
 * Email validation service with layered validation approach
 * 
 * Layers:
 * 1. Syntax validation (RFC-lite with regex)
 * 2. Disposable domain detection
 * 3. MX record lookup (optional, controlled by flag)
 */
class EmailValidationService {
  private disposableDomainsSet: Set<string>;

  constructor() {
    // Convert disposable domains array to Set for O(1) lookups
    this.disposableDomainsSet = new Set(disposableDomains);
  }

  /**
   * Validate email with all configured layers
   */
  async validateEmail(
    email: string,
    options: EmailValidationOptions
  ): Promise<EmailValidationResult> {
    // Layer 1: Syntax validation (mandatory)
    const syntaxResult = this.validateSyntax(email);
    if (!syntaxResult.isValid) {
      return syntaxResult;
    }

    // Layer 2: Disposable domain detection (recommended)
    if (options.enableDisposableCheck) {
      const disposableResult = this.validateDisposable(email);
      if (!disposableResult.isValid) {
        return disposableResult;
      }
    }

    // Layer 3: MX lookup (optional, flag-controlled)
    if (options.enableMxCheck) {
      const mxResult = await this.validateMxRecord(email);
      if (!mxResult.isValid) {
        return mxResult;
      }
    }

    return { isValid: true };
  }

  /**
   * Layer 1: Syntax validation using validator library (RFC-lite)
   */
  private validateSyntax(email: string): EmailValidationResult {
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Basic validation
    if (!normalizedEmail || normalizedEmail.length === 0) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Email is empty',
      };
    }

    // Use validator library for RFC-lite validation
    if (!validator.isEmail(normalizedEmail)) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Invalid email syntax',
      };
    }

    // Additional checks
    const parts = normalizedEmail.split('@');
    if (parts.length !== 2) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Invalid email format',
      };
    }

    const [localPart, domain] = parts;

    // Check local part length (RFC 5321: max 64 chars)
    if (localPart.length > 64) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Local part exceeds 64 characters',
      };
    }

    // Check domain length (RFC 5321: max 255 chars)
    if (domain.length > 255) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Domain exceeds 255 characters',
      };
    }

    // Check domain has at least one dot
    if (!domain.includes('.')) {
      return {
        isValid: false,
        reason: EmailInvalidReason.SYNTAX,
        details: 'Domain must have at least one dot',
      };
    }

    return { isValid: true };
  }

  /**
   * Layer 2: Disposable domain detection
   */
  private validateDisposable(email: string): EmailValidationResult {
    const domain = email.split('@')[1].toLowerCase();

    if (this.disposableDomainsSet.has(domain)) {
      return {
        isValid: false,
        reason: EmailInvalidReason.DISPOSABLE,
        details: `Disposable email domain: ${domain}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Layer 3: MX record lookup (optional)
   * Checks if the domain has valid MX records
   */
  private async validateMxRecord(email: string): Promise<EmailValidationResult> {
    const domain = email.split('@')[1].toLowerCase();

    try {
      const mxRecords = await dns.resolveMx(domain);

      if (!mxRecords || mxRecords.length === 0) {
        return {
          isValid: false,
          reason: EmailInvalidReason.MX_FAIL,
          details: `No MX records found for domain: ${domain}`,
        };
      }

      return { isValid: true };
    } catch (error: any) {
      // DNS lookup failed
      return {
        isValid: false,
        reason: EmailInvalidReason.MX_FAIL,
        details: `MX lookup failed for domain ${domain}: ${error.code || error.message}`,
      };
    }
  }

  /**
   * Batch validate multiple emails
   */
  async validateEmails(
    emails: string[],
    options: EmailValidationOptions
  ): Promise<Map<string, EmailValidationResult>> {
    const results = new Map<string, EmailValidationResult>();

    // Process in parallel for better performance
    const promises = emails.map(async (email) => {
      const result = await this.validateEmail(email, options);
      results.set(email, result);
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Normalize email address
   */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Extract domain from email
   */
  extractDomain(email: string): string {
    return email.split('@')[1].toLowerCase();
  }
}

// Export singleton instance
export const emailValidationService = new EmailValidationService();
