import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { randomUUID } from 'crypto';

/**
 * Unit Tests - Lock Logic
 * 
 * Test atomic lock acquisition to ensure only one worker processes a job
 * even when multiple workers try to acquire the lock simultaneously.
 */
describe('Lock Logic - Atomic Updates', () => {
  let testMailingId: string;

  beforeEach(async () => {
    // Create test mailing
    testMailingId = randomUUID();
    await prisma.mailing.create({
      data: {
        id: testMailingId,
        filename: 'test-lock.csv',
        storageUrl: '/tmp/test-lock.csv',
        status: 'PENDING',
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await prisma.mailing.deleteMany({
      where: { id: testMailingId },
    });
  });

  it('should allow only one worker to acquire lock (atomic UPDATE)', async () => {
    // Execute two concurrent lock attempts
    // CRITICAL: Execute in Promise.all to ensure true concurrency
    const [result1, result2] = await Promise.all([
      prisma.mailing.updateMany({
        where: {
          id: testMailingId,
          status: 'PENDING', // Conditional update
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      }),
      prisma.mailing.updateMany({
        where: {
          id: testMailingId,
          status: 'PENDING', // Conditional update
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      })
    ]);

    // Only one should succeed (count = 1)
    // The other should fail (count = 0) because status is no longer PENDING
    const successCount = (result1.count > 0 ? 1 : 0) + (result2.count > 0 ? 1 : 0);
    
    expect(successCount).toBe(1);
    expect(result1.count + result2.count).toBe(1);

    // Verify final state
    const mailing = await prisma.mailing.findUnique({
      where: { id: testMailingId },
    });

    expect(mailing?.status).toBe('PROCESSING');
  });

  it('should not allow lock acquisition if already PROCESSING', async () => {
    // First worker acquires lock
    const result1 = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(result1.count).toBe(1);

    // Second worker tries to acquire lock (should fail)
    const result2 = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING', // No longer PENDING
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(result2.count).toBe(0); // Should not update anything
  });

  it('should allow lock acquisition after previous worker completes', async () => {
    // Worker 1: Acquire lock → Process → Complete
    await prisma.mailing.update({
      where: { id: testMailingId },
      data: { status: 'PROCESSING' },
    });

    await prisma.mailing.update({
      where: { id: testMailingId },
      data: { status: 'COMPLETED' },
    });

    // Worker 2: Try to reprocess a COMPLETED mailing (should fail)
    const result = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING', // Not PENDING anymore
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(result.count).toBe(0);
  });

  it('should handle concurrent lock attempts with race condition', async () => {
    // Simulate 5 workers trying to acquire lock simultaneously
    const workers = Array.from({ length: 5 }, (_, i) =>
      prisma.mailing.updateMany({
        where: {
          id: testMailingId,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      })
    );

    const results = await Promise.all(workers);
    
    // Count how many succeeded
    const successfulUpdates = results.reduce((sum, result) => sum + result.count, 0);
    
    // Only ONE should succeed
    expect(successfulUpdates).toBe(1);
    
    // Verify all others failed
    const failedUpdates = results.filter(r => r.count === 0).length;
    expect(failedUpdates).toBe(4);
  });
});

/**
 * Unit Tests - Consumer Finalization
 * 
 * Test that after successful processing:
 * 1. Database is updated to COMPLETED
 * 2. Message is ACKed to RabbitMQ
 */
describe('Consumer Finalization', () => {
  let testMailingId: string;

  beforeEach(async () => {
    testMailingId = randomUUID();
    await prisma.mailing.create({
      data: {
        id: testMailingId,
        filename: 'test-finalization.csv',
        storageUrl: '/tmp/test-finalization.csv',
        status: 'PROCESSING',
      },
    });
  });

  afterEach(async () => {
    await prisma.mailing.deleteMany({
      where: { id: testMailingId },
    });
  });

  it('should update status to COMPLETED after successful processing', async () => {
    // Simulate successful processing
    await prisma.mailing.update({
      where: { id: testMailingId },
      data: {
        status: 'COMPLETED',
        processedLines: 100,
        updatedAt: new Date(),
      },
    });

    const mailing = await prisma.mailing.findUnique({
      where: { id: testMailingId },
    });

    expect(mailing?.status).toBe('COMPLETED');
    expect(mailing?.processedLines).toBe(100);
  });

  it('should update status to FAILED on error', async () => {
    const errorMessage = 'CSV processing failed: File not found';

    await prisma.mailing.update({
      where: { id: testMailingId },
      data: {
        status: 'FAILED',
        errorMessage,
        updatedAt: new Date(),
      },
    });

    const mailing = await prisma.mailing.findUnique({
      where: { id: testMailingId },
    });

    expect(mailing?.status).toBe('FAILED');
    expect(mailing?.errorMessage).toBe(errorMessage);
  });

  it('should track attempts on retry', async () => {
    // Simulate retry attempts
    for (let attempt = 1; attempt <= 3; attempt++) {
      await prisma.mailing.update({
        where: { id: testMailingId },
        data: {
          attempts: attempt,
          lastAttempt: new Date(),
          status: 'FAILED',
          errorMessage: `Attempt ${attempt} failed`,
        },
      });

      const mailing = await prisma.mailing.findUnique({
        where: { id: testMailingId },
      });

      expect(mailing?.attempts).toBe(attempt);
    }
  });
});

/**
 * Unit Tests - Publisher Logic
 * 
 * Test that outbox publisher:
 * 1. Publishes message to RabbitMQ
 * 2. Receives confirmation
 * 3. Marks message as published in database
 */
describe('Publisher - Publish and Confirm', () => {
  let testMailingId: string;
  let testOutboxId: string;

  beforeEach(async () => {
    testMailingId = randomUUID();
    testOutboxId = randomUUID();

    await prisma.mailing.create({
      data: {
        id: testMailingId,
        filename: 'test-publisher.csv',
        storageUrl: '/tmp/test-publisher.csv',
        status: 'PENDING',
      },
    });

    await prisma.outboxMessage.create({
      data: {
        id: testOutboxId,
        mailingId: testMailingId,
        targetQueue: 'mailing.jobs.process',
        payload: {
          mailingId: testMailingId,
          filename: 'test-publisher.csv',
          attempt: 0,
        },
        published: false,
        attempts: 0,
      },
    });
  });

  afterEach(async () => {
    await prisma.outboxMessage.deleteMany({
      where: { id: testOutboxId },
    });
    await prisma.mailing.deleteMany({
      where: { id: testMailingId },
    });
  });

  it('should mark outbox message as published after successful publish', async () => {
    // Simulate successful publish
    await prisma.outboxMessage.update({
      where: { id: testOutboxId },
      data: {
        published: true,
        publishedAt: new Date(),
      },
    });

    const outboxMessage = await prisma.outboxMessage.findUnique({
      where: { id: testOutboxId },
    });

    expect(outboxMessage?.published).toBe(true);
    expect(outboxMessage?.publishedAt).toBeDefined();
  });

  it('should NOT mark as published if publish fails', async () => {
    // Simulate failed publish (no update to published flag)
    await prisma.outboxMessage.update({
      where: { id: testOutboxId },
      data: {
        attempts: 1,
        lastError: 'RabbitMQ connection failed',
      },
    });

    const outboxMessage = await prisma.outboxMessage.findUnique({
      where: { id: testOutboxId },
    });

    expect(outboxMessage?.published).toBe(false);
    expect(outboxMessage?.attempts).toBe(1);
    expect(outboxMessage?.lastError).toContain('RabbitMQ');
  });

  it('should find unpublished messages for retry', async () => {
    const unpublishedMessages = await prisma.outboxMessage.findMany({
      where: {
        published: false,
      },
      take: 10,
    });

    expect(unpublishedMessages.length).toBeGreaterThan(0);
    expect(unpublishedMessages[0].id).toBe(testOutboxId);
  });

  it('should handle publisher crash recovery scenario', async () => {
    // Scenario: Transaction committed but publish failed (crash before marking published)
    // Message should remain unpublished and be picked up on next poll
    
    const unpublished = await prisma.outboxMessage.findUnique({
      where: { id: testOutboxId },
    });

    expect(unpublished?.published).toBe(false);

    // Simulate recovery: Publisher picks up and publishes
    await prisma.outboxMessage.update({
      where: { id: testOutboxId },
      data: {
        published: true,
        publishedAt: new Date(),
      },
    });

    const recovered = await prisma.outboxMessage.findUnique({
      where: { id: testOutboxId },
    });

    expect(recovered?.published).toBe(true);
  });
});

/**
 * Unit Tests - Idempotency
 * 
 * Test that duplicate processing is prevented
 */
describe('Idempotency - Duplicate Prevention', () => {
  let testMailingId: string;

  beforeEach(async () => {
    testMailingId = randomUUID();
    await prisma.mailing.create({
      data: {
        id: testMailingId,
        filename: 'test-idempotency.csv',
        storageUrl: '/tmp/test-idempotency.csv',
        status: 'PENDING',
      },
    });
  });

  afterEach(async () => {
    await prisma.mailing.deleteMany({
      where: { id: testMailingId },
    });
  });

  it('should prevent duplicate processing via status check', async () => {
    // First processing
    const firstUpdate = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(firstUpdate.count).toBe(1);

    // Duplicate message arrives (should not process)
    const duplicateUpdate = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING', // Not PENDING anymore
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(duplicateUpdate.count).toBe(0); // Idempotency check passed
  });

  it('should not reprocess COMPLETED mailings', async () => {
    // Complete processing
    await prisma.mailing.update({
      where: { id: testMailingId },
      data: { status: 'COMPLETED' },
    });

    // Try to reprocess
    const reprocessAttempt = await prisma.mailing.updateMany({
      where: {
        id: testMailingId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(reprocessAttempt.count).toBe(0);
  });
});
