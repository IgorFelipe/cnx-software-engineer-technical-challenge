/**
 * Manual checkpoint test - demonstrates real-world interruption scenario
 * 
 * This test shows how to handle an interrupted CSV processing:
 * 1. Start processing a large file
 * 2. Manually stop/kill the process (CTRL+C or SIGTERM)
 * 3. Restart and resume from checkpoint
 */

import { writeFile, unlink } from 'fs/promises';
import { processCsvFile, resumeCsvProcessing } from './services/csv.service.js';
import { mailingProgressRepository } from './repositories/mailing-progress.repository.js';
import { mailingEntryRepository } from './repositories/mailing-entry.repository.js';
import { prisma } from './config/database.js';

const TEST_CSV_PATH = './test-large-checkpoint.csv';
const MAILING_ID = 'checkpoint-test-001'; // Fixed ID for manual testing

/**
 * Creates a large test CSV file
 */
async function createLargeCsv(lines: number): Promise<void> {
  const header = 'email\n';
  const rows = Array.from(
    { length: lines },
    (_, i) => `test${i + 1}@example.com`
  ).join('\n');
  
  await writeFile(TEST_CSV_PATH, header + rows, 'utf-8');
  console.log(`📝 Created test CSV with ${lines} lines`);
}

/**
 * Start processing - intentionally slow to allow manual interruption
 */
