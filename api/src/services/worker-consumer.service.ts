import type { Channel, ConsumeMessage } from 'amqplib';
import { rabbitmqService } from './rabbitmq.service.js';
import { rabbitmqTopologyService } from './rabbitmq-topology.service.js';
import { emailValidationService } from './email-validation.service.js';
import { getRateLimiter } from './rate-limiter.service.js';
import { EmailTestApiProvider } from '../providers/email-test-api.provider.js';
import { logger } from './logger.service.js';
import { prisma } from '../config/database.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parse } from 'csv-parse/sync';

// Initialize email provider with config from environment
const emailProvider = new EmailTestApiProvider({
  baseUrl: process.env.EMAIL_API_BASE_URL ?? 'https://email-test-api-475816.ue.r.appspot.com',
  timeout: 30000,
});

/**
 * Worker Consumer Service
 * 
 * Consumes mailing jobs from RabbitMQ and processes CSV files:
 * 1. Acquires database lock via conditional UPDATE
 * 2. Downloads CSV from storage
 * 3. Processes emails line-by-line with rate limiting
 * 4. Updates progress with checkpoints
 * 5. Handles retries via retry queues
 * 6. Moves to DLQ on max attempts exceeded
 */
export class WorkerConsumerService {
  private channel: Channel | null = null;
  private isRunning = false;
  private readonly PREFETCH: number;
  private readonly CHECKPOINT_INTERVAL: number;
  private readonly MAX_RETRY_ATTEMPTS: number;
  private readonly FAILURE_THRESHOLD: number; // % of failures before marking CSV as failed
  private processedJobs = 0;
  private failedJobs = 0;

