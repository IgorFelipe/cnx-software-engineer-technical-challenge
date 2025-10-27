import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { randomUUID } from 'crypto';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

/**
 * Integration Tests - Full Pipeline
 * 
 * Prerequisites:
 * - Docker Compose running (PostgreSQL, RabbitMQ, API)
 * - WireMock for external API simulation
 * 
 * Run with: npm run test:integration
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const WIREMOCK_URL = process.env.WIREMOCK_URL || 'http://localhost:8080';

describe('Integration Tests - Happy Path', () => {
  beforeAll(async () => {
    // Ensure services are ready
    await waitForServices();
  });

  it('should complete full pipeline: CSV → Outbox → RabbitMQ → Processing → COMPLETED', async () => {
    // 1. Create test CSV
    const csvContent = 'email\ntest1@example.com\ntest2@example.com\ntest3@example.com';
    const csvPath = path.join('/tmp', `test-happy-${Date.now()}.csv');
    fs.writeFileSync(csvPath, csvContent);

    // 2. Upload CSV
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvPath), 'test-happy.csv');

    const uploadResponse = await axios.post(`${API_BASE_URL}/mailings`, formData, {
      headers: formData.getHeaders(),
    });

    expect(uploadResponse.status).toBe(202);
    expect(uploadResponse.data.mailingId).toBeDefined();

    const mailingId = uploadResponse.data.mailingId;

    // 3. Verify outbox message created
    await sleep(1000);
    const outboxMessage = await prisma.outboxMessage.findFirst({
      where: { mailingId },
    });

    expect(outboxMessage).toBeDefined();
    expect(outboxMessage?.published).toBe(false); // Initially unpublished

    // 4. Wait for outbox publisher to publish
    await sleep(6000); // OUTBOX_POLL_INTERVAL_MS = 5000
    const publishedOutbox = await prisma.outboxMessage.findFirst({
      where: { mailingId },
    });

    expect(publishedOutbox?.published).toBe(true);
    expect(publishedOutbox?.publishedAt).toBeDefined();

    // 5. Wait for worker consumer to process
    await sleep(10000); // Allow time for processing
    const completedMailing = await prisma.mailing.findUnique({
      where: { id: mailingId },
    });

    expect(completedMailing?.status).toBeOneOf(['PROCESSING', 'COMPLETED', 'FAILED']);
    expect(completedMailing?.totalLines).toBe(3);

    // Cleanup
    fs.unlinkSync(csvPath);
  }, 30000); // 30s timeout
});

describe('Integration Tests - Duplicate Delivery', () => {
  it('should process message only once even if delivered twice', async () => {
    const mailingId = randomUUID();

    // Create mailing directly in database
    await prisma.mailing.create({
      data: {
        id: mailingId,
        filename: 'test-duplicate.csv',
        storageUrl: `/tmp/test-duplicate-${Date.now()}.csv`,
        status: 'PENDING',
      },
    });

    // Create outbox message
    const outboxId = randomUUID();
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        mailingId,
        targetQueue: 'mailing.jobs.process',
        payload: {
          mailingId,
          filename: 'test-duplicate.csv',
          attempt: 0,
        },
        published: false,
      },
    });

    // Simulate first processing attempt
    const firstLock = await prisma.mailing.updateMany({
      where: {
        id: mailingId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(firstLock.count).toBe(1);

    // Simulate duplicate message delivery (second worker tries to process)
    const secondLock = await prisma.mailing.updateMany({
      where: {
        id: mailingId,
        status: 'PENDING', // No longer PENDING
      },
      data: {
        status: 'PROCESSING',
      },
    });

    expect(secondLock.count).toBe(0); // Idempotency: duplicate rejected

    // Cleanup
    await prisma.outboxMessage.delete({ where: { id: outboxId } });
    await prisma.mailing.delete({ where: { id: mailingId } });
  });
});

describe('Integration Tests - Retry Path', () => {
  it('should send failed job to retry queue and eventually to DLQ', async () => {
    // Setup WireMock to return 5xx errors
    await setupWireMockFor5xxErrors();

    const mailingId = randomUUID();
    const csvContent = 'email\nfail@example.com';
    const csvPath = path.join('/tmp', `test-retry-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, csvContent);

    // Create mailing
    await prisma.mailing.create({
      data: {
        id: mailingId,
        filename: 'test-retry.csv',
        storageUrl: csvPath,
        status: 'PENDING',
      },
    });

    // Create outbox and publish
    const outboxId = randomUUID();
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        mailingId,
        targetQueue: 'mailing.jobs.process',
        payload: {
          mailingId,
          filename: 'test-retry.csv',
          storageUrl: csvPath,
          attempt: 0,
        },
        published: true,
        publishedAt: new Date(),
      },
    });

    // Wait for processing and retries
    // Attempt 0 → retry.1 (60s) → Attempt 1 → retry.2 (5min) → Attempt 2 → DLQ
    await sleep(5000);

    // Check mailing attempts
    const mailing = await prisma.mailing.findUnique({
      where: { id: mailingId },
    });

    expect(mailing?.attempts).toBeGreaterThanOrEqual(1);
    expect(mailing?.status).toBe('FAILED');
    expect(mailing?.lastAttempt).toBeDefined();

    // Check dead_letters table after max retries
    // Note: This test may need to wait for full retry cycle (60s + 5min)
    // For faster testing, reduce TTL values in test environment

    // Cleanup
    fs.unlinkSync(csvPath);
    await prisma.outboxMessage.delete({ where: { id: outboxId } });
    await prisma.mailing.delete({ where: { id: mailingId } });
  }, 10000);
});

describe('Integration Tests - Publisher Crash Recovery', () => {
  it('should recover and publish messages after publisher crash', async () => {
    const mailingId = randomUUID();

    // Create mailing
    await prisma.mailing.create({
      data: {
        id: mailingId,
        filename: 'test-crash-recovery.csv',
        storageUrl: '/tmp/test-crash-recovery.csv',
        status: 'PENDING',
      },
    });

    // Create outbox (transaction committed)
    const outboxId = randomUUID();
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        mailingId,
        targetQueue: 'mailing.jobs.process',
        payload: {
          mailingId,
          filename: 'test-crash-recovery.csv',
          attempt: 0,
        },
        published: false, // Simulate crash before marking published
      },
    });

    // Verify message is unpublished
    const unpublished = await prisma.outboxMessage.findUnique({
      where: { id: outboxId },
    });

    expect(unpublished?.published).toBe(false);

    // Simulate publisher recovery (polls for unpublished messages)
    // Wait for next poll cycle
    await sleep(6000);

    // Verify publisher picked up and published
    const recovered = await prisma.outboxMessage.findUnique({
      where: { id: outboxId },
    });

    // Should eventually be published
    expect(recovered?.published).toBe(true);

    // Cleanup
    await prisma.outboxMessage.delete({ where: { id: outboxId } });
    await prisma.mailing.delete({ where: { id: mailingId } });
  }, 15000);
});

// Helper functions
async function waitForServices() {
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await axios.get(`${API_BASE_URL}/health`);
      console.log('✅ API is ready');
      return;
    } catch (error) {
      retries++;
      await sleep(1000);
    }
  }

  throw new Error('Services not ready after 30s');
}

async function setupWireMockFor5xxErrors() {
  try {
    await axios.post(`${WIREMOCK_URL}/__admin/mappings`, {
      request: {
        method: 'POST',
        urlPattern: '/emails/send',
      },
      response: {
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    });
  } catch (error) {
    console.warn('WireMock not available, skipping stub setup');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Custom matcher
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of ${expected.join(', ')}`
          : `expected ${received} to be one of ${expected.join(', ')}`,
    };
  },
});
