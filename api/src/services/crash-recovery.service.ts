/**
 * Crash Recovery Service
 * 
 * Handles recovery of interrupted work on application startup:
 * - Detects stale SENDING jobs (likely from crashes/restarts)
 * - Re-queues them for processing
 * - Provides detailed logging for monitoring
 */

import { config } from '../config/env.js';
import { mailingEntryRepository } from '../repositories/mailing-entry.repository.js';
import { mailingProgressRepository } from '../repositories/mailing-progress.repository.js';

export interface CrashRecoveryResult {
  staleJobsFound: number;
  staleJobsRecovered: number;
  staleMailingsFound: number;
  staleMailingsRecovered: number;
  errors: string[];
}

export class CrashRecoveryService {
  private readonly staleSendingThresholdMs: number;

  constructor(staleSendingThresholdMs?: number) {
    this.staleSendingThresholdMs = staleSendingThresholdMs ?? config.staleSendingThresholdMs;
  }

  /**
   * Recovers all stale jobs and mailings on application startup
   * @returns Recovery result with statistics
   */
  async recoverOnBoot(): Promise<CrashRecoveryResult> {
    console.log('🔄 Starting crash recovery check...');
    
    const result: CrashRecoveryResult = {
      staleJobsFound: 0,
      staleJobsRecovered: 0,
      staleMailingsFound: 0,
      staleMailingsRecovered: 0,
      errors: [],
    };

    try {
      // Step 1: Recover stale email sending jobs
      const jobRecovery = await this.recoverStaleJobs();
      result.staleJobsFound = jobRecovery.found;
      result.staleJobsRecovered = jobRecovery.recovered;
      
      // Step 2: Recover stale CSV processing mailings
      const mailingRecovery = await this.recoverStaleMailings();
      result.staleMailingsFound = mailingRecovery.found;
      result.staleMailingsRecovered = mailingRecovery.recovered;
      
      // Log summary
      this.logRecoverySummary(result);
      
    } catch (error) {
      const errorMsg = `Crash recovery failed: ${error}`;
      console.error('❌', errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Recovers stale email sending jobs (SENDING status)
   * Jobs stuck in SENDING status are likely from crashes
   */
  private async recoverStaleJobs(): Promise<{ found: number; recovered: number }> {
    const thresholdDate = new Date(Date.now() - this.staleSendingThresholdMs);
    
    console.log(`🔍 Checking for stale SENDING jobs (threshold: ${this.formatDuration(this.staleSendingThresholdMs)})`);
    console.log(`   Looking for jobs with last_attempt before: ${thresholdDate.toISOString()}`);

    try {
      // Find all jobs in SENDING status with old last_attempt
      const staleJobs = await mailingEntryRepository.findStaleJobs(
        'SENDING',
        thresholdDate
      );

      if (staleJobs.length === 0) {
        console.log('✅ No stale SENDING jobs found');
        return { found: 0, recovered: 0 };
      }

      console.log(`⚠️  Found ${staleJobs.length} stale SENDING jobs`);

      // Log details of stale jobs
      for (const job of staleJobs.slice(0, 10)) { // Log first 10
        const staleDuration = Date.now() - new Date(job.lastAttempt!).getTime();
        console.log(`   - Job ${job.id}: ${job.email}`);
        console.log(`     Mailing: ${job.mailingId}`);
        console.log(`     Last attempt: ${new Date(job.lastAttempt!).toISOString()} (${this.formatDuration(staleDuration)} ago)`);
        console.log(`     Attempts: ${job.attempts}`);
      }

      if (staleJobs.length > 10) {
        console.log(`   ... and ${staleJobs.length - 10} more`);
      }

      // Reset stale jobs to PENDING for re-processing
      const recovered = await mailingEntryRepository.resetStaleJobs(
        'SENDING',
        thresholdDate
      );

      console.log(`✅ Reset ${recovered} stale jobs to PENDING for re-processing`);

      return { found: staleJobs.length, recovered };

    } catch (error) {
      console.error('❌ Failed to recover stale jobs:', error);
      throw error;
    }
  }

  /**
   * Recovers stale CSV processing mailings (RUNNING/PROCESSING status)
   * Mailings stuck in these statuses may need recovery and re-queueing
   */
  private async recoverStaleMailings(): Promise<{ found: number; recovered: number }> {
    console.log('\n🔍 Checking for stale CSV processing (RUNNING/PROCESSING mailings)...');

    try {
      const { prisma } = await import('../config/database.js');
      const thresholdDate = new Date(Date.now() - this.staleSendingThresholdMs);

      // Check mailings table for PROCESSING status (current system)
      const staleProcessingMailings = await prisma.mailing.findMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: thresholdDate },
        },
      });

      // Check mailing_progress table for RUNNING status (legacy system)
      const staleRunningMailings = await mailingProgressRepository.findActive();
      const actuallyStaleRunning = staleRunningMailings.filter(m => {
        const updatedAt = new Date(m.updatedAt);
        return updatedAt < thresholdDate && m.status === 'RUNNING';
      });

      const totalStale = staleProcessingMailings.length + actuallyStaleRunning.length;

      if (totalStale === 0) {
        console.log('✅ No stale PROCESSING/RUNNING mailings found');
        return { found: 0, recovered: 0 };
      }

      console.log(`⚠️  Found ${totalStale} stale mailings (${staleProcessingMailings.length} PROCESSING, ${actuallyStaleRunning.length} RUNNING)`);

      let recovered = 0;

      // Recover PROCESSING mailings by re-queueing them
      for (const mailing of staleProcessingMailings) {
        const staleDuration = Date.now() - new Date(mailing.updatedAt).getTime();
        const progressPercent = (mailing.totalLines && mailing.totalLines > 0)
          ? ((mailing.processedLines / mailing.totalLines) * 100).toFixed(2)
          : 0;

        console.log(`   - Mailing ${mailing.id}:`);
        console.log(`     Status: PROCESSING`);
        console.log(`     Progress: ${mailing.processedLines}/${mailing.totalLines} (${progressPercent}%)`);
        console.log(`     Last update: ${new Date(mailing.updatedAt).toISOString()} (${this.formatDuration(staleDuration)} ago)`);

        // Keep status as PROCESSING but reset last_attempt timestamp
        // This allows the worker to pick it up via the stale job detection in tryAcquireLock
        // The original message is likely still in RabbitMQ queue, so we don't create duplicates
        await prisma.mailing.update({
          where: { id: mailing.id },
          data: { 
            // Keep status as PROCESSING - worker will detect it's stale and retry
            lastAttempt: null, // Reset to allow immediate retry
            // Keep progress so worker can resume from checkpoint
          },
        });

        console.log(`     ✅ Reset lastAttempt to allow worker retry (message still in queue)`);
        console.log(`     ℹ️  Worker will detect stale PROCESSING status and resume job`);

        recovered++;
      }

      // Recover RUNNING mailings (legacy) by marking as PAUSED
      for (const mailing of actuallyStaleRunning) {
        const staleDuration = Date.now() - new Date(mailing.updatedAt).getTime();
        const progressPercent = mailing.totalRows > 0
          ? ((mailing.processedRows / mailing.totalRows) * 100).toFixed(2)
          : 0;

        console.log(`   - Mailing ${mailing.mailingId}:`);
        console.log(`     Status: RUNNING (legacy)`);
        console.log(`     Progress: ${mailing.processedRows}/${mailing.totalRows} (${progressPercent}%)`);
        console.log(`     Last line: ${mailing.lastProcessedLine}`);
        console.log(`     Last update: ${new Date(mailing.updatedAt).toISOString()} (${this.formatDuration(staleDuration)} ago)`);

        await mailingProgressRepository.update(mailing.mailingId, {
          status: 'PAUSED',
        });
        recovered++;
      }

      console.log(`✅ Recovered ${recovered} stale mailings (reset to PENDING/PAUSED for re-processing)`);

      return { found: totalStale, recovered };

    } catch (error) {
      console.error('❌ Failed to recover stale mailings:', error);
      throw error;
    }
  }

  /**
   * Logs recovery summary
   */
  private logRecoverySummary(result: CrashRecoveryResult): void {
    console.log('\n📊 Crash Recovery Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📧 Email Sending Jobs:');
    console.log(`   Stale jobs found: ${result.staleJobsFound}`);
    console.log(`   Jobs recovered: ${result.staleJobsRecovered}`);
    
    if (result.staleJobsRecovered > 0) {
      console.log(`   ✅ ${result.staleJobsRecovered} jobs re-queued for sending`);
    } else {
      console.log('   ✅ No recovery needed');
    }

    console.log('\n📄 CSV Processing:');
    console.log(`   Stale mailings found: ${result.staleMailingsFound}`);
    console.log(`   Mailings recovered: ${result.staleMailingsRecovered}`);
    
    if (result.staleMailingsRecovered > 0) {
      console.log(`   ⚠️  ${result.staleMailingsRecovered} mailings marked as PAUSED`);
      console.log('   💡 Use resumeCsvProcessing() to continue these mailings');
    } else {
      console.log('   ✅ No recovery needed');
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors during recovery:');
      result.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Crash recovery complete\n');
  }

  /**
   * Formats duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Checks if recovery is needed without performing it
   * Useful for health checks
   */
  async checkRecoveryNeeded(): Promise<{
    staleJobsCount: number;
    staleMailingsCount: number;
    needsRecovery: boolean;
  }> {
    const thresholdDate = new Date(Date.now() - this.staleSendingThresholdMs);
    
    const staleJobs = await mailingEntryRepository.findStaleJobs('SENDING', thresholdDate);
    const allMailings = await mailingProgressRepository.findActive();
    const staleMailings = allMailings.filter(m => {
      const updatedAt = new Date(m.updatedAt);
      return updatedAt < thresholdDate && m.status === 'RUNNING';
    });

    return {
      staleJobsCount: staleJobs.length,
      staleMailingsCount: staleMailings.length,
      needsRecovery: staleJobs.length > 0 || staleMailings.length > 0,
    };
  }
}

// Singleton instance
export const crashRecoveryService = new CrashRecoveryService();
