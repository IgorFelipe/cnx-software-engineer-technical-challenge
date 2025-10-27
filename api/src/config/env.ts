import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
dotenv.config({ path: resolve(__dirname, '../../../.env') });

interface Config {
  port: number;
  nodeEnv: string;
  authApiUrl: string;
  authUsername: string;
  authPassword: string;
  rateLimitPerMinute: number;
  workerConcurrency: number;
  emailApiUrl: string;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterPercent: number;
  csvCheckpointInterval: number;
  csvBatchSize: number;
  staleSendingThresholdMs: number;
  shutdownTimeoutMs: number;
  forceShutdownTimeoutMs: number;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  authApiUrl: process.env.AUTH_API_URL || '',
  authUsername: process.env.AUTH_USERNAME || '',
  authPassword: process.env.AUTH_PASSWORD || '',
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '6', 10),
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
  emailApiUrl: process.env.EMAIL_API_URL || '',
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryBaseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10),
  retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '300000', 10), // 5 minutes
  retryJitterPercent: parseInt(process.env.RETRY_JITTER_PERCENT || '20', 10),
  csvCheckpointInterval: parseInt(process.env.CSV_CHECKPOINT_INTERVAL || '1000', 10),
  csvBatchSize: parseInt(process.env.CSV_BATCH_SIZE || '500', 10),
  staleSendingThresholdMs: parseInt(process.env.STALE_SENDING_THRESHOLD_MS || '300000', 10), // 5 minutes
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10), // 30 seconds
  forceShutdownTimeoutMs: parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT_MS || '60000', 10), // 60 seconds
};
