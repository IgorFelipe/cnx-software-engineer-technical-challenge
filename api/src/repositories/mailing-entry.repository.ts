import { prisma } from '../config/database.js';

type MailingEntry = {
  id: string;
  mailingId: string;
  email: string;
  token: string;
  status: string;
  attempts: number;
  lastAttempt: Date | null;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateMailingEntryData {
  id: string;
  mailingId: string;
  email: string;
  token: string;
  status?: string;
  attempts?: number;
  invalidReason?: string | null;
  validationDetails?: string | null;
}

export interface UpdateMailingEntryData {
  status?: string;
  attempts?: number;
  lastAttempt?: Date;
  externalId?: string;
}

export class MailingEntryRepository {
  /**
   * Creates multiple mailing entries in a single transaction
   * @param entries - Array of entries to create
   * @param skipDuplicates - Whether to skip duplicate entries
   * @returns Number of entries created
   */
  async createMany(
    entries: CreateMailingEntryData[],
    skipDuplicates = true
  ): Promise<number> {
    const data = entries.map((entry) => ({
      id: entry.id,
      mailingId: entry.mailingId,
      email: entry.email,
      token: entry.token,
      status: entry.status ?? 'PENDING',
      attempts: entry.attempts ?? 0,
      invalidReason: entry.invalidReason ?? null,
      validationDetails: entry.validationDetails ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await prisma.mailingEntry.createMany({
      data,
      skipDuplicates,
    });

    return result.count;
  }

  /**
   * Finds a single mailing entry
   * @param mailingId - Mailing ID
   * @param email - Email address
   * @returns Mailing entry or null
   */
  async findByMailingAndEmail(
    mailingId: string,
    email: string
  ): Promise<MailingEntry | null> {
    return prisma.mailingEntry.findUnique({
      where: {
        unique_mailing_email: {
          mailingId,
          email,
        },
      },
    });
  }

  /**
   * Finds all entries for a mailing
   * @param mailingId - Mailing ID
   * @param status - Optional status filter
   * @returns Array of mailing entries
   */
  async findByMailing(
    mailingId: string,
    status?: string
  ): Promise<MailingEntry[]> {
    return prisma.mailingEntry.findMany({
      where: {
        mailingId,
        ...(status && { status }),
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Updates a mailing entry
   * @param id - Entry ID
   * @param data - Data to update
   * @returns Updated entry
   */
  async update(id: string, data: UpdateMailingEntryData): Promise<MailingEntry> {
    return prisma.mailingEntry.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Groups entries by status for a mailing
   * @param mailingId - Mailing ID
   * @returns Object with status counts
   */
  async countByStatus(mailingId: string): Promise<Record<string, number>> {
    const results = await prisma.mailingEntry.groupBy({
      by: ['status'],
      where: { mailingId },
      _count: true,
    });

    return results.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Counts total entries for a mailing
   * @param mailingId - Mailing ID
   * @returns Total count
   */
  async count(mailingId: string): Promise<number> {
    return prisma.mailingEntry.count({
      where: { mailingId },
    });
  }

  /**
   * Deletes all entries for a mailing
   * @param mailingId - Mailing ID
   * @returns Number of deleted entries
   */
  async deleteByMailing(mailingId: string): Promise<number> {
    const result = await prisma.mailingEntry.deleteMany({
      where: { mailingId },
    });
    return result.count;
  }

  /**
   * Finds entries ready to be sent (PENDING with no recent attempts)
   * @param mailingId - Mailing ID
   * @param limit - Maximum number of entries to return
   * @returns Array of entries
   */
  async findPendingToSend(
    mailingId: string,
    limit: number
  ): Promise<MailingEntry[]> {
    return prisma.mailingEntry.findMany({
      where: {
        mailingId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Updates entry status
   * @param id - Entry ID
   * @param status - New status
   * @param externalId - Optional external message ID
   */
  async updateStatus(
    id: string,
    status: string,
    externalId?: string
  ): Promise<void> {
    await prisma.mailingEntry.update({
      where: { id },
      data: {
        status,
        ...(externalId && { externalId }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Increments attempt counter
   * @param id - Entry ID
   */
  async incrementAttempt(id: string): Promise<void> {
    await prisma.mailingEntry.update({
      where: { id },
      data: {
        attempts: {
          increment: 1,
        },
        lastAttempt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Finds stale jobs (jobs stuck in a specific status for too long)
   * @param status - Status to check (e.g., 'SENDING')
   * @param thresholdDate - Jobs with lastAttempt before this date are considered stale
   * @returns Array of stale entries
   */
  async findStaleJobs(
    status: string,
    thresholdDate: Date
  ): Promise<MailingEntry[]> {
    return prisma.mailingEntry.findMany({
      where: {
        status,
        lastAttempt: {
          not: null,
          lt: thresholdDate,
        },
      },
      orderBy: {
        lastAttempt: 'asc',
      },
    });
  }

  /**
   * Resets stale jobs to PENDING status for re-processing
   * @param status - Status to check (e.g., 'SENDING')
   * @param thresholdDate - Jobs with lastAttempt before this date are reset
   * @returns Number of jobs reset
   */
  async resetStaleJobs(
    status: string,
    thresholdDate: Date
  ): Promise<number> {
    const result = await prisma.mailingEntry.updateMany({
      where: {
        status,
        lastAttempt: {
          not: null,
          lt: thresholdDate,
        },
      },
      data: {
        status: 'PENDING',
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Finds entries by mailing ID with pagination
   * @param mailingId - Mailing ID
   * @param limit - Maximum number of entries to return
   * @param offset - Number of entries to skip
   * @returns Array of entries
   */
  async findByMailingId(
    mailingId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<MailingEntry[]> {
    return prisma.mailingEntry.findMany({
      where: { mailingId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Finds entries by status with pagination
   * @param mailingId - Mailing ID
   * @param status - Status filter
   * @param limit - Maximum number of entries to return
   * @param offset - Number of entries to skip
   * @returns Array of entries
   */
  async findByStatus(
    mailingId: string,
    status: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<MailingEntry[]> {
    return prisma.mailingEntry.findMany({
      where: {
        mailingId,
        status,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Create an invalid email entry
   * @param mailingId - Mailing ID
   * @param email - Email address
   * @param reason - Validation failure reason
   * @param validationDetails - Detailed validation info
   * @returns Created entry
   */
  async createInvalidEntry(
    mailingId: string,
    email: string,
    reason: string,
    validationDetails: any
  ): Promise<any> {
    const { randomUUID } = await import('crypto');
    
    return await prisma.mailingEntry.upsert({
      where: {
        unique_mailing_email: {
          mailingId,
          email,
        },
      },
      create: {
        id: randomUUID(),
        mailingId,
        email,
        token: '',
        status: 'INVALID',
        invalidReason: reason || 'Unknown',
        validationDetails: JSON.stringify(validationDetails),
        updatedAt: new Date(),
      },
      update: {
        status: 'INVALID',
        invalidReason: reason || 'Unknown',
        validationDetails: JSON.stringify(validationDetails),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Create or update an email entry after send attempt
   * @param mailingId - Mailing ID
   * @param email - Email address
   * @param token - Verification token
   * @param status - Email status (SENT/FAILED)
   * @param externalId - External message ID (if sent)
   * @param failureReason - Reason for failure (if failed)
   * @returns Created or updated entry
   */
  async upsertEmailResult(
    mailingId: string,
    email: string,
    token: string,
    status: string,
    externalId?: string,
    failureReason?: string
  ): Promise<any> {
    const { randomUUID } = await import('crypto');
    
    // Truncate failure reason to fit in database column (max 50 chars)
    const truncatedReason = failureReason ? failureReason.substring(0, 50) : null;
    
    return await prisma.mailingEntry.upsert({
      where: {
        unique_mailing_email: {
          mailingId,
          email,
        },
      },
      create: {
        id: randomUUID(),
        mailingId,
        email,
        token,
        status,
        attempts: 1,
        lastAttempt: new Date(),
        externalId,
        invalidReason: status === 'FAILED' ? truncatedReason : null,
        validationDetails: status === 'FAILED' && failureReason ? JSON.stringify({ error: failureReason }) : null,
        updatedAt: new Date(),
      },
      update: {
        status,
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        externalId,
        invalidReason: status === 'FAILED' ? truncatedReason : null,
        validationDetails: status === 'FAILED' && failureReason ? JSON.stringify({ error: failureReason }) : null,
        updatedAt: new Date(),
      },
    });
  }
}

export const mailingEntryRepository = new MailingEntryRepository();
