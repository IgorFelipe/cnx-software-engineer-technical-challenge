import { randomUUID } from 'crypto';
import { prisma } from '../config/database.js';
import { logger } from './logger.service.js';

export interface CreateMailingWithOutboxParams {
  mailingId: string;
  filename: string;
  storageUrl: string;
  totalLines?: number;
  targetQueue: string;
}

export interface MailingWithOutboxResult {
  mailingId: string;
  outboxMessageId: string;
}

/**
 * Service for managing outbox pattern operations
 * Ensures atomicity between mailing creation and message queuing
 */
export class OutboxService {
  /**
   * Creates a mailing and outbox message in a single transaction
   * This ensures atomicity - either both succeed or both fail
   * 
   * @param params - Mailing and outbox parameters
   * @returns Created mailing and outbox message IDs
   */
  async createMailingWithOutbox(
    params: CreateMailingWithOutboxParams
  ): Promise<MailingWithOutboxResult> {
    const { mailingId, filename, storageUrl, totalLines, targetQueue } = params;
    const outboxMessageId = randomUUID();

    logger.info(`📦 Creating mailing with outbox: ${mailingId} - ${filename}`);

    try {
      // Execute in transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx: any) => {
        // 1. Insert mailing record with PENDING status
        const mailing = await tx.mailing.create({
          data: {
            id: mailingId,
            filename,
            storageUrl,
            status: 'PENDING',
            totalLines,
            processedLines: 0,
            attempts: 0,
          },
        });

        // 2. Insert outbox message with payload
        const outboxMessage = await tx.outboxMessage.create({
          data: {
            id: outboxMessageId,
            mailingId: mailing.id,
            targetQueue,
            payload: {
              mailingId: mailing.id,
              filename: mailing.filename,
              storageUrl: mailing.storageUrl,
              attempt: 0,
              createdAt: new Date().toISOString(),
            },
            attempts: 0,
            published: false,
          },
        });

        return {
          mailing,
          outboxMessage,
        };
      });

      logger.info(`✅ Mailing and outbox message created: ${result.mailing.id}`);

      return {
        mailingId: result.mailing.id,
        outboxMessageId: result.outboxMessage.id,
      };
    } catch (error) {
      logger.error(`❌ Failed to create mailing with outbox: ${mailingId} - ${error instanceof Error ? error.message : 'Unknown error'}`);

      throw error;
    }
  }

  /**
   * Checks if a mailing already exists by filename
   * Prevents duplicate uploads
   * 
   * @param filename - Filename to check
   * @returns True if exists, false otherwise
   */
  async mailingExists(filename: string): Promise<boolean> {
    const existing = await prisma.mailing.findUnique({
      where: { filename },
    });
    return !!existing;
  }

  /**
   * Gets unpublished outbox messages count
   * Useful for monitoring
   * 
   * @returns Count of unpublished messages
   */
  async getUnpublishedCount(): Promise<number> {
    return prisma.outboxMessage.count({
      where: { published: false },
    });
  }

  /**
   * Gets unpublished outbox messages
   * Used by the outbox publisher to fetch messages for publishing
   * 
   * @param limit - Maximum number of messages to fetch
   * @returns Array of unpublished messages
   */
  async getUnpublishedMessages(limit: number = 100) {
    return prisma.outboxMessage.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        mailing: true,
      },
    });
  }
}

// Export singleton instance
export const outboxService = new OutboxService();