  constructor() {
    this.PREFETCH = parseInt(process.env.RABBITMQ_PREFETCH ?? '1', 10);
    this.CHECKPOINT_INTERVAL = parseInt(process.env.CHECKPOINT_INTERVAL ?? '100', 10);
    this.MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS ?? '3', 10);
    this.FAILURE_THRESHOLD = parseFloat(process.env.FAILURE_THRESHOLD ?? '0.2'); // 20%
  }

  /**
   * Starts the worker consumer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Worker consumer already running');
      return;
    }

    try {
      logger.info('🔧 Starting worker consumer...');

      // Ensure RabbitMQ is connected
      if (!rabbitmqService.isConnected()) {
        await rabbitmqService.connect();
        await rabbitmqTopologyService.setupTopology();
      }

      // Get channel from RabbitMQ service
      this.channel = (rabbitmqService as any).channel;

      if (!this.channel) {
        throw new Error('Failed to get RabbitMQ channel');
      }

      // Set prefetch (QoS)
      await this.channel.prefetch(this.PREFETCH);
      logger.info(`✅ Channel prefetch set to ${this.PREFETCH}`);

      // Start consuming from main queue
      const queueNames = rabbitmqTopologyService.getQueueNames();
      await this.channel.consume(
        queueNames.mainQueue,
        (msg) => this.handleMessage(msg),
        { noAck: false } // Manual ACK
      );

      this.isRunning = true;
      logger.info(`🚀 Worker consumer started`);
      logger.info(`   Queue: ${queueNames.mainQueue}`);
      logger.info(`   Prefetch: ${this.PREFETCH}`);
      logger.info(`   Checkpoint interval: ${this.CHECKPOINT_INTERVAL} lines`);
      logger.info(`   Max retry attempts: ${this.MAX_RETRY_ATTEMPTS}`);
      logger.info(`   Failure threshold: ${this.FAILURE_THRESHOLD * 100}%`);
      logger.info('');
    } catch (error) {
      logger.error(`❌ Failed to start worker consumer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handles incoming message from queue
   */
  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) {
      return;
    }

    const startTime = Date.now();
    let jobPayload: any;

    try {
      // Parse message payload
      jobPayload = JSON.parse(msg.content.toString());
      const { mailingId, storageUrl, filename, attempt = 0 } = jobPayload;

      logger.info(`📨 Received job: ${mailingId} (attempt ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`);
      logger.info(`   Filename: ${filename}`);

      // Try to acquire lock via conditional UPDATE
      const lockAcquired = await this.tryAcquireLock(mailingId);

      if (!lockAcquired) {
        logger.info(`⏭️  Job ${mailingId} already being processed or completed - skipping`);
        this.channel.ack(msg);
        return;
      }

      logger.info(`🔒 Lock acquired for ${mailingId}`);

      // Process the CSV
      const result = await this.processCSV(mailingId, storageUrl, filename, attempt);

      if (result.success) {
        // Mark as completed
        await prisma.mailing.update({
          where: { id: mailingId },
          data: {
            status: 'COMPLETED',
            processedLines: result.processedLines,
            updatedAt: new Date(),
          },
        });

        logger.info(`✅ Job ${mailingId} completed successfully`);
        logger.info(`   Processed: ${result.processedLines} lines`);
        logger.info(`   Sent: ${result.sentCount} emails`);
        logger.info(`   Failed: ${result.failedCount} emails`);
        logger.info(`   Duration: ${Date.now() - startTime}ms`);

        this.processedJobs++;
        this.channel.ack(msg);
      } else {
        // Check if should retry
        if (attempt < this.MAX_RETRY_ATTEMPTS - 1) {
          // Republish to retry queue (also updates DB)
          await this.republishToRetry(jobPayload, attempt, result.error);
          logger.info(`🔄 Job ${mailingId} sent to retry queue (attempt ${attempt + 2}/${this.MAX_RETRY_ATTEMPTS})`);
        } else {
          // Max attempts exceeded - move to DLQ (also updates DB and inserts to dead_letters)
          await this.moveToDeadLetter(jobPayload, result.error);
          logger.error(`💀 Job ${mailingId} moved to DLQ after ${this.MAX_RETRY_ATTEMPTS} attempts`);
        }

        this.failedJobs++;
        this.channel.ack(msg); // Always ACK to avoid redelivery loop
      }
    } catch (error) {
      logger.error(`❌ Error handling message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // On unexpected error, NACK and requeue (unless max attempts)
      if (jobPayload && jobPayload.attempt >= this.MAX_RETRY_ATTEMPTS - 1) {
        this.channel.ack(msg); // Prevent infinite loop
      } else {
        this.channel.nack(msg, false, false); // Don't requeue, let DLX handle it
      }
    }
  }

  /**
   * Tries to acquire processing lock via conditional UPDATE
   * Returns true if lock acquired, false if already locked
   */
  private async tryAcquireLock(mailingId: string): Promise<boolean> {
    const result = await prisma.$executeRaw`
      UPDATE mailings
      SET status = 'PROCESSING',
          attempts = attempts + 1,
          last_attempt = NOW()
      WHERE id = ${mailingId}::uuid
        AND status IN ('PENDING', 'QUEUED', 'FAILED')
    `;

    return result > 0;
  }

  /**
   * Processes CSV file: download, validate, send emails
   */
  private async processCSV(
    mailingId: string,
    storageUrl: string,
    filename: string,
    _attempt: number // Prefixed with underscore to indicate intentionally unused
  ): Promise<{
    success: boolean;
    processedLines: number;
    sentCount: number;
    failedCount: number;
    error?: string;
  }> {
    let tempFilePath: string | null = null;
    let processedLines = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
      // 1. Download CSV to temp file (storage URL is local file path)
      logger.info(`📥 Reading CSV from storage: ${filename}`);
      
      // Read file from storage (storageUrl is a local file path)
      const fileContent = await fs.readFile(storageUrl);
      
      // Create temp file for processing
      tempFilePath = path.join(os.tmpdir(), `mailing-${mailingId}-${Date.now()}.csv`);
      await fs.writeFile(tempFilePath, fileContent);
      
      logger.info(`✅ CSV loaded: ${tempFilePath}`);

      // 2. Parse CSV
      const content = await fs.readFile(tempFilePath, 'utf-8');
      const rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<{ email?: string; [key: string]: any }>;

      const totalLines = rows.length;

      await prisma.mailing.update({
        where: { id: mailingId },
        data: { totalLines },
      });

      logger.info(`📊 Total lines: ${totalLines}`);

      // Get rate limiter instance
      const rateLimiter = getRateLimiter();

      // 3. Process each line
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        processedLines++;

        try {
          const email = row.email?.trim();

          if (!email) {
            logger.warn(`⚠️  Line ${i + 1}: Empty email - skipping`);
            failedCount++;
            continue;
          }

          // Validate email (pass mailingId as second parameter)
          const validation = await emailValidationService.validateEmail(email, {
            enableMxCheck: process.env.ENABLE_MX_CHECK === 'true',
            enableDisposableCheck: process.env.ENABLE_DISPOSABLE_CHECK !== 'false', // Default true
          });

          if (!validation.isValid) {
            logger.warn(`⚠️  Line ${i + 1}: Invalid email ${email} - ${validation.reason}`);
            failedCount++;
            continue;
          }

          // Generate unique token and idempotency key
          const token = crypto.randomBytes(16).toString('hex');
          const idempotencyKey = crypto
            .createHash('sha256')
            .update(`${mailingId}-${email}-${token}`)
            .digest('hex');

          // Send email with rate limiting
          await rateLimiter.schedule(async () => {
            try {
              const result = await emailProvider.sendEmail({
                to: email,
                subject: `Your mailing token`,
                body: `Hello! Your token is: ${token}`,
                idempotencyKey,
              });

              if (result.success) {
                sentCount++;
                logger.debug(`✉️  Sent email to ${email} (message_id: ${result.messageId})`);
              } else {
                failedCount++;
                logger.warn(`❌ Failed to send to ${email}: ${result.error}`);
              }
            } catch (sendError) {
              failedCount++;
              logger.error(`❌ Error sending to ${email}: ${sendError instanceof Error ? sendError.message : 'Unknown'}`);
            }
          }, 5); // Normal priority

          // Checkpoint progress
          if (processedLines % this.CHECKPOINT_INTERVAL === 0) {
            await prisma.mailing.update({
              where: { id: mailingId },
              data: { processedLines },
            });
            logger.info(`📍 Checkpoint: ${processedLines}/${totalLines} lines processed`);
          }
        } catch (lineError) {
          logger.error(`❌ Error processing line ${i + 1}: ${lineError instanceof Error ? lineError.message : 'Unknown'}`);
          failedCount++;
        }
      }

      // Final checkpoint
      await prisma.mailing.update({
        where: { id: mailingId },
        data: { processedLines },
      });

      // Check failure threshold
      const failureRate = failedCount / totalLines;
      if (failureRate > this.FAILURE_THRESHOLD) {
        logger.error(`❌ Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(this.FAILURE_THRESHOLD * 100).toFixed(1)}%`);
        return {
          success: false,
          processedLines,
          sentCount,
          failedCount,
          error: `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold`,
        };
      }

      return {
        success: true,
        processedLines,
        sentCount,
        failedCount,
      };
    } catch (error) {
      logger.error(`❌ Error processing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Update mailing with error
      await prisma.mailing.update({
        where: { id: mailingId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          processedLines,
        },
      }).catch((e: any) => logger.error(`Failed to update mailing: ${e}`));

      return {
        success: false,
        processedLines,
        sentCount,
        failedCount,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Cleanup temp file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
          logger.debug(`🗑️  Temp file deleted: ${tempFilePath}`);
        } catch (unlinkError) {
          logger.warn(`⚠️  Failed to delete temp file: ${tempFilePath}`);
        }
      }
    }
  }

  /**
   * Republishes job to retry queue with incremented attempt
   * Also updates mailings.attempts in database
   */
  private async republishToRetry(jobPayload: any, currentAttempt: number, error?: string): Promise<void> {
    const queueNames = rabbitmqTopologyService.getQueueNames();
    const { mailingId } = jobPayload;
    const nextAttempt = currentAttempt + 1;
    
    try {
      // 1. Update mailings.attempts in database
      await prisma.mailing.update({
        where: { id: mailingId },
        data: {
          attempts: nextAttempt,
          lastAttempt: new Date(),
          status: 'FAILED', // Mark as FAILED while waiting for retry
          errorMessage: error || 'Processing failed, will retry',
          updatedAt: new Date(),
        },
      });

      logger.info(`📝 Updated mailing attempts: ${nextAttempt}/${this.MAX_RETRY_ATTEMPTS}`);

      // 2. Choose retry queue based on attempt
      const retryQueue = nextAttempt === 1 ? queueNames.retry1Queue : queueNames.retry2Queue;
      const retryDelay = nextAttempt === 1 ? '60s' : '5min';

      // 3. Prepare updated payload with attempt counter
      const updatedPayload = {
        ...jobPayload,
        attempt: nextAttempt,
        lastError: error,
        retriedAt: new Date().toISOString(),
      };

      if (!this.channel) {
        throw new Error('Channel not available');
      }

      // 4. Publish directly to retry queue (no exchange needed)
      const content = Buffer.from(JSON.stringify(updatedPayload));
      this.channel.sendToQueue(retryQueue, content, {
        persistent: true,
        timestamp: Date.now(),
      });

      logger.info(`📤 Published to ${retryQueue} (attempt ${nextAttempt}/${this.MAX_RETRY_ATTEMPTS})`);
      logger.info(`   Delay: ${retryDelay} (TTL)`);
      logger.info(`   Error: ${error || 'Unknown'}`);
    } catch (dbError) {
      logger.error(`❌ Failed to republish to retry: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      throw dbError;
    }
  }

  /**
   * Moves job to dead letter queue and inserts into dead_letters table
   */
  private async moveToDeadLetter(jobPayload: any, error?: string): Promise<void> {
    const queueNames = rabbitmqTopologyService.getQueueNames();
    const { mailingId, filename } = jobPayload;

    try {
      // 1. Insert into dead_letters table for audit
      await prisma.deadLetter.create({
        data: {
          mailingId,
          email: filename, // Using filename as identifier (not individual email)
          reason: error || 'Max retry attempts exceeded',
          attempts: this.MAX_RETRY_ATTEMPTS,
          lastError: error || 'Unknown error',
        },
      });

      logger.info(`📝 Inserted into dead_letters table: ${mailingId}`);

      // 2. Update mailing status to FAILED
      await prisma.mailing.update({
        where: { id: mailingId },
        data: {
          status: 'FAILED',
          errorMessage: error || 'Max retry attempts exceeded',
          updatedAt: new Date(),
        },
      });

      // 3. Publish to DLQ for manual inspection
      const dlqPayload = {
        ...jobPayload,
        finalError: error,
        movedToDLQAt: new Date().toISOString(),
        totalAttempts: this.MAX_RETRY_ATTEMPTS,
      };

      if (!this.channel) {
        throw new Error('Channel not available');
      }

      const content = Buffer.from(JSON.stringify(dlqPayload));
      this.channel.sendToQueue(queueNames.dlq, content, {
        persistent: true,
        timestamp: Date.now(),
      });

      logger.info(`💀 Moved to DLQ: ${mailingId}`);
      logger.info(`   Reason: ${error || 'Max retry attempts exceeded'}`);
      logger.info(`   Total attempts: ${this.MAX_RETRY_ATTEMPTS}`);
    } catch (dbError) {
      logger.error(`❌ Failed to move to DLQ: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      throw dbError;
    }
  }

  /**
   * Stops the worker consumer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping worker consumer...');
    this.isRunning = false;

    // Channel will be closed by RabbitMQ service
    this.channel = null;

    logger.info('✅ Worker consumer stopped');
    logger.info(`   Total jobs processed: ${this.processedJobs}`);
    logger.info(`   Total jobs failed: ${this.failedJobs}`);
  }

  /**
   * Gets worker statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      prefetch: this.PREFETCH,
      checkpointInterval: this.CHECKPOINT_INTERVAL,
      maxRetryAttempts: this.MAX_RETRY_ATTEMPTS,
      failureThreshold: this.FAILURE_THRESHOLD,
    };
  }
}

// Export singleton instance
export const workerConsumerService = new WorkerConsumerService();
