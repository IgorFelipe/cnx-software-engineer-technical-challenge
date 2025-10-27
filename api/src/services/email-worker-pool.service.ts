/**
 * Email Worker Pool Service
 * 
 * Manages concurrent email sending with:
 * - Job queue management
 * - Stale job detection and recovery
 * - Idempotency via mailingId:email:attempt keys
 * - Retry logic with exponential backoff
 * - Dead letter queue for failed jobs
 * - Transactional status updates
 * 
 * Features:
 * - Reads PENDING entries from DB
 * - Processes in batches with controlled concurrency
 * - Marks jobs as SENDING during processing
 * - Updates to SENT on success or FAILED on permanent failure
 * - Moves permanently failed jobs to dead_letters
 * - Recovers stale SENDING jobs on startup
 */

import { prisma } from '../config/database.js';
import { DeadLetterRepository } from '../repositories/dead-letter.repository.js';
import { EmailTestApiProvider } from '../providers/email-test-api.provider.js';
import { RetryPolicyService } from './retry-policy.service.js';
import type {
  WorkerJob,
  WorkerResult,
  WorkerPoolConfig,
  WorkerPoolMetrics,
} from '../types/worker.types.js';

/**
 * Worker Pool Service
 * Orchestrates email sending with concurrency control and retry logic
 */
export class EmailWorkerPool {
  private deadLetterRepo: DeadLetterRepository;
  private emailProvider: EmailTestApiProvider;
  private retryPolicy: RetryPolicyService;
  private config: WorkerPoolConfig;
  private metrics: WorkerPoolMetrics;
  private activeJobs: Set<string> = new Set();

  constructor(
    emailProvider: EmailTestApiProvider,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    this.deadLetterRepo = new DeadLetterRepository();
    this.emailProvider = emailProvider;
    
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 5,
      batchSize: config.batchSize ?? 10,
      staleJobTimeoutMs: config.staleJobTimeoutMs ?? 5 * 60 * 1000, // 5 minutes
      retryDelayMs: config.retryDelayMs ?? 1000, // 1 second (deprecated, using RetryPolicy now)
      maxRetries: config.maxRetries ?? 3,
    };

