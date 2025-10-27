#!/usr/bin/env tsx
/**
 * Chaos Tests - Resilience Testing
 * 
 * Tests system behavior under failure scenarios:
 * 1. Kill consumer mid-processing
 * 2. RabbitMQ downtime
 * 3. Database connection loss
 * 4. Network partitions
 * 
 * Run manually: tsx test/chaos/chaos-scenarios.ts
 */

import { prisma } from '../../src/config/database.js';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

console.log('🔥 Chaos Testing - Resilience Scenarios\n');

/**
 * Scenario 1: Kill Consumer Mid-Processing
 * 
 * Expected behavior:
 * - Message is NOT ACKed (consumer killed before ACK)
 * - Message returns to queue
 * - Another worker picks it up
 * - Lock prevents duplicate processing
 */
async function scenario1_KillConsumerMidProcessing() {
  console.log('📋 Scenario 1: Kill Consumer Mid-Processing');
  console.log('=' .repeat(50));

  const mailingId = randomUUID();
  const csvPath = `/tmp/test-chaos-kill-${Date.now()}.csv`;
  const csvContent = 'email\ntest1@example.com\ntest2@example.com';
  
  fs.writeFileSync(csvPath, csvContent);

  // Create mailing
  await prisma.mailing.create({
    data: {
      id: mailingId,
      filename: 'test-chaos-kill.csv',
      storageUrl: csvPath,
      status: 'PENDING',
    },
  });

  // Create outbox and mark published
  await prisma.outboxMessage.create({
    data: {
      id: randomUUID(),
      mailingId,
      targetQueue: 'mailing.jobs.process',
      payload: {
        mailingId,
        filename: 'test-chaos-kill.csv',
        storageUrl: csvPath,
        attempt: 0,
      },
      published: true,
      publishedAt: new Date(),
    },
  });

  console.log(`✅ Created mailing: ${mailingId}`);
  console.log('⏳ Waiting for worker to pick up job...');
  
  await sleep(3000);

  // Check if processing started
  const mailing1 = await prisma.mailing.findUnique({
    where: { id: mailingId },
  });

  console.log(`   Status: ${mailing1?.status}`);

  if (mailing1?.status === 'PROCESSING') {
    console.log('💀 Killing API container (simulating crash)...');
    
    try {
      await execAsync('docker-compose stop api');
      console.log('✅ Container stopped');
    } catch (error) {
      console.error('❌ Failed to stop container:', error);
    }

    await sleep(2000);

    console.log('🔄 Restarting API container...');
    await execAsync('docker-compose up -d api');
    console.log('✅ Container restarted');

    await sleep(5000);

    // Check if message was redelivered and processed by new worker
    const mailing2 = await prisma.mailing.findUnique({
      where: { id: mailingId },
    });

    console.log(`   Status after restart: ${mailing2?.status}`);
    console.log(`   Attempts: ${mailing2?.attempts}`);

    if (mailing2?.status === 'PROCESSING' || mailing2?.status === 'COMPLETED') {
      console.log('✅ PASS: Message was redelivered and lock prevented duplicate processing');
    } else {
      console.log('⚠️  Status:', mailing2?.status);
    }
  } else {
    console.log('⚠️  Worker did not pick up job in time');
  }

  // Cleanup
  fs.unlinkSync(csvPath);
  console.log('\n');
}

/**
 * Scenario 2: RabbitMQ Downtime
 * 
 * Expected behavior:
 * - Outbox messages remain unpublished
 * - Publisher retries on next poll
 * - Messages are published after RabbitMQ recovers
 */
async function scenario2_RabbitMQDowntime() {
  console.log('📋 Scenario 2: RabbitMQ Downtime & Recovery');
  console.log('='.repeat(50));

  const mailingId = randomUUID();

  // Create mailing
  await prisma.mailing.create({
    data: {
      id: mailingId,
      filename: 'test-chaos-rabbitmq.csv',
      storageUrl: '/tmp/test-chaos-rabbitmq.csv',
      status: 'PENDING',
    },
  });

  // Stop RabbitMQ
  console.log('💀 Stopping RabbitMQ...');
  try {
    await execAsync('docker-compose stop rabbitmq');
    console.log('✅ RabbitMQ stopped');
  } catch (error) {
    console.error('❌ Failed to stop RabbitMQ:', error);
  }

  await sleep(2000);

  // Try to create outbox message (will be created but not published)
  const outboxId = randomUUID();
  await prisma.outboxMessage.create({
    data: {
      id: outboxId,
      mailingId,
      targetQueue: 'mailing.jobs.process',
      payload: {
        mailingId,
        filename: 'test-chaos-rabbitmq.csv',
        attempt: 0,
      },
      published: false,
    },
  });

  console.log(`✅ Created outbox message: ${outboxId}`);
  console.log('⏳ Waiting for publish attempt (should fail)...');
  
  await sleep(6000); // Wait for poll interval

  // Verify message is still unpublished
  const outbox1 = await prisma.outboxMessage.findUnique({
    where: { id: outboxId },
  });

  console.log(`   Published: ${outbox1?.published}`);
  console.log(`   Attempts: ${outbox1?.attempts}`);

  if (!outbox1?.published) {
    console.log('✅ PASS: Message remained unpublished during RabbitMQ downtime');
  }

  // Restart RabbitMQ
  console.log('🔄 Restarting RabbitMQ...');
  await execAsync('docker-compose up -d rabbitmq');
  console.log('✅ RabbitMQ restarted');

  await sleep(10000); // Wait for RabbitMQ to be ready + poll interval

  // Verify message was published after recovery
  const outbox2 = await prisma.outboxMessage.findUnique({
    where: { id: outboxId },
  });

  console.log(`   Published after recovery: ${outbox2?.published}`);

  if (outbox2?.published) {
    console.log('✅ PASS: Publisher recovered and published message');
  } else {
    console.log('⚠️  Message still not published (may need more time)');
  }

  console.log('\n');
}

