import { prisma } from '../config/database.js';
import type { Mailing } from '@prisma/client';

export interface CreateMailingData {
  id: string;
  filename: string;
  storageUrl?: string;
  status?: string;
  totalLines?: number;
  processedLines?: number;
}

export interface UpdateMailingData {
  status?: string;
  attempts?: number;
  lastAttempt?: Date;
  errorMessage?: string;
  totalLines?: number;
  processedLines?: number;
}

export class MailingRepository {
  /**
   * Creates a new mailing record
   * @param data - Mailing data
   * @returns Created mailing
   */
  async create(data: CreateMailingData): Promise<Mailing> {
    return prisma.mailing.create({
      data: {
        id: data.id,
        filename: data.filename,
        storageUrl: data.storageUrl,
        status: data.status ?? 'PENDING',
        totalLines: data.totalLines,
        processedLines: data.processedLines ?? 0,
      },
    });
  }

  /**
   * Finds a mailing by ID
   * @param id - Mailing ID
   * @returns Mailing or null
   */
  async findById(id: string): Promise<Mailing | null> {
    return prisma.mailing.findUnique({
      where: { id },
    });
  }

  /**
   * Finds a mailing by filename
   * @param filename - Filename
   * @returns Mailing or null
   */
  async findByFilename(filename: string): Promise<Mailing | null> {
    return prisma.mailing.findUnique({
      where: { filename },
    });
  }

  /**
   * Updates a mailing record
   * @param id - Mailing ID
   * @param data - Data to update
   * @returns Updated mailing
   */
  async update(id: string, data: UpdateMailingData): Promise<Mailing> {
    return prisma.mailing.update({
      where: { id },
      data,
    });
  }

  /**
   * Lists mailings with pagination
   * @param skip - Number of records to skip
   * @param take - Number of records to take
   * @param status - Optional status filter
   * @returns Array of mailings
   */
  async list(skip: number, take: number, status?: string): Promise<Mailing[]> {
    return prisma.mailing.findMany({
      where: status ? { status } : undefined,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Counts mailings
   * @param status - Optional status filter
   * @returns Count
   */
  async count(status?: string): Promise<number> {
    return prisma.mailing.count({
      where: status ? { status } : undefined,
    });
  }

  /**
   * Increments the attempts counter
   * @param id - Mailing ID
   * @returns Updated mailing
   */
  async incrementAttempts(id: string): Promise<Mailing> {
    return prisma.mailing.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastAttempt: new Date(),
      },
    });
  }

  /**
   * Updates processing progress
   * @param id - Mailing ID
   * @param processedLines - Number of lines processed
   * @returns Updated mailing
   */
  async updateProgress(id: string, processedLines: number): Promise<Mailing> {
    return prisma.mailing.update({
      where: { id },
      data: { processedLines },
    });
  }

  /**
   * Try to acquire lock on a mailing for processing
   * Uses conditional UPDATE to prevent race conditions
   * @param mailingId - Mailing ID
   * @returns Mailing if lock acquired, null otherwise
   */
  async tryAcquireLock(mailingId: string): Promise<Mailing | null> {
    const staleThreshold = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    
    const result = await prisma.$executeRaw`
      UPDATE mailings
      SET 
        status = 'PROCESSING',
        last_attempt = NOW()
      WHERE id = ${mailingId}::uuid
        AND (
          status IN ('PENDING', 'QUEUED', 'FAILED')
          OR (status = 'PROCESSING' AND (last_attempt IS NULL OR last_attempt < ${staleThreshold}))
        )
    `;

    if (result === 0) {
      return null;
    }

    return await prisma.mailing.findUnique({
      where: { id: mailingId },
    });
  }

  /**
   * Mark mailing as completed
   * @param mailingId - Mailing ID
   * @returns Updated mailing
   */
  async markCompleted(mailingId: string): Promise<Mailing> {
    return await prisma.mailing.update({
      where: { id: mailingId },
      data: {
        status: 'COMPLETED',
        lastAttempt: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark mailing as failed
   * @param mailingId - Mailing ID
   * @param errorMessage - Error message
   * @returns Updated mailing
   */
  async markFailed(mailingId: string, errorMessage: string): Promise<Mailing> {
    return await prisma.mailing.update({
      where: { id: mailingId },
      data: {
        status: 'FAILED',
        errorMessage,
        lastAttempt: null,
        updatedAt: new Date(),
      },
    });
  }
}

export const mailingRepository = new MailingRepository();
