/**
 * Manual Graceful Shutdown Test
 * 
 * Tests graceful shutdown by calling it directly (no signals)
 */

import { GracefulShutdownService } from './services/graceful-shutdown.service.js';
import { initializeRateLimiter, getRateLimiter } from './services/rate-limiter.service.js';
import { prisma } from './config/database.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Manual Graceful Shutdown Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  try {
    // Initialize rate limiter
    console.log('⏱️  Initializing rate limiter...');
    initializeRateLimiter({
      rateLimitPerMinute: 10,
      workerConcurrency: 4,
    });
    const rateLimiter = getRateLimiter();
    console.log('✅ Rate limiter initialized\n');

    // Create shutdown service
    console.log('🛑 Creating graceful shutdown service...');
    const shutdownService = new (GracefulShutdownService as any)({
      timeout: 15000, // 15 seconds
      
      onShutdownStart: async () => {
        console.log('  🛑 Step 1: Stopping acceptance of new work...');
      },
      
      onWaitForQueue: async () => {
        console.log('  ⏳ Step 2: Waiting for rate limiter queue to drain...');
        const metrics = rateLimiter.getMetrics();
        console.log(`     - Queued: ${metrics.queued}`);
        console.log(`     - Running: ${metrics.running}`);
        await rateLimiter.waitForIdle();
        console.log('  ✅ Queue is idle');
      },
      
      onPersistState: async () => {
        console.log('  💾 Step 3: Persisting state...');
        await new Promise(resolve => setTimeout(resolve, 100));
      },
      
      onBeforeExit: async () => {
        console.log('  🧹 Step 4: Final cleanup...');
        await new Promise(resolve => setTimeout(resolve, 100));
      },
    });
    console.log('✅ Shutdown service created\n');

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

    // Wait a bit for work to start
    console.log('⏳ Waiting 8 seconds for work to progress...\n');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Manually trigger shutdown
    console.log('\n🔔 Manually triggering shutdown...\n');
    
    // Call private method via reflection (for testing)
    await (shutdownService as any).handleShutdown('MANUAL_TEST', 0);
    
    console.log('\n✅ Shutdown completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Close database
    await prisma.$disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