    // Initialize retry policy with exponential backoff
    this.retryPolicy = new RetryPolicyService({
      maxRetries: this.config.maxRetries,
      baseDelayMs: 1000, // 1 second base
      maxDelayMs: 300000, // 5 minutes max
      jitterPercent: 20,
    });

    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      retriedJobs: 0,
      deadLetterJobs: 0,
      activeWorkers: 0,
      queuedJobs: 0,
      lastProcessedAt: null,
    };
  }

  /**
   * Recovers stale SENDING jobs on startup
   * Jobs stuck in SENDING state are reset to PENDING
   */
  async recoverStaleJobs(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.config.staleJobTimeoutMs);

    const staleJobs = await prisma.mailingEntry.findMany({
      where: {
        status: 'SENDING',
        lastAttempt: {
          lt: staleThreshold,
        },
      },
    });

    if (staleJobs.length === 0) {
      console.log('✅ No stale jobs found');
      return 0;
    }

    console.log(`🔄 Found ${staleJobs.length} stale jobs, resetting to PENDING...`);

    // Reset stale jobs to PENDING so they can be retried
    await prisma.mailingEntry.updateMany({
      where: {
        status: 'SENDING',
        lastAttempt: {
          lt: staleThreshold,
        },
      },
      data: {
        status: 'PENDING',
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Reset ${staleJobs.length} stale jobs to PENDING`);
    return staleJobs.length;
  }

  /**
   * Processes a batch of pending jobs
   * @param mailingId - Mailing ID to process
   * @param batchSize - Number of jobs to process
   * @returns Number of jobs processed
   */
  async processBatch(mailingId: string, batchSize?: number): Promise<number> {
    const limit = batchSize ?? this.config.batchSize;

    // Fetch pending jobs
    const pendingJobs = await prisma.mailingEntry.findMany({
      where: {
        mailingId,
        status: 'PENDING',
      },
      take: limit,
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (pendingJobs.length === 0) {
      return 0;
    }

    console.log(`📦 Processing batch of ${pendingJobs.length} jobs for mailing ${mailingId}`);

    // Process jobs with concurrency control
    const jobs: WorkerJob[] = pendingJobs.map((entry: any) => ({
      id: entry.id,
      mailingId: entry.mailingId,
      email: entry.email,
      token: entry.token,
      attempt: entry.attempts + 1,
    }));

    // Process jobs in parallel with max concurrency
    const results = await this.processJobsConcurrently(jobs);

    // Update metrics
    this.metrics.totalJobs += results.length;
    this.metrics.completedJobs += results.filter((r) => r.success).length;
    this.metrics.failedJobs += results.filter((r) => !r.success).length;
    this.metrics.lastProcessedAt = new Date();

    return results.length;
  }

  /**
   * Processes jobs concurrently with rate limiting
   * @param jobs - Array of jobs to process
   * @returns Array of results
   */
  private async processJobsConcurrently(jobs: WorkerJob[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    const chunks = this.chunkArray(jobs, this.config.maxConcurrency);

    for (const chunk of chunks) {
      this.metrics.activeWorkers = chunk.length;
      this.metrics.queuedJobs = jobs.length - results.length - chunk.length;

      const chunkResults = await Promise.all(
        chunk.map((job) => this.processJob(job))
      );

      results.push(...chunkResults);
    }

    this.metrics.activeWorkers = 0;
    this.metrics.queuedJobs = 0;

    return results;
  }

  /**
   * Processes a single job
   * @param job - Job to process
   * @returns Job result
   */
  private async processJob(job: WorkerJob): Promise<WorkerResult> {
    const { id, mailingId, email, token, attempt } = job;

    // Track active job
    this.activeJobs.add(id);

    try {
      // Step 1: Check current status (skip if already SENT)
      const entry = await prisma.mailingEntry.findUnique({
        where: { id },
      });

      if (!entry) {
        console.warn(`⚠️  Job ${id} not found in database`);
        this.activeJobs.delete(id);
        return { success: false, jobId: id, email, error: 'Job not found' };
      }

      if (entry.status === 'SENT') {
        console.log(`✅ Job ${id} already sent, skipping`);
        this.activeJobs.delete(id);
        return { success: true, jobId: id, email, externalId: entry.externalId ?? undefined };
      }

      // Step 2: Mark as SENDING in transaction
      await prisma.mailingEntry.update({
        where: { id },
        data: {
          status: 'SENDING',
          attempts: attempt,
          lastAttempt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Step 3: Generate stable idempotency key
      const idempotencyKey = EmailTestApiProvider.generateIdempotencyKey(
        mailingId,
        email,
        attempt
      );

      console.log(`📧 Sending email to ${email} (attempt ${attempt}, key: ${idempotencyKey.substring(0, 16)}...)`);

      // Step 4: Send email via provider (rate-limited)
      const response = await this.emailProvider.sendEmail({
        to: email,
        subject: token, // Using token as subject as per requirements
        body: `Your token: ${token}`,
        idempotencyKey,
      });

      // Step 5: Handle response
      if (response.success) {
        // Success: Mark as SENT
        await prisma.mailingEntry.update({
          where: { id },
          data: {
            status: 'SENT',
            externalId: response.messageId ?? null,
            updatedAt: new Date(),
          },
        });

        console.log(`✅ Email sent successfully to ${email} (external_id: ${response.messageId})`);
        this.activeJobs.delete(id);

        return {
          success: true,
          jobId: id,
          email,
          externalId: response.messageId,
          statusCode: response.statusCode,
        };
      } else {
        // Failure: Apply retry logic
        return await this.handleJobFailure(id, email, attempt, response.error ?? 'Unknown error', response.statusCode);
      }
    } catch (error: any) {
      console.error(`❌ Error processing job ${id}:`, error.message);
      return await this.handleJobFailure(id, email, attempt, error.message);
    }
  }

  /**
   * Handles job failure with sophisticated retry logic
   * Uses RetryPolicyService for exponential backoff and error classification
   * 
   * @param jobId - Job ID
   * @param mailingId - Mailing ID
   * @param email - Email address
   * @param attempt - Current attempt number
   * @param error - Error message
   * @param statusCode - HTTP status code (if available)
   * @returns Job result
   */
  private async handleJobFailure(
    jobId: string,
    email: string,
    attempt: number,
    error: string,
    statusCode?: number
  ): Promise<WorkerResult> {
    this.activeJobs.delete(jobId);

    // Get retry decision from policy service
    const decision = this.retryPolicy.shouldRetry(attempt, statusCode, error);

    // Log the decision with audit trail
    console.log(`📋 Retry Decision for job ${jobId}:`);
    console.log(`   Email: ${email}`);
    console.log(`   Attempt: ${attempt}/${this.config.maxRetries}`);
    console.log(`   Status Code: ${statusCode ?? 'N/A'}`);
    console.log(`   Error: ${error}`);
    console.log(`   Decision: ${decision.reason}`);
    
    if (decision.shouldRetry && decision.delayMs !== undefined) {
      const delayFormatted = this.retryPolicy.formatDelay(decision.delayMs);
      console.log(`   Retry Delay: ${delayFormatted}`);
      
      // Mark as PENDING for retry (will be picked up in next batch)
      await prisma.mailingEntry.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });

      console.log(`🔄 Job ${jobId} scheduled for retry (delay: ${delayFormatted})`);
      this.metrics.retriedJobs++;

      return {
        success: false,
        jobId,
        email,
        error: `Retry scheduled: ${error}`,
        statusCode,
      };
    }

    if (decision.moveToDLQ) {
      // Permanent failure or max retries: Mark as FAILED and move to DLQ
      const entry = await prisma.mailingEntry.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          updatedAt: new Date(),
        },
      });

      // Add to dead letter queue with full context
      await this.deadLetterRepo.create({
        mailingId: entry.mailingId,
        email: entry.email,
        reason: decision.reason,
        attempts: attempt,
        lastError: `[${statusCode ?? 'N/A'}] ${error}`,
      });

      console.log(`💀 Job ${jobId} moved to Dead Letter Queue`);
      console.log(`   Reason: ${decision.reason}`);
      console.log(`   Total Attempts: ${attempt}`);
      this.metrics.deadLetterJobs++;

      return {
        success: false,
        jobId,
        email,
        error: `Permanent failure: ${error}`,
        statusCode,
      };
    }

    // Fallback (shouldn't happen)
    console.warn(`⚠️  Unexpected retry decision state for job ${jobId}`);
    return {
      success: false,
      jobId,
      email,
      error: `Unexpected state: ${error}`,
      statusCode,
    };
  }

  /**
   * Splits array into chunks
   * @param array - Array to split
   * @param size - Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Gets current metrics
   * @returns Metrics object
   */
  getMetrics(): WorkerPoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Resets metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      retriedJobs: 0,
      deadLetterJobs: 0,
      activeWorkers: 0,
      queuedJobs: 0,
      lastProcessedAt: null,
    };
  }
}
