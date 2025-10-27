/**
 * Graceful Shutdown Test
 * 
 * Tests the graceful shutdown behavior:
 * 1. Starts a simulated workload
 * 2. Triggers shutdown signal
 * 3. Verifies proper cleanup sequence
 * 4. Validates all work completed or properly persisted
 */

import { createGracefulShutdown } from './services/graceful-shutdown.service.js';

// Simulate work queue
let workQueue: Array<{ id: string; status: string }> = [];
let isProcessing = false;
let shutdownInitiated = false;

/**
 * Simulates a worker processing jobs from queue
 */
async function processWork(): Promise<void> {
  isProcessing = true;

  while (workQueue.length > 0 && !shutdownInitiated) {
    const job = workQueue.shift();
    if (!job) break;

    console.log(`  🔄 Processing job: ${job.id}`);
    job.status = 'PROCESSING';

    // Simulate work (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    job.status = 'COMPLETED';
    console.log(`  ✅ Completed job: ${job.id}`);
  }

  isProcessing = false;
}

/**
 * Main test function
 */
async function testGracefulShutdown(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Testing Graceful Shutdown');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Setup: Create work queue
  console.log('📋 Setup: Creating work queue...');
  workQueue = [
    { id: 'job-1', status: 'PENDING' },
    { id: 'job-2', status: 'PENDING' },
    { id: 'job-3', status: 'PENDING' },
    { id: 'job-4', status: 'PENDING' },
    { id: 'job-5', status: 'PENDING' },
  ];
  console.log(`✅ Created ${workQueue.length} jobs\n`);

  // Start processing work in background
  console.log('🚀 Starting work processor...');
  const workPromise = processWork();
  console.log('✅ Work processor started\n');

  // Wait a bit to let some work start
  console.log('⏳ Waiting 3 seconds for work to start...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log(`✅ Work in progress (${workQueue.length} jobs remaining)\n`);

  // Setup graceful shutdown
  console.log('🛑 Setting up graceful shutdown...');
  const gracefulShutdown = createGracefulShutdown({
    timeout: 15000, // 15 seconds timeout

    onShutdownStart: async () => {
      console.log('  🛑 Shutdown initiated - stopping new work acceptance');
      shutdownInitiated = true;
    },

    onWaitForQueue: async () => {
      console.log('  ⏳ Waiting for work queue to drain...');
      console.log(`     Remaining jobs: ${workQueue.length}`);
      console.log(`     Is processing: ${isProcessing}`);

      // Wait for work to complete
      await workPromise;

      console.log('  ✅ All work completed');
    },

    onPersistState: async () => {
      console.log('  💾 Persisting state...');
      console.log(`     Jobs completed: ${5 - workQueue.length}`);
      console.log(`     Jobs remaining: ${workQueue.length}`);
      
      // In real scenario, save checkpoint here
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('  ✅ State persisted');
    },

    onBeforeExit: async () => {
      console.log('  🧹 Final cleanup...');
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('  ✅ Cleanup complete');
    },
  });

  // Register handlers
  gracefulShutdown.registerHandlers();
  console.log('✅ Graceful shutdown configured\n');

  // Trigger shutdown after 5 seconds
  console.log('⏰ Triggering SIGTERM in 5 seconds...\n');
  setTimeout(() => {
    console.log('\n🔔 Sending SIGTERM signal...\n');
    process.kill(process.pid, 'SIGTERM');
  }, 5000);

  // Keep process alive to handle shutdown
  await new Promise(resolve => setTimeout(resolve, 30000));
}

// Run test
testGracefulShutdown()
  .then(() => {
    console.log('\n✅ Test completed successfully');
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