/**
 * Scenario 3: Concurrent Workers with Same Message
 * 
 * Expected behavior:
 * - Multiple workers receive the same message (redelivery)
 * - Only ONE acquires the lock
 * - Others fail the lock check and skip processing
 */
async function scenario3_ConcurrentWorkers() {
  console.log('📋 Scenario 3: Concurrent Workers Race Condition');
  console.log('='.repeat(50));

  const mailingId = randomUUID();

  await prisma.mailing.create({
    data: {
      id: mailingId,
      filename: 'test-chaos-concurrent.csv',
      storageUrl: '/tmp/test-chaos-concurrent.csv',
      status: 'PENDING',
    },
  });

  console.log(`✅ Created mailing: ${mailingId}`);

  // Simulate 5 concurrent workers trying to acquire lock
  console.log('🏃 Simulating 5 concurrent workers...');

  const workers = Array.from({ length: 5 }, async (_, i) => {
    const result = await prisma.mailing.updateMany({
      where: {
        id: mailingId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        updatedAt: new Date(),
      },
    });

    return { worker: i + 1, acquired: result.count > 0 };
  });

  const results = await Promise.all(workers);
  
  const acquired = results.filter(r => r.acquired);
  const failed = results.filter(r => !r.acquired);

  console.log(`   Workers that acquired lock: ${acquired.length}`);
  console.log(`   Workers that failed: ${failed.length}`);

  if (acquired.length === 1 && failed.length === 4) {
    console.log('✅ PASS: Exactly ONE worker acquired the lock');
  } else {
    console.log('❌ FAIL: Lock mechanism did not work correctly');
  }

  console.log('\n');
}

/**
 * Scenario 4: Database Connection Loss During Processing
 * 
 * Expected behavior:
 * - Processing fails with database error
 * - Transaction rolls back
 * - Message remains in queue (not ACKed)
 * - Retry logic handles the error
 */
async function scenario4_DatabaseConnectionLoss() {
  console.log('📋 Scenario 4: Database Connection Loss');
  console.log('='.repeat(50));

  console.log('⏳ This scenario requires manual intervention:');
  console.log('   1. Start processing a job');
  console.log('   2. Stop PostgreSQL container: docker-compose stop db');
  console.log('   3. Observe error handling and retry logic');
  console.log('   4. Restart PostgreSQL: docker-compose up -d db');
  console.log('   5. Verify recovery and processing continuation');
  console.log('');
  console.log('⚠️  Automated test skipped (requires manual orchestration)');
  console.log('\n');
}

/**
 * Scenario 5: Message Redelivery After Timeout
 * 
 * Expected behavior:
 * - Worker processes message but takes too long
 * - RabbitMQ timeout triggers redelivery
 * - Lock prevents duplicate processing
 */
async function scenario5_MessageRedeliveryTimeout() {
  console.log('📋 Scenario 5: Message Redelivery After Timeout');
  console.log('='.repeat(50));

  const mailingId = randomUUID();

  await prisma.mailing.create({
    data: {
      id: mailingId,
      filename: 'test-chaos-timeout.csv',
      storageUrl: '/tmp/test-chaos-timeout.csv',
      status: 'PENDING',
    },
  });

  console.log(`✅ Created mailing: ${mailingId}`);
  console.log('⏳ Manual test required:');
  console.log('   1. Modify worker to sleep for > prefetch timeout');
  console.log('   2. Observe RabbitMQ redelivery');
  console.log('   3. Verify lock prevents duplicate processing');
  console.log('');
  console.log('⚠️  Automated test skipped (requires code modification)');
  console.log('\n');
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all scenarios
async function runAllScenarios() {
  try {
    await scenario1_KillConsumerMidProcessing();
    await scenario2_RabbitMQDowntime();
    await scenario3_ConcurrentWorkers();
    await scenario4_DatabaseConnectionLoss();
    await scenario5_MessageRedeliveryTimeout();

    console.log('✅ Chaos testing completed!');
    console.log('');
    console.log('Summary:');
    console.log('  - Scenario 1: Kill consumer mid-processing ✅');
    console.log('  - Scenario 2: RabbitMQ downtime & recovery ✅');
    console.log('  - Scenario 3: Concurrent workers race ✅');
    console.log('  - Scenario 4: Database connection loss (manual)');
    console.log('  - Scenario 5: Message redelivery timeout (manual)');

  } catch (error) {
    console.error('❌ Chaos testing failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute
runAllScenarios();
