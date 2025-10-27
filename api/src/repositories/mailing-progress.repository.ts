import { prisma } from '../config/database.js';

type MailingProgress = {
  mailingId: string;
  totalRows: number;
  processedRows: number;
  lastProcessedLine: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateMailingProgressData {
  mailingId: string;
  totalRows: number;
  processedRows: number;
  lastProcessedLine: number;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
}

export interface UpdateMailingProgressData {
  totalRows?: number;
  processedRows?: number;
  lastProcessedLine?: number;
  status?: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
}

export class MailingProgressRepository {
  /**
   * Creates or updates mailing progress
   * @param mailingId - Mailing ID
   * @param data - Progress data
   * @returns Created or updated progress
   */
  async upsert(
    mailingId: string,
    createData: CreateMailingProgressData,
    updateData: UpdateMailingProgressData
  ): Promise<MailingProgress> {
    return prisma.mailingProgress.upsert({
      where: { mailingId },
      create: createData,
      update: updateData,
    });
  }

  /**
   * Finds progress by mailing ID
   * @param mailingId - Mailing ID
   * @returns Progress or null
   */
  async findByMailingId(mailingId: string): Promise<MailingProgress | null> {
    return prisma.mailingProgress.findUnique({
      where: { mailingId },
    });
  }

  /**
   * Updates mailing progress
   * @param mailingId - Mailing ID
   * @param data - Data to update
   * @returns Updated progress
   */
  async update(
    mailingId: string,
    data: UpdateMailingProgressData
  ): Promise<MailingProgress> {
    return prisma.mailingProgress.update({
      where: { mailingId },
      data,
    });
  }

  /**
   * Creates new progress record
   * @param data - Progress data
   * @returns Created progress
   */
  async create(data: CreateMailingProgressData): Promise<MailingProgress> {
    return prisma.mailingProgress.create({
      data,
    });
  }

  /**
   * Updates progress incrementally
   * @param mailingId - Mailing ID
   * @param processedRows - Number of rows processed
   * @param lastProcessedLine - Last line number processed
   * @param totalRows - Optional total rows update
   */
  async updateProgress(
    mailingId: string,
    processedRows: number,
    lastProcessedLine: number,
    totalRows?: number
  ): Promise<MailingProgress> {
    return this.upsert(
      mailingId,
      {
        mailingId,
        totalRows: totalRows ?? 0,
        processedRows,
        lastProcessedLine,
        status: 'RUNNING',
      },
      {
        processedRows,
        lastProcessedLine,
        ...(totalRows !== undefined && { totalRows }),
      }
    );
  }

  /**
   * Marks mailing as completed or failed
   * @param mailingId - Mailing ID
   * @param totalRows - Total rows processed
   * @param status - Final status
   */
  async complete(
    mailingId: string,
    totalRows: number,
    status: 'COMPLETED' | 'FAILED'
  ): Promise<MailingProgress> {
    return this.upsert(
      mailingId,
      {
        mailingId,
        totalRows,
        processedRows: totalRows,
        lastProcessedLine: totalRows,
        status,
      },
      {
        totalRows,
        processedRows: totalRows,
        status,
      }
    );
  }

  /**
   * Finds all active mailings (RUNNING or PAUSED)
   * @returns Array of active progress records
   */
  async findActive(): Promise<MailingProgress[]> {
    return prisma.mailingProgress.findMany({
      where: {
        status: {
          in: ['RUNNING', 'PAUSED'],
        },
      },
      orderBy: {
        mailingId: 'asc',
      },
    });
  }

  /**
   * Deletes progress record
   * @param mailingId - Mailing ID
   */
  async delete(mailingId: string): Promise<void> {
    await prisma.mailingProgress.delete({
      where: { mailingId },
    });
  }
}

export const mailingProgressRepository = new MailingProgressRepository();
