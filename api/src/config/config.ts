/**
 * Application configuration
 * Loads environment variables and provides typed configuration
 */

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database configuration
  databaseUrl: process.env.DATABASE_URL || '',

  // Email validation configuration
  emailValidation: {
    enableMxCheck: process.env.ENABLE_MX_CHECK === 'true',
    enableDisposableCheck: process.env.ENABLE_DISPOSABLE_CHECK !== 'false', // enabled by default
  },

  // CSV processing configuration
  csv: {
    batchSize: 500,
    checkpointInterval: 1000,
  },

  // Token manager configuration
  tokenManager: {
    authUrl: process.env.AUTH_API_URL || 'https://email-test-api-475816.ue.r.appspot.com/auth/token',
    username: process.env.AUTH_USERNAME || 'cnx_test',
    password: process.env.AUTH_PASSWORD || 'cnx_password_2025!',
    renewalWindowMs: parseInt(process.env.TOKEN_RENEWAL_WINDOW_MS || '300000', 10), // 5 minutes default
  },
} as const;

export type Config = typeof config;
