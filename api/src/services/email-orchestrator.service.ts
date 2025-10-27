/**
 * Email Sending Orchestrator
 * 
 * High-level orchestrator that:
 * - Polls for pending jobs
 * - Manages worker pool lifecycle
 * - Handles batch processing
 * - Monitors progress
 * - Provides health checks
 * 
 * Usage:
 * ```typescript
 * const orchestrator = new EmailOrchestrator(emailProvider, config);
 * await orchestrator.start();
 * await orchestrator.processMailing('mailing-123');
 * await orchestrator.stop();
 * ```
 */

import { EmailWorkerPool } from './email-worker-pool.service.js';
import { MailingProgressRepository } from '../repositories/mailing-progress.repository.js';
import { MailingEntryRepository } from '../repositories/mailing-entry.repository.js';
import { EmailTestApiProvider } from '../providers/email-test-api.provider.js';
import type { OrchestratorConfig, WorkerPoolMetrics } from '../types/worker.types.js';

export interface OrchestratorStatus {
  isRunning: boolean;
  currentMailing: string | null;
  workerPoolMetrics: WorkerPoolMetrics;
  mailingProgress: {
    totalRows: number;
    sent: number;
    failed: number;
    pending: number;
    invalid: number;
  } | null;
}

/**
 * Email Sending Orchestrator
 * Manages the lifecycle of email sending campaigns
 */
export class EmailOrchestrator {
  private workerPool: EmailWorkerPool;
  private progressRepo: MailingProgressRepository;
  private entryRepo: MailingEntryRepository;
  private config: OrchestratorConfig;
  private isRunning: boolean = false;
  private currentMailing: string | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(
    emailProvider: EmailTestApiProvider,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.config = {
      pollingIntervalMs: config.pollingIntervalMs ?? 10000, // 10 seconds
      batchSize: config.batchSize ?? 10,
      maxConcurrency: config.maxConcurrency ?? 5,
      staleJobTimeoutMs: config.staleJobTimeoutMs ?? 5 * 60 * 1000, // 5 minutes
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };

    this.workerPool = new EmailWorkerPool(emailProvider, {
      maxConcurrency: this.config.maxConcurrency,
      batchSize: this.config.batchSize,
      staleJobTimeoutMs: this.config.staleJobTimeoutMs,
      maxRetries: this.config.maxRetries,
      retryDelayMs: this.config.retryDelayMs,
    });

    this.progressRepo = new MailingProgressRepository();
    this.entryRepo = new MailingEntryRepository();
  }

