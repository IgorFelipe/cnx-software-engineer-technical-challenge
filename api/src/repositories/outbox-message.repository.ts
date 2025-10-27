import { prisma } from '../config/database.js';
import type { OutboxMessage } from '@prisma/client';

export interface CreateOutboxMessageData {
  id: string;
  mailingId: string;
  targetQueue: string;
  payload: any; // JSON payload
}

export interface UpdateOutboxMessageData {
  attempts?: number;
  published?: boolean;
  publishedAt?: Date;
  lastError?: string;
}

export class OutboxMessageRepository {
  /**
   * Creates a new outbox message
   * @param data - Outbox message data
   * @returns Created outbox message
   */
  async create(data: CreateOutboxMessageData): Promise<OutboxMessage> {
    return prisma.outboxMessage.create({
      data: {
        id: data.id,
        mailingId: data.mailingId,
        targetQueue: data.targetQueue,
        payload: data.payload,
      },
    });
  }

  /**
   * Finds an outbox message by ID
   * @param id - Outbox message ID
   * @returns Outbox message or null
   */
  async findById(id: string): Promise<OutboxMessage | null> {
    return prisma.outboxMessage.findUnique({
      where: { id },
    });
  }

  /**
   * Finds unpublished messages
   * @param limit - Maximum number of messages to return
   * @returns Array of unpublished messages
   */
  async findUnpublished(limit: number = 100): Promise<OutboxMessage[]> {
    return prisma.outboxMessage.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Finds messages by mailing ID
   * @param mailingId - Mailing ID
   * @returns Array of outbox messages
   */
  async findByMailingId(mailingId: string): Promise<OutboxMessage[]> {
    return prisma.outboxMessage.findMany({
      where: { mailingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Updates an outbox message
   * @param id - Outbox message ID
   * @param data - Data to update
   * @returns Updated outbox message
   */
  async update(id: string, data: UpdateOutboxMessageData): Promise<OutboxMessage> {
    return prisma.outboxMessage.update({
      where: { id },
      data,
    });
  }

  /**
   * Marks a message as published
   * @param id - Outbox message ID
   * @returns Updated outbox message
   */
  async markAsPublished(id: string): Promise<OutboxMessage> {
    return prisma.outboxMessage.update({
      where: { id },
      data: {
        published: true,
        publishedAt: new Date(),
      },
    });
  }

  /**
   * Increments the attempts counter
   * @param id - Outbox message ID
   * @param error - Optional error message
   * @returns Updated outbox message
   */
  async incrementAttempts(id: string, error?: string): Promise<OutboxMessage> {
    return prisma.outboxMessage.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error,
      },
    });
  }

  /**
   * Counts unpublished messages
   * @returns Count of unpublished messages
   */
  async countUnpublished(): Promise<number> {
    return prisma.outboxMessage.count({
      where: { published: false },
    });
  }

  /**
   * Deletes an outbox message
   * @param id - Outbox message ID
   */
  async delete(id: string): Promise<void> {
    await prisma.outboxMessage.delete({
      where: { id },
    });
  }
}

export const outboxMessageRepository = new OutboxMessageRepository();
