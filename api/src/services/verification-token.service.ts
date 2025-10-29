import crypto from 'crypto';

/**
 * Service for generating secure verification tokens
 */
export class VerificationTokenService {
  /**
   * Generate a random verification token
   * @param length - Length of the token (default: 32 characters)
   * @returns A hexadecimal token string
   */
  static generateToken(length: number = 32): string {
    const bytes = Math.ceil(length / 2);
    const token = crypto.randomBytes(bytes).toString('hex').substring(0, length);
    return token;
  }

  /**
   * Generate a numeric verification code
   * @param length - Length of the code (default: 6 digits)
   * @returns A numeric code string
   */
  static generateNumericCode(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  /**
   * Generate an alphanumeric token (easier to type)
   * @param length - Length of the token (default: 8 characters)
   * @returns An alphanumeric token string
   */
  static generateAlphanumericToken(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      token += chars[randomBytes[i] % chars.length];
    }
    
    return token;
  }
}
