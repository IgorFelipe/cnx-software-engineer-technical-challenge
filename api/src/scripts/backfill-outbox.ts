#!/usr/bin/env tsx
/**
 * Backfill Outbox Script
 * 
 * Migrates pending mailings to the outbox pattern.
 * Finds mailings that are PENDING or QUEUED but don't have corresponding outbox messages.
 * Creates outbox entries for them so they can be processed by the worker pipeline.
 * 
 * Usage:
 *   tsx src/scripts/backfill-outbox.ts [--batch-size=500] [--dry-run]
 * 
 * Options:
 *   --batch-size=N   Process N mailings per batch (default: 500)
 *   --dry-run        Show what would be done without making changes
 */

import { prisma } from '../config/database.js';

const BATCH_SIZE = 500;
const TARGET_QUEUE = 'mailing.jobs.process';

interface BackfillStats {
  totalFound: number;
  totalProcessed: number;
  totalFailed: number;
  batches: number;
}

/**
 * Find mailings that need backfilling
 * - Status is PENDING or QUEUED
 * - No corresponding outbox message exists
 */
async function findMailingsToBackfill(batchSize: number = BATCH_SIZE) {
  const mailings = await prisma.mailing.findMany({
    where: {
      status: {
        in: ['PENDING', 'QUEUED'],
      },
      // Find mailings without outbox messages
      NOT: {
        outboxMessages: {
          some: {},
        },
      },
    },
    select: {
      id: true,
      filename: true,
      storageUrl: true,
      status: true,
      createdAt: true,
    },
    take: batchSize,
    orderBy: {
      createdAt: 'asc', // Process oldest first
    },
  });

  return mailings;
}

/**
 * Create outbox message for a mailing
 */
async function createOutboxMessage(mailing: {
  id: string;
  filename: string;
  storageUrl: string | null;
  status: string;
}) {
  if (!mailing.storageUrl) {
    throw new Error(`Mailing ${mailing.id} has no storage URL`);
  }

  const payload = {
    mailingId: mailing.id,
    filename: mailing.filename,
    storageUrl: mailing.storageUrl,
    attempt: 0, // Initial attempt
    createdAt: new Date().toISOString(),
  };

  await prisma.outboxMessage.create({
    data: {
      mailingId: mailing.id,
      targetQueue: TARGET_QUEUE,
      payload: payload, // Prisma accepts objects directly for Json fields
      published: false,
      attempts: 0,
    },
  });
}

/**
 * Process a batch of mailings
 */