async function startProcessing(): Promise<void> {
  console.log('🚀 Starting CSV processing...');
  console.log('   Press CTRL+C to interrupt at any time\n');
  
  try {
    const result = await processCsvFile(TEST_CSV_PATH, {
      mailingId: MAILING_ID,
      checkpointInterval: 100, // Checkpoint every 100 lines
      batchSize: 50,
    });
    
    console.log('\n✅ Processing completed!');
    console.log(`   Total: ${result.totalRows}`);
    console.log(`   Processed: ${result.processedRows}`);
    console.log(`   Status: ${result.status}`);
  } catch (error) {
    console.error('\n❌ Processing interrupted:', error);
    
    // Check where we stopped
    const progress = await mailingProgressRepository.findByMailingId(MAILING_ID);
    if (progress) {
      console.log(`\n📊 Progress saved:`);
      console.log(`   Last processed line: ${progress.lastProcessedLine}`);
      console.log(`   Processed rows: ${progress.processedRows}`);
      console.log(`   Status: ${progress.status}`);
      console.log(`\n💡 Run "npm run test:checkpoint:resume" to continue`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Resume from checkpoint
 */
async function resumeProcessing(): Promise<void> {
  console.log('♻️  Resuming CSV processing from checkpoint...\n');
  
  try {
    // Check progress first
    const progress = await mailingProgressRepository.findByMailingId(MAILING_ID);
    if (!progress) {
      console.error('❌ No progress found. Run start first.');
      return;
    }
    
    console.log(`📊 Current progress:`);
    console.log(`   Last processed line: ${progress.lastProcessedLine}`);
    console.log(`   Processed rows: ${progress.processedRows}`);
    console.log(`   Total rows: ${progress.totalRows}`);
    console.log(`   Status: ${progress.status}\n`);
    
    if (progress.status === 'COMPLETED') {
      console.log('✅ Processing already completed!');
      return;
    }
    
    // Resume
    const result = await resumeCsvProcessing(MAILING_ID, TEST_CSV_PATH, {
      checkpointInterval: 100,
      batchSize: 50,
    });
    
    console.log('\n✅ Resume completed!');
    console.log(`   Total: ${result.totalRows}`);
    console.log(`   Processed: ${result.processedRows}`);
    console.log(`   Duplicates skipped: ${result.duplicatesSkipped}`);
    console.log(`   Status: ${result.status}`);
    
    // Verify no duplicates
    const allEntries = await mailingEntryRepository.findByMailing(MAILING_ID);
    const uniqueEmails = new Set(allEntries.map((e: any) => e.email));
    
    console.log(`\n📊 Verification:`);
    console.log(`   Total entries: ${allEntries.length}`);
    console.log(`   Unique emails: ${uniqueEmails.size}`);
    
    if (allEntries.length === uniqueEmails.size) {
      console.log('   ✅ No duplicates detected');
    } else {
      console.log(`   ❌ Duplicates found: ${allEntries.length - uniqueEmails.size}`);
    }
  } catch (error) {
    console.error('❌ Resume failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Check current status
 */
async function checkStatus(): Promise<void> {
  console.log('📊 Checking mailing status...\n');
  
  try {
    const progress = await mailingProgressRepository.findByMailingId(MAILING_ID);
    
    if (!progress) {
      console.log('❌ No mailing found with ID:', MAILING_ID);
      console.log('💡 Run "npm run test:checkpoint:start" to begin');
      return;
    }
    
    console.log('Mailing ID:', progress.mailingId);
    console.log('Status:', progress.status);
    console.log('Total Rows:', progress.totalRows);
    console.log('Processed Rows:', progress.processedRows);
    console.log('Last Processed Line:', progress.lastProcessedLine);
    
    const percentComplete = progress.totalRows > 0
      ? ((progress.processedRows / progress.totalRows) * 100).toFixed(2)
      : 0;
    console.log(`\nProgress: ${percentComplete}%`);
    
    if (progress.status === 'RUNNING' || progress.status === 'PAUSED') {
      const remaining = progress.totalRows - progress.lastProcessedLine;
      console.log(`Remaining: ${remaining} lines`);
      console.log('\n💡 Run "npm run test:checkpoint:resume" to continue');
    } else if (progress.status === 'COMPLETED') {
      console.log('\n✅ Mailing completed successfully');
    }
    
    // Check entries
    const entryCount = await prisma.mailingEntry.count({
      where: { mailingId: MAILING_ID },
    });
    console.log(`\nMailing Entries: ${entryCount}`);
  } catch (error) {
    console.error('❌ Status check failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Clean up test data
 */
async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up test data...');
  
  try {
    await mailingEntryRepository.deleteByMailing(MAILING_ID);
    await mailingProgressRepository.delete(MAILING_ID);
    await unlink(TEST_CSV_PATH).catch(() => {});
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Setup - create test CSV
 */
async function setup(): Promise<void> {
  console.log('📝 Setting up test environment...\n');
  
  try {
    // Clean up any existing data
    await cleanup();
    
    // Create large CSV (5000 lines for realistic testing)
    await createLargeCsv(5000);
    
    console.log('\n✅ Setup completed');
    console.log('💡 Run "npm run test:checkpoint:start" to begin processing');
  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'setup':
    setup();
    break;
  case 'start':
    startProcessing();
    break;
  case 'resume':
    resumeProcessing();
    break;
  case 'status':
    checkStatus();
    break;
  case 'cleanup':
    cleanup();
    break;
  default:
    console.log('📋 CSV Checkpoint Manual Test');
    console.log('\nCommands:');
    console.log('  node dist/test-checkpoint-manual.js setup   - Create test CSV file');
    console.log('  node dist/test-checkpoint-manual.js start   - Start processing (press CTRL+C to interrupt)');
    console.log('  node dist/test-checkpoint-manual.js resume  - Resume from last checkpoint');
    console.log('  node dist/test-checkpoint-manual.js status  - Check current status');
    console.log('  node dist/test-checkpoint-manual.js cleanup - Clean up test data');
    console.log('\nWorkflow:');
    console.log('  1. setup   - Create 5000 line test CSV');
    console.log('  2. start   - Begin processing');
    console.log('  3. CTRL+C  - Interrupt at any time');
    console.log('  4. status  - Check progress');
    console.log('  5. resume  - Continue from checkpoint');
    console.log('  6. cleanup - Remove test data');
}