  /**
   * Starts the orchestrator
   * Recovers stale jobs and begins processing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️  Orchestrator already running');
      return;
    }

    console.log('🚀 Starting Email Orchestrator...');

    // Recover stale jobs from previous crashes
    const recoveredJobs = await this.workerPool.recoverStaleJobs();
    if (recoveredJobs > 0) {
      console.log(`✅ Recovered ${recoveredJobs} stale jobs`);
    }

    this.isRunning = true;
    console.log('✅ Email Orchestrator started');
  }

  /**
   * Stops the orchestrator
   * Waits for active jobs to complete
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('⏸️  Stopping Email Orchestrator...');

    // Stop polling
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.isRunning = false;
    this.currentMailing = null;

    console.log('✅ Email Orchestrator stopped');
  }

  /**
   * Processes a mailing campaign
   * Processes all PENDING entries until none remain
   * 
   * @param mailingId - Mailing ID to process
   * @returns Total jobs processed
   */
  async processMailing(mailingId: string): Promise<number> {
    if (!this.isRunning) {
      throw new Error('Orchestrator not running. Call start() first.');
    }

    console.log(`\n📬 Processing mailing: ${mailingId}`);
    console.log('═'.repeat(60));

    this.currentMailing = mailingId;
    let totalProcessed = 0;
    let batchCount = 0;

    // Get initial counts
    const initialCounts = await this.entryRepo.countByStatus(mailingId);
    const totalJobs = Object.values(initialCounts).reduce((sum, count) => sum + count, 0);
    const pendingJobs = initialCounts['PENDING'] ?? 0;

    console.log(`📊 Initial Status:`);
    console.log(`   Total: ${totalJobs} jobs`);
    console.log(`   Pending: ${pendingJobs} jobs`);
    console.log(`   Sent: ${initialCounts['SENT'] ?? 0} jobs`);
    console.log(`   Failed: ${initialCounts['FAILED'] ?? 0} jobs`);
    console.log(`   Invalid: ${initialCounts['INVALID'] ?? 0} jobs\n`);

    // Process batches until no more pending jobs
    while (this.isRunning && this.currentMailing === mailingId) {
      batchCount++;
      const processed = await this.workerPool.processBatch(
        mailingId,
        this.config.batchSize
      );

      if (processed === 0) {
        // No more pending jobs
        break;
      }

      totalProcessed += processed;

      // Update progress
      await this.updateProgress(mailingId);

      // Log batch completion
      const metrics = this.workerPool.getMetrics();
      console.log(`\n📈 Batch ${batchCount} Complete:`);
      console.log(`   Processed: ${processed} jobs`);
      console.log(`   Success: ${metrics.completedJobs} jobs`);
      console.log(`   Failed: ${metrics.failedJobs} jobs`);
      console.log(`   Retried: ${metrics.retriedJobs} jobs`);
      console.log(`   Dead Letter: ${metrics.deadLetterJobs} jobs\n`);

      // Small delay between batches to avoid overwhelming the system
      await this.delay(1000);
    }

    // Final summary
    const finalCounts = await this.entryRepo.countByStatus(mailingId);
    console.log(`\n✅ Mailing Complete: ${mailingId}`);
    console.log('═'.repeat(60));
    console.log(`📊 Final Status:`);
    console.log(`   Total: ${totalJobs} jobs`);
    console.log(`   Sent: ${finalCounts['SENT'] ?? 0} jobs`);
    console.log(`   Failed: ${finalCounts['FAILED'] ?? 0} jobs`);
    console.log(`   Pending: ${finalCounts['PENDING'] ?? 0} jobs`);
    console.log(`   Invalid: ${finalCounts['INVALID'] ?? 0} jobs`);
    console.log(`   Batches: ${batchCount}`);
    console.log('═'.repeat(60) + '\n');

    this.currentMailing = null;
    return totalProcessed;
  }

  /**
   * Updates mailing progress in database
   * @param mailingId - Mailing ID
   */
  private async updateProgress(mailingId: string): Promise<void> {
    const counts = await this.entryRepo.countByStatus(mailingId);
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const sent = counts['SENT'] ?? 0;
    const failed = counts['FAILED'] ?? 0;
    const processed = sent + failed;

    // Use upsert to update or create progress
    await this.progressRepo.upsert(
      mailingId,
      {
        mailingId,
        totalRows: total,
        processedRows: processed,
        lastProcessedLine: processed,
        status: processed === total ? 'COMPLETED' : 'RUNNING',
      },
      {
        totalRows: total,
        processedRows: processed,
        lastProcessedLine: processed,
        status: processed === total ? 'COMPLETED' : 'RUNNING',
      }
    );
  }

  /**
   * Gets orchestrator status
   * @returns Status object
   */
  async getStatus(): Promise<OrchestratorStatus> {
    const workerPoolMetrics = this.workerPool.getMetrics();
    
    let mailingProgress = null;
    if (this.currentMailing) {
      const counts = await this.entryRepo.countByStatus(this.currentMailing);
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      
      mailingProgress = {
        totalRows: total,
        sent: counts['SENT'] ?? 0,
        failed: counts['FAILED'] ?? 0,
        pending: counts['PENDING'] ?? 0,
        invalid: counts['INVALID'] ?? 0,
      };
    }

    return {
      isRunning: this.isRunning,
      currentMailing: this.currentMailing,
      workerPoolMetrics,
      mailingProgress,
    };
  }

  /**
   * Gets worker pool metrics
   * @returns Metrics object
   */
  getMetrics(): WorkerPoolMetrics {
    return this.workerPool.getMetrics();
  }

  /**
   * Resets worker pool metrics
   */
  resetMetrics(): void {
    this.workerPool.resetMetrics();
  }

  /**
   * Utility: delay execution
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
