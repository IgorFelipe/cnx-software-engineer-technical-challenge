/**
 * Test for Crash Recovery Service
 * 
 * Tests the crash recovery functionality:
 * 1. Simulates stale SENDING jobs (crashed during sending)
 * 2. Simulates stale RUNNING mailings (crashed during CSV processing)
 * 3. Runs crash recovery on boot
 * 4. Verifies jobs are re-queued correctly
 */

import { randomUUID } from 'crypto';
import { crashRecoveryService } from './services/crash-recovery.service.js';
import { mailingEntryRepository } from './repositories/mailing-entry.repository.js';
import { mailingProgressRepository } from './repositories/mailing-progress.repository.js';
import { prisma } from './config/database.js';

const TEST_MAILING_ID = 'crash-recovery-test-001';
const TEST_MAILING_ID_2 = 'crash-recovery-test-002';

/**
 * Cleanup test data
 */
async function cleanup(): Promise<void> {
  try {
    await mailingEntryRepository.deleteByMailing(TEST_MAILING_ID);
    await mailingEntryRepository.deleteByMailing(TEST_MAILING_ID_2);
    await mailingProgressRepository.delete(TEST_MAILING_ID).catch(() => {});
    await mailingProgressRepository.delete(TEST_MAILING_ID_2).catch(() => {});
    console.log('🧹 Cleaned up test data');
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}

/**
 * Creates test data simulating a crash scenario
 */
async function setupCrashScenario(): Promise<void> {
  console.log('📝 Setting up crash scenario...\n');

  // Scenario 1: Stale SENDING jobs (simulating crash during email sending)
  console.log('Creating stale SENDING jobs (simulating crashed email sending)...');
  
  const staleJobsData = [
    {
      id: randomUUID(),
      mailingId: TEST_MAILING_ID,
      email: 'stale1@example.com',
      token: randomUUID(),
      status: 'SENDING',
      attempts: 1,
    },
    {
      id: randomUUID(),
      mailingId: TEST_MAILING_ID,
      email: 'stale2@example.com',
      token: randomUUID(),
      status: 'SENDING',
      attempts: 2,
    },
    {
      id: randomUUID(),
      mailingId: TEST_MAILING_ID,
      email: 'stale3@example.com',
      token: randomUUID(),
      status: 'SENDING',
      attempts: 1,
    },
  ];

  await mailingEntryRepository.createMany(staleJobsData, false);

  // Make them stale by backdating lastAttempt (10 minutes ago)
  const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
  for (const job of staleJobsData) {
    await prisma.mailingEntry.update({
      where: { id: job.id },
      data: {
        lastAttempt: staleDate,
        updatedAt: staleDate,
      },
    });
  }

  console.log(`✅ Created ${staleJobsData.length} stale SENDING jobs (10 minutes old)`);

  // Scenario 2: Fresh SENDING job (should NOT be recovered)
  console.log('\nCreating fresh SENDING job (should NOT be recovered)...');
  
  const freshJobData = {
    id: randomUUID(),
    mailingId: TEST_MAILING_ID,
    email: 'fresh@example.com',
    token: randomUUID(),
    status: 'SENDING',
    attempts: 1,
  };

  await mailingEntryRepository.createMany([freshJobData], false);
  
  // Set recent lastAttempt (30 seconds ago)
  const recentDate = new Date(Date.now() - 30 * 1000);
  await prisma.mailingEntry.update({
    where: { id: freshJobData.id },
    data: {
      lastAttempt: recentDate,
      updatedAt: recentDate,
    },
  });

  console.log('✅ Created 1 fresh SENDING job (30 seconds old)');

  // Scenario 3: Stale RUNNING mailing (simulating crash during CSV processing)
  console.log('\nCreating stale RUNNING mailing (simulating crashed CSV processing)...');
  
  const staleMailingDate = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
  await prisma.mailingProgress.create({
    data: {
      mailingId: TEST_MAILING_ID_2,
      totalRows: 1000,
      processedRows: 450,
      lastProcessedLine: 450,
      status: 'RUNNING',
      createdAt: staleMailingDate,
      updatedAt: staleMailingDate,
    },
  });

  console.log('✅ Created 1 stale RUNNING mailing (15 minutes old, 45% complete)');

  // Scenario 4: Fresh RUNNING mailing (should NOT be recovered)
  console.log('\nCreating fresh RUNNING mailing (should NOT be recovered)...');
  
  const freshMailingDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
  await prisma.mailingProgress.create({
    data: {
      mailingId: TEST_MAILING_ID + '-fresh',
      totalRows: 100,
      processedRows: 50,
      lastProcessedLine: 50,
      status: 'RUNNING',
      createdAt: freshMailingDate,
      updatedAt: freshMailingDate,
    },
  });

  console.log('✅ Created 1 fresh RUNNING mailing (1 minute old)');

  console.log('\n✅ Crash scenario setup complete\n');
}

/**
 * Verifies recovery results
 */
async function verifyRecovery(): Promise<void> {
  console.log('🔍 Verifying recovery results...\n');

  // Check stale SENDING jobs were reset to PENDING
  const staleJobsAfterRecovery = await prisma.mailingEntry.findMany({
    where: {
      mailingId: TEST_MAILING_ID,
      email: {
        in: ['stale1@example.com', 'stale2@example.com', 'stale3@example.com'],
      },
    },
  });

  console.log('📧 Stale SENDING jobs:');
  for (const job of staleJobsAfterRecovery) {
    console.log(`   ${job.email}: status = ${job.status} ` + 
      (job.status === 'PENDING' ? '✅' : '❌'));
  }

  const allPending = staleJobsAfterRecovery.every((j: any) => j.status === 'PENDING');
  if (!allPending) {
    throw new Error('❌ Not all stale jobs were reset to PENDING');
  }
  console.log('✅ All stale SENDING jobs reset to PENDING\n');

  // Check fresh SENDING job was NOT touched
  const freshJob = await prisma.mailingEntry.findFirst({
    where: {
      mailingId: TEST_MAILING_ID,
      email: 'fresh@example.com',
    },
  });

  console.log('📧 Fresh SENDING job:');
  console.log(`   fresh@example.com: status = ${freshJob?.status} ` +
    (freshJob?.status === 'SENDING' ? '✅' : '❌'));

  if (freshJob?.status !== 'SENDING') {
    throw new Error('❌ Fresh job was incorrectly modified');
  }
  console.log('✅ Fresh SENDING job left untouched\n');

  // Check stale RUNNING mailing was marked PAUSED
  const staleMailingAfterRecovery = await mailingProgressRepository.findByMailingId(
    TEST_MAILING_ID_2
  );

  console.log('📄 Stale RUNNING mailing:');
  console.log(`   ${TEST_MAILING_ID_2}: status = ${staleMailingAfterRecovery?.status} ` +
    (staleMailingAfterRecovery?.status === 'PAUSED' ? '✅' : '❌'));

  if (staleMailingAfterRecovery?.status !== 'PAUSED') {
    throw new Error('❌ Stale mailing was not marked as PAUSED');
  }
  console.log('✅ Stale RUNNING mailing marked as PAUSED\n');

  // Check fresh RUNNING mailing was NOT touched
  const freshMailing = await mailingProgressRepository.findByMailingId(
    TEST_MAILING_ID + '-fresh'
  );

  console.log('📄 Fresh RUNNING mailing:');
  console.log(`   ${TEST_MAILING_ID}-fresh: status = ${freshMailing?.status} ` +
    (freshMailing?.status === 'RUNNING' ? '✅' : '❌'));

  if (freshMailing?.status !== 'RUNNING') {
    throw new Error('❌ Fresh mailing was incorrectly modified');
  }
  console.log('✅ Fresh RUNNING mailing left untouched\n');

  console.log('✅ ALL VERIFICATIONS PASSED!\n');
}

/**
 * Main test function
 */
async function runTest(): Promise<void> {
  console.log('🧪 Testing Crash Recovery Service\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Cleanup any previous test data
    await cleanup();

    // Setup crash scenario
    await setupCrashScenario();

    // Wait a moment to ensure timestamps are stable
    await new Promise(resolve => setTimeout(resolve, 100));

    // Run crash recovery (simulating application boot)
    console.log('🔄 Running crash recovery (simulating application boot)...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const result = await crashRecoveryService.recoverOnBoot();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify expected results
    console.log('📊 Expected results:');
    console.log(`   Stale jobs found: 3`);
    console.log(`   Stale jobs recovered: 3`);
    console.log(`   Stale mailings found: 1`);
    console.log(`   Stale mailings recovered: 1\n`);

    console.log('📊 Actual results:');
    console.log(`   Stale jobs found: ${result.staleJobsFound}`);
    console.log(`   Stale jobs recovered: ${result.staleJobsRecovered}`);
    console.log(`   Stale mailings found: ${result.staleMailingsFound}`);
    console.log(`   Stale mailings recovered: ${result.staleMailingsRecovered}\n`);

    // Verify results
    if (result.staleJobsFound !== 3) {
      throw new Error(`Expected 3 stale jobs, found ${result.staleJobsFound}`);
    }
    if (result.staleJobsRecovered !== 3) {
      throw new Error(`Expected 3 jobs recovered, got ${result.staleJobsRecovered}`);
    }
    if (result.staleMailingsFound !== 1) {
      throw new Error(`Expected 1 stale mailing, found ${result.staleMailingsFound}`);
    }
    if (result.staleMailingsRecovered !== 1) {
      throw new Error(`Expected 1 mailing recovered, got ${result.staleMailingsRecovered}`);
    }
    if (result.errors.length > 0) {
      throw new Error(`Unexpected errors: ${result.errors.join(', ')}`);
    }

    console.log('✅ Recovery statistics match expected values\n');

    // Verify database state
    await verifyRecovery();

    // Test checkRecoveryNeeded (should return 0 after recovery)
    console.log('🔍 Testing checkRecoveryNeeded() after recovery...');
    const checkResult = await crashRecoveryService.checkRecoveryNeeded();
    console.log(`   Stale jobs: ${checkResult.staleJobsCount}`);
    console.log(`   Stale mailings: ${checkResult.staleMailingsCount}`);
    console.log(`   Needs recovery: ${checkResult.needsRecovery}\n`);

    if (checkResult.needsRecovery) {
      throw new Error('Recovery still needed after recovery ran');
    }

    console.log('✅ No recovery needed after successful recovery\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ ALL TESTS PASSED!\n');
    console.log('📋 Summary:');
    console.log('   • Detected 3 stale SENDING jobs (> 5 minutes old)');
    console.log('   • Reset stale jobs to PENDING for re-processing');
    console.log('   • Left fresh SENDING job (< 5 minutes) untouched');
    console.log('   • Detected 1 stale RUNNING mailing (> 5 minutes old)');
    console.log('   • Marked stale mailing as PAUSED');
    console.log('   • Left fresh RUNNING mailing (< 5 minutes) untouched');
    console.log('   • Crash recovery ready for production use');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    throw error;
  } finally {
    // Cleanup
    await cleanup();
    await mailingProgressRepository.delete(TEST_MAILING_ID + '-fresh').catch(() => {});
    await prisma.$disconnect();
  }
}

// Run test
runTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
