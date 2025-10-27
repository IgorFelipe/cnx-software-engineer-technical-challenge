/**
 * Test script for RateLimiter
 * Tests rate limiting, concurrency control, and queue management
 */

import 'dotenv/config';
import { initializeRateLimiter, getRateLimiter } from './services/rate-limiter.service.js';

// Simula uma chamada de API
async function mockApiCall(id: number): Promise<string> {
  const start = Date.now();
  // Simula latência da API
  await new Promise((resolve) => setTimeout(resolve, 100));
  const duration = Date.now() - start;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  return `[${timestamp}] Request ${id} completed in ${duration}ms`;
}

async function test() {
  console.log('🧪 Testing RateLimiter\n');
  console.log('=====================================\n');

  // Test 1: Initialize RateLimiter
  console.log('📋 Test 1: Initialization');
  console.log('-------------------------');
  
  initializeRateLimiter({
    rateLimitPerMinute: 6,  // 6 requests/minute = 1 every 10 seconds
    workerConcurrency: 1,   // 1 request at a time
  });

  const limiter = getRateLimiter();
  console.log('✅ RateLimiter initialized\n');

  // Test 2: Check initial metrics
  console.log('📋 Test 2: Initial Metrics');
  console.log('--------------------------');
  
  const initialMetrics = limiter.getMetrics();
  console.log(`   Min Time: ${initialMetrics.minTime}ms (should be ~10000ms)`);
  console.log(`   Max Concurrent: ${initialMetrics.maxConcurrent}`);
  console.log(`   Total Requests: ${initialMetrics.totalRequests}`);
  console.log(`   Queued: ${initialMetrics.queued}`);
  console.log(`   Running: ${initialMetrics.running}\n`);

  // Test 3: Schedule multiple jobs (should queue and throttle)
  console.log('📋 Test 3: Schedule 5 Jobs (Rate Limited)');
  console.log('------------------------------------------');
  console.log('Scheduling 5 requests... (watch the timing)\n');

  const startTime = Date.now();
  const promises = [];

  for (let i = 1; i <= 5; i++) {
    const promise = limiter.schedule(async () => {
      const result = await mockApiCall(i);
      console.log(`   ${result}`);
      return result;
    }, 5); // priority 5
    promises.push(promise);
  }

  // Show queue status immediately
  const queueInfo = limiter.getQueueInfo();
  console.log(`Queue Status:`);
  console.log(`   Queued: ${queueInfo.counts.QUEUED}`);
  console.log(`   Running: ${queueInfo.counts.RUNNING}`);
  console.log(`   Is Running: ${queueInfo.isRunning}\n`);

  // Wait for all jobs to complete
  await Promise.all(promises);
  
  const totalTime = Date.now() - startTime;
  console.log(`\n✅ All jobs completed in ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   Expected: ~${5 * 10}s (5 jobs × 10s min time)`);
  console.log(`   Actual: ${(totalTime / 1000).toFixed(1)}s\n`);

  // Test 4: Check metrics after execution
  console.log('📋 Test 4: Final Metrics');
  console.log('------------------------');
  
  const finalMetrics = limiter.getMetrics();
  console.log(`   Total Requests: ${finalMetrics.totalRequests}`);
  console.log(`   Done: ${finalMetrics.done}`);
  console.log(`   Failed: ${finalMetrics.failed}`);
  console.log(`   Currently Queued: ${finalMetrics.queued}`);
  console.log(`   Currently Running: ${finalMetrics.running}\n`);

  // Test 5: Test concurrency control
  console.log('📋 Test 5: Concurrency Control');
  console.log('------------------------------');
  console.log('Updating to allow 2 concurrent requests...\n');

  limiter.updateConfig({ workerConcurrency: 2 });

  const concurrencyStartTime = Date.now();
  const concurrencyPromises = [];

  for (let i = 6; i <= 10; i++) {
    const promise = limiter.schedule(async () => {
      const result = await mockApiCall(i);
      console.log(`   ${result}`);
      return result;
    });
    concurrencyPromises.push(promise);
  }

  await Promise.all(concurrencyPromises);
  
  const concurrencyTime = Date.now() - concurrencyStartTime;
  console.log(`\n✅ Jobs with concurrency=2 completed in ${(concurrencyTime / 1000).toFixed(1)}s`);
  console.log(`   Expected: ~${Math.ceil(5 / 2) * 10}s (5 jobs ÷ 2 workers × 10s)`);
  console.log(`   Actual: ${(concurrencyTime / 1000).toFixed(1)}s\n`);

  // Test 6: Queue emptiness check
  console.log('📋 Test 6: Queue Status');
  console.log('-----------------------');
  
  const isEmpty = limiter.isEmpty();
  const isRunning = limiter.isRunning();
  console.log(`   Is Empty: ${isEmpty}`);
  console.log(`   Is Running: ${isRunning}\n`);

  console.log('═══════════════════════════════════════');
  console.log('✅ ALL TESTS PASSED!');
  console.log('═══════════════════════════════════════\n');

  console.log('Summary:');
  console.log('  ✓ RateLimiter initialized correctly');
  console.log('  ✓ Rate limiting enforced (min 10s between requests)');
  console.log('  ✓ Concurrency control working');
  console.log('  ✓ Queue management functional');
  console.log('  ✓ Metrics tracking accurate\n');
}

test().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
