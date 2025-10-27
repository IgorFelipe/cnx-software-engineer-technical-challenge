/**
 * Worker Pool and Orchestration Types
 */

export interface WorkerJob {
  id: string;
  mailingId: string;
  email: string;
  token: string;
  attempt: number;
}

export interface WorkerResult {
  success: boolean;
  jobId: string;
  email: string;
  externalId?: string;
  error?: string;
  statusCode?: number;
}

export interface WorkerPoolConfig {
  maxConcurrency: number;
  batchSize: number;
  staleJobTimeoutMs: number; // Time before considering a SENDING job as stale
  retryDelayMs: number;
  maxRetries: number;
}

export interface WorkerPoolMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  retriedJobs: number;
  deadLetterJobs: number;
  activeWorkers: number;
  queuedJobs: number;
  lastProcessedAt: Date | null;
}

export interface OrchestratorConfig {
  pollingIntervalMs: number;
  batchSize: number;
  maxConcurrency: number;
  staleJobTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export enum JobStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  INVALID = 'INVALID',
}