async function processBatch(
  mailings: Array<{
    id: string;
    filename: string;
    storageUrl: string | null;
    status: string;
    createdAt: Date;
  }>,
  dryRun: boolean
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const mailing of mailings) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would create outbox for mailing: ${mailing.id} (${mailing.filename})`);
        console.log(`   Status: ${mailing.status}, Created: ${mailing.createdAt.toISOString()}`);
        success++;
      } else {
        console.log(`Creating outbox message for mailing: ${mailing.id} (${mailing.filename})`);
        
        await createOutboxMessage(mailing);
        
        console.log(`✅ Created outbox message for: ${mailing.id}`);
        success++;
      }
    } catch (error) {
      console.error(`❌ Failed to create outbox for ${mailing.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Get statistics about pending mailings and outbox
 */
async function getStats() {
  const [
    totalPendingMailings,
    totalQueuedMailings,
    totalMailingsWithoutOutbox,
    totalUnpublishedOutbox,
  ] = await Promise.all([
    prisma.mailing.count({
      where: { status: 'PENDING' },
    }),
    prisma.mailing.count({
      where: { status: 'QUEUED' },
    }),
    prisma.mailing.count({
      where: {
        status: {
          in: ['PENDING', 'QUEUED'],
        },
        NOT: {
          outboxMessages: {
            some: {},
          },
        },
      },
    }),
    prisma.outboxMessage.count({
      where: { published: false },
    }),
  ]);

  return {
    totalPendingMailings,
    totalQueuedMailings,
    totalMailingsWithoutOutbox,
    totalUnpublishedOutbox,
  };
}

/**
 * Main backfill function
 */
async function backfillOutbox(options: {
  batchSize: number;
  dryRun: boolean;
}) {
  console.log('🔄 Starting outbox backfill...');
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Dry run: ${options.dryRun ? 'YES' : 'NO'}`);

  // Get initial stats
  const initialStats = await getStats();
  console.log('\n📊 Initial Statistics:');
  console.log(`   Pending mailings: ${initialStats.totalPendingMailings}`);
  console.log(`   Queued mailings: ${initialStats.totalQueuedMailings}`);
  console.log(`   Mailings without outbox: ${initialStats.totalMailingsWithoutOutbox}`);
  console.log(`   Unpublished outbox messages: ${initialStats.totalUnpublishedOutbox}`);

  if (initialStats.totalMailingsWithoutOutbox === 0) {
    console.log('\n✅ No mailings need backfilling. All done!');
    return;
  }

  console.log(`\n🔧 Found ${initialStats.totalMailingsWithoutOutbox} mailings to backfill`);

  const stats: BackfillStats = {
    totalFound: initialStats.totalMailingsWithoutOutbox,
    totalProcessed: 0,
    totalFailed: 0,
    batches: 0,
  };

  // Process in batches
  let hasMore = true;
  while (hasMore) {
    stats.batches++;
    console.log(`\n📦 Processing batch ${stats.batches}...`);

    const mailings = await findMailingsToBackfill(options.batchSize);
    
    if (mailings.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`   Found ${mailings.length} mailings in this batch`);

    const result = await processBatch(mailings, options.dryRun);
    stats.totalProcessed += result.success;
    stats.totalFailed += result.failed;

    console.log(`   Batch result: ${result.success} success, ${result.failed} failed`);

    // If we got fewer than batch size, we're done
    if (mailings.length < options.batchSize) {
      hasMore = false;
    }
  }

  // Get final stats
  const finalStats = await getStats();
  
  console.log('\n📊 Final Statistics:');
  console.log(`   Pending mailings: ${finalStats.totalPendingMailings}`);
  console.log(`   Queued mailings: ${finalStats.totalQueuedMailings}`);
  console.log(`   Mailings without outbox: ${finalStats.totalMailingsWithoutOutbox}`);
  console.log(`   Unpublished outbox messages: ${finalStats.totalUnpublishedOutbox}`);

  console.log('\n✅ Backfill Summary:');
  console.log(`   Total found: ${stats.totalFound}`);
  console.log(`   Total processed: ${stats.totalProcessed}`);
  console.log(`   Total failed: ${stats.totalFailed}`);
  console.log(`   Batches: ${stats.batches}`);

  if (!options.dryRun) {
    console.log('\n💡 Next steps:');
    console.log('   1. Monitor outbox publisher logs to see messages being published');
    console.log('   2. Check RabbitMQ queue status: docker exec email-mailing-rabbitmq rabbitmqctl list_queues');
    console.log('   3. Monitor worker consumer processing the jobs');
    console.log(`   4. Verify unpublished count goes to zero: SELECT COUNT(*) FROM outbox_messages WHERE published=false;`);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): { batchSize: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let batchSize = BATCH_SIZE;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        batchSize = value;
      }
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Backfill Outbox Script

Usage:
  tsx src/scripts/backfill-outbox.ts [options]

Options:
  --batch-size=N   Process N mailings per batch (default: 500)
  --dry-run        Show what would be done without making changes
  --help, -h       Show this help message

Examples:
  # Dry run to see what would happen
  tsx src/scripts/backfill-outbox.ts --dry-run

  # Process in batches of 100
  tsx src/scripts/backfill-outbox.ts --batch-size=100

  # Actual backfill with default batch size
  tsx src/scripts/backfill-outbox.ts
      `);
      process.exit(0);
    }
  }

  return { batchSize, dryRun };
}

/**
 * Main entry point
 */
async function main() {
  console.log('🚀 Backfill Outbox Script Starting...\n');
  
  try {
    const options = parseArgs();
    console.log(`Options: batchSize=${options.batchSize}, dryRun=${options.dryRun}\n`);
    
    await backfillOutbox(options);
    
    console.log('\n✅ Backfill completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error(`❌ Backfill failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
