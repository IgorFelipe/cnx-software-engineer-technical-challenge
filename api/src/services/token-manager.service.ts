import { Mutex } from 'async-mutex';
import axios, { AxiosError } from 'axios';
import jwt from 'jsonwebtoken';
import type {
  TokenResponse,
  JwtPayload,
  StoredToken,
  TokenManagerConfig,
  TokenMetrics,
} from '../types/token.types.js';

/**
 * Token Manager Service
 * 
 * Manages authentication tokens with automatic renewal and thread-safe access.
 * 
 * Features:
 * - In-memory token storage with expiration tracking
 * - Automatic renewal 5 minutes before expiry (configurable)
 * - Mutex-based locking to prevent race conditions
 * - 401 handling with token invalidation and retry
 * - Metrics tracking (renewals, errors)
 * - Token masking in logs for security
 * 
 * SINGLETON PATTERN:
 * - Constructor is private - cannot be instantiated directly
 * - Must use initializeTokenManager() to create the instance (called once at API startup)
 * - Use getTokenManager() to get the singleton instance
 */
class TokenManager {
  private mutex: Mutex;
  private storedToken: StoredToken | null = null;
  private config: TokenManagerConfig;
  private metrics: TokenMetrics;
  private isRenewing = false;

  /**
   * Private constructor - prevents direct instantiation
   * Only accessible through initializeTokenManager()
   */
  private constructor(config: TokenManagerConfig) {
    this.mutex = new Mutex();
    this.config = config;
    this.metrics = {
      totalRenewals: 0,
      lastRenewalAt: null,
      lastError: null,
      currentTokenExpiresAt: null,
    };
  }

  /**
   * Gets a valid token, renewing if necessary
   * Thread-safe with mutex locking
   * @returns Valid authentication token
   */
  async getToken(): Promise<string> {
    // Use mutex to prevent concurrent token requests
    return this.mutex.runExclusive(async () => {
      // Check if current token is valid
      if (this.isTokenValid()) {
        // Check if token needs proactive renewal
        if (this.needsRenewal()) {
          console.log('🔄 Token approaching expiry, renewing proactively...');
          await this.renewToken();
        }
        return this.storedToken!.token;
      }

      // Token is expired or doesn't exist, obtain new one
      console.log('🔑 No valid token available, obtaining new token...');
      await this.renewToken();
      return this.storedToken!.token;
    });
  }

  /**
   * Invalidates current token and forces renewal
   * Used when receiving 401 responses
   */
  async invalidateAndRenew(): Promise<string> {
    return this.mutex.runExclusive(async () => {
      console.log('⚠️  Token invalidated due to 401 response, forcing renewal...');
      this.storedToken = null;
      await this.renewToken();
      return this.storedToken!.token;
    });
  }

  /**
   * Checks if current token is valid (not expired)
   */
  private isTokenValid(): boolean {
    if (!this.storedToken) {
      return false;
    }

    const now = Date.now();
    const isValid = now < this.storedToken.expiresAt;

    if (!isValid) {
      console.log('⏰ Token has expired');
    }

    return isValid;
  }

  /**
   * Checks if token needs proactive renewal
   * Returns true if token expires within renewal window
   */
  private needsRenewal(): boolean {
    if (!this.storedToken) {
      return true;
    }

    const now = Date.now();
    const timeUntilExpiry = this.storedToken.expiresAt - now;
    const needsRenewal = timeUntilExpiry < this.config.renewalWindowMs;

    if (needsRenewal) {
      const minutesLeft = Math.floor(timeUntilExpiry / 1000 / 60);
      console.log(`⚡ Token expires in ${minutesLeft} minutes, renewal threshold reached`);
    }

    return needsRenewal;
  }

