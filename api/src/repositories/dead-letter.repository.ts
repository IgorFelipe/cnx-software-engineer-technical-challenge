import { prisma } from '../config/database.js';

type DeadLetter = {
  id: string;
  mailingId: string;
  email: string;
  reason: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateDeadLetterData {
  mailingId: string;
  email: string;
  reason: string;
  attempts: number;
  lastError?: string;
}

export class DeadLetterRepository {
  /**
   * Creates a new dead letter record
   * @param data - Dead letter data
   * @returns Created dead letter
   */
  async create(data: CreateDeadLetterData): Promise<DeadLetter> {
    return prisma.deadLetter.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Finds dead letters for a mailing
   * @param mailingId - Mailing ID
   * @returns Array of dead letters
   */
  async findByMailing(mailingId: string): Promise<DeadLetter[]> {
    return prisma.deadLetter.findMany({
      where: { mailingId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Finds a dead letter by mailing and email
   * @param mailingId - Mailing ID
   * @param email - Email address
   * @returns Dead letter or null
   */
  async findByMailingAndEmail(
    mailingId: string,
    email: string
  ): Promise<DeadLetter | null> {
    return prisma.deadLetter.findFirst({
      where: {
        mailingId,
        email,
      },
    });
  }

  /**
   * Counts dead letters for a mailing
   * @param mailingId - Mailing ID
   * @returns Total count
   */
  async count(mailingId: string): Promise<number> {
    return prisma.deadLetter.count({
      where: { mailingId },
    });
  }

  /**
   * Updates a dead letter (increments attempts)
   * @param id - Dead letter ID
   * @param lastError - Latest error message
   * @returns Updated dead letter
   */
  async incrementAttempts(id: string, lastError: string): Promise<DeadLetter> {
    return prisma.deadLetter.update({
      where: { id },
      data: {
        attempts: {
          increment: 1,
        },
        lastError,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Deletes all dead letters for a mailing
   * @param mailingId - Mailing ID
   * @returns Number of deleted records
   */
  async deleteByMailing(mailingId: string): Promise<number> {
    const result = await prisma.deadLetter.deleteMany({
      where: { mailingId },
    });
    return result.count;
  }

  /**
   * Finds dead letters by reason
   * @param reason - Reason filter
   * @param limit - Maximum number to return
   * @returns Array of dead letters
   */
  async findByReason(reason: string, limit = 100): Promise<DeadLetter[]> {
    return prisma.deadLetter.findMany({
      where: { reason },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }
}

export const deadLetterRepository = new DeadLetterRepository();
