import { outboxMessageRepository } from '../repositories/outbox-message.repository.js';
import { rabbitmqService } from './rabbitmq.service.js';
import { rabbitmqTopologyService } from './rabbitmq-topology.service.js';
import { logger } from './logger.service.js';

// Outbox message type
interface OutboxMessage {
  id: string;
  mailingId: string;
  targetQueue: string;
  payload: any;
  attempts: number;
  published: boolean;
  publishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Outbox Publisher Service
 * 
 * Background service that continuously polls unpublished messages
 * from the outbox and publishes them to RabbitMQ with confirms.
 * 
 * Features:
 * - Publisher confirms (waits for broker acknowledgment)
 * - Automatic retry with exponential backoff
 * - Error handling and logging
 * - Graceful shutdown support
 */
export class OutboxPublisherService {
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS: number;
  private readonly BATCH_SIZE: number;
  private readonly MAX_ATTEMPTS: number;
  private readonly EXCHANGE = 'mailings';
  private publishCount = 0;
  private errorCount = 0;

  constructor() {
    this.POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '5000', 10);
    this.BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE ?? '10', 10);
    this.MAX_ATTEMPTS = parseInt(process.env.OUTBOX_MAX_ATTEMPTS ?? '5', 10);
  }

  /**
   * Starts the outbox publisher background service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️  Outbox publisher already running');
      return;
    }

    try {
      // Connect to RabbitMQ
      await rabbitmqService.connect();

      // Setup complete topology (exchange, queues, bindings)
      await rabbitmqTopologyService.setupTopology();

      this.isRunning = true;
      logger.info('🚀 Outbox publisher started');
      logger.info(`   Poll interval: ${this.POLL_INTERVAL_MS}ms`);
      logger.info(`   Batch size: ${this.BATCH_SIZE}`);
      logger.info(`   Max attempts: ${this.MAX_ATTEMPTS}`);

      // Start polling loop
      this.scheduleNextPoll();
    } catch (error) {
      logger.error(`❌ Failed to start outbox publisher: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Schedules the next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollInterval = setTimeout(() => {
      this.poll().catch((error) => {
        logger.error(`❌ Poll error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Polls for unpublished messages and publishes them
   */
  private async poll(): Promise<void> {
    try {
      // Check RabbitMQ connection
      if (!rabbitmqService.isConnected()) {
        logger.warn('⚠️  RabbitMQ not connected, skipping poll');
        this.scheduleNextPoll();
        return;
      }

      // Get unpublished messages
      const messages = await outboxMessageRepository.findUnpublished(this.BATCH_SIZE);

      if (messages.length === 0) {
        // No messages to publish
        this.scheduleNextPoll();
        return;
      }

      logger.info(`📬 Found ${messages.length} unpublished messages`);

      // Process each message
      for (const message of messages) {
        await this.publishMessage(message);
      }

      logger.info(`✅ Batch complete: ${messages.length} messages processed`);
    } catch (error) {
      logger.error(`❌ Error in poll cycle: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.errorCount++;
    } finally {
      // Schedule next poll
      this.scheduleNextPoll();
    }
  }

  /**
   * Publishes a single outbox message to RabbitMQ
   */
  private async publishMessage(message: OutboxMessage): Promise<void> {
    try {
      logger.info(`📤 Publishing message ${message.id} (attempt ${message.attempts + 1}/${this.MAX_ATTEMPTS})`);

      // Check if max attempts reached
      if (message.attempts >= this.MAX_ATTEMPTS) {
        logger.error(`❌ Message ${message.id} exceeded max attempts (${this.MAX_ATTEMPTS}), moving to dead letter`);
        await this.moveToDeadLetter(message);
        return;
      }

      // Publish with confirm
      await rabbitmqService.publishWithConfirm(
        this.EXCHANGE,
        message.targetQueue,
        message.payload,
        {
          messageId: message.id,
          persistent: true,
        }
      );

      // Mark as published
      await outboxMessageRepository.markAsPublished(message.id);
      
      this.publishCount++;
      logger.info(`✅ Message ${message.id} published and confirmed`);
    } catch (error) {
      // Increment attempts and log error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Failed to publish message ${message.id}: ${errorMessage}`);

      try {
        await outboxMessageRepository.incrementAttempts(message.id, errorMessage);
      } catch (updateError) {
        logger.error(`❌ Failed to update message ${message.id} attempts: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
      }

      this.errorCount++;
    }
  }

  /**
   * Moves a failed message to the dead letter table
   */
  private async moveToDeadLetter(message: OutboxMessage): Promise<void> {
    try {
      const { prisma } = await import('../config/database.js');

      await prisma.outboxDeadLetter.create({
        data: {
          mailingId: message.mailingId,
          error: message.lastError ?? 'Max attempts exceeded',
          attempts: message.attempts,
          payload: message.payload,
        },
      });

      // Delete from outbox
      await outboxMessageRepository.delete(message.id);

      logger.info(`💀 Message ${message.id} moved to dead letter`);
    } catch (error) {
      logger.error(`❌ Failed to move message ${message.id} to dead letter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stops the outbox publisher service
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping outbox publisher...');
    this.isRunning = false;

    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }

    // Close RabbitMQ connection
    await rabbitmqService.close();

    logger.info('✅ Outbox publisher stopped');
    logger.info(`   Total published: ${this.publishCount}`);
    logger.info(`   Total errors: ${this.errorCount}`);
  }

  /**
   * Gets publisher statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      publishCount: this.publishCount,
      errorCount: this.errorCount,
      pollIntervalMs: this.POLL_INTERVAL_MS,
      batchSize: this.BATCH_SIZE,
      maxAttempts: this.MAX_ATTEMPTS,
    };
  }
}

// Export singleton instance
export const outboxPublisher = new OutboxPublisherService();
