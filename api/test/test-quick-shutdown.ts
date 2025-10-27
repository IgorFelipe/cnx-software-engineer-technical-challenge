/**
 * Quick Graceful Shutdown Test
 * 
 * Automatically triggers shutdown after a few seconds
 */

import { createGracefulShutdown } from './services/graceful-shutdown.service.js';
import { initializeRateLimiter, getRateLimiter } from './services/rate-limiter.service.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Quick Graceful Shutdown Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  // Initialize rate limiter
  console.log('⏱️  Initializing rate limiter...');
  initializeRateLimiter({
    rateLimitPerMinute: 10,
    workerConcurrency: 4,
  });
  const rateLimiter = getRateLimiter();
  console.log('✅ Rate limiter initialized\n');

  // Setup graceful shutdown
  console.log('🛑 Setting up graceful shutdown...');
  const gracefulShutdown = createGracefulShutdown({
    timeout: 15000, // 15 seconds
    
    onShutdownStart: async () => {
      console.log('  🛑 Stopping acceptance of new work...');
    },
    
    onWaitForQueue: async () => {
      console.log('  ⏳ Waiting for rate limiter queue to drain...');
      const metrics = rateLimiter.getMetrics();
      console.log(`     Queued: ${metrics.queued}, Running: ${metrics.running}`);
      await rateLimiter.waitForIdle();
      console.log('  ✅ Queue is idle');
    },
    
    onPersistState: async () => {
      console.log('  💾 Persisting state...');
    },
    
    onBeforeExit: async () => {
      console.log('  🧹 Final cleanup...');
    },
  });

  gracefulShutdown.registerHandlers();
  gracefulShutdown.setupForceShutdownTimeout(30000); // 30 seconds
  console.log('✅ Graceful shutdown configured\n');

  // Queue some work
  console.log('💼 Queuing 5 emails...');
  for (let i = 1; i <= 5; i++) {
    rateLimiter.schedule(async () => {
      console.log(`  📧 Sending email ${i}/5...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`  ✅ Email ${i}/5 sent`);
    });
  }
  console.log('✅ 5 emails queued\n');

  // Auto-trigger shutdown after 8 seconds
  console.log('⏰ Will trigger shutdown in 8 seconds...\n');
  setTimeout(() => {
    console.log('🔔 Triggering SIGTERM...\n');
    process.kill(process.pid, 'SIGTERM');
  }, 8000);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
