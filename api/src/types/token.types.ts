/**
 * Token management types
 */

/**
 * Token response from auth API
 */
export interface TokenResponse {
  access_token: string; // JWT token
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  sub: string; // subject (username)
  exp: number; // expiration (Unix timestamp in seconds)
}

/**
 * Stored token with metadata
 */
export interface StoredToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
  obtainedAt: number; // Unix timestamp in milliseconds
}

/**
 * Token manager configuration
 */
export interface TokenManagerConfig {
  authUrl: string;
  username: string;
  password: string;
  renewalWindowMs: number; // Renew N milliseconds before expiry
}

/**
 * Token metrics
 */
export interface TokenMetrics {
  totalRenewals: number;
  lastRenewalAt: number | null;
  lastError: string | null;
  currentTokenExpiresAt: number | null;
}