  /**
   * Renews token by calling auth API
   * Updates stored token and metrics
   */
  private async renewToken(): Promise<void> {
    // Prevent multiple simultaneous renewals
    if (this.isRenewing) {
      console.log('⏳ Token renewal already in progress, waiting...');
      // Wait a bit and return (mutex will handle synchronization)
      return;
    }

    this.isRenewing = true;

    try {
      console.log(`🔐 Requesting new token from ${this.maskUrl(this.config.authUrl)}...`);

      const response = await axios.post<TokenResponse>(
        this.config.authUrl,
        {
          username: this.config.username,
          password: this.config.password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      const { access_token } = response.data;

      // Decode JWT to get expiration time
      const decoded = jwt.decode(access_token) as JwtPayload;
      if (!decoded || !decoded.exp) {
        throw new Error('Invalid JWT token: missing expiration');
      }

      // Convert exp from seconds to milliseconds
      const expirationMs = decoded.exp * 1000;

      // Store token with metadata
      const now = Date.now();
      this.storedToken = {
        token: access_token,
        expiresAt: expirationMs,
        obtainedAt: now,
      };

      // Update metrics
      this.metrics.totalRenewals++;
      this.metrics.lastRenewalAt = now;
      this.metrics.currentTokenExpiresAt = expirationMs;
      this.metrics.lastError = null;

      // Calculate token lifetime
      const lifetimeMinutes = Math.floor((expirationMs - now) / 1000 / 60);
      const expiryDate = new Date(expirationMs).toISOString();

      console.log(
        `✅ Token renewed successfully (lifetime: ${lifetimeMinutes} minutes, expires: ${expiryDate})`
      );
      console.log(`📊 Token: ${this.maskToken(access_token)}`);
      console.log(
        `📈 Total renewals: ${this.metrics.totalRenewals}`
      );
    } catch (error) {
      this.isRenewing = false;
      const errorMessage = this.getErrorMessage(error);
      this.metrics.lastError = errorMessage;

      console.error('❌ Token renewal failed:', errorMessage);

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          console.error(
            `   Status: ${axiosError.response.status}, Data:`,
            axiosError.response.data
          );
        } else if (axiosError.request) {
          console.error('   No response received from auth server');
        }
      }

      throw new Error(`Failed to renew token: ${errorMessage}`);
    } finally {
      this.isRenewing = false;
    }
  }

  /**
   * Masks token for logging (shows first 6 and last 4 characters)
   */
  private maskToken(token: string): string {
    if (token.length <= 10) {
      return '***';
    }
    const start = token.substring(0, 6);
    const end = token.substring(token.length - 4);
    return `${start}...${end}`;
  }

  /**
   * Masks URL for logging (hides sensitive parts)
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Extracts error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * Gets current token metrics
   */
  getMetrics(): TokenMetrics {
    return { ...this.metrics };
  }

  /**
   * Checks if token manager has a valid token
   */
  hasValidToken(): boolean {
    return this.isTokenValid();
  }

  /**
   * Gets time until token expiry in milliseconds
   * Returns null if no token exists
   */
  getTimeUntilExpiry(): number | null {
    if (!this.storedToken) {
      return null;
    }
    return Math.max(0, this.storedToken.expiresAt - Date.now());
  }

  /**
   * Static factory method - used internally by initializeTokenManager()
   * @internal
   */
  static createInstance(config: TokenManagerConfig): TokenManager {
    return new TokenManager(config);
  }
}

// Singleton instance
let tokenManagerInstance: TokenManager | null = null;

/**
 * Initializes the global token manager instance
 * 
 * ⚠️  IMPORTANT: This should only be called ONCE at application startup
 * Subsequent calls will replace the existing instance
 * 
 * @param config - Token manager configuration
 * @returns The initialized TokenManager instance
 */
export function initializeTokenManager(config: TokenManagerConfig): void {
  if (tokenManagerInstance) {
    console.warn('⚠️  TokenManager already initialized. Replacing existing instance.');
  }
  tokenManagerInstance = TokenManager.createInstance(config);
  console.log('✅ TokenManager singleton created and ready');
}

/**
 * Gets the global token manager instance
 * Throws if not initialized
 */
export function getTokenManager(): TokenManager {
  if (!tokenManagerInstance) {
    throw new Error(
      'TokenManager not initialized. Call initializeTokenManager() first.'
    );
  }
  return tokenManagerInstance;
}
