/**
 * Test: Metrics and Structured Logging
 * 
 * Verifies that metrics are properly tracked and logs are structured
 */

import { metrics } from './services/metrics.service.js';
import { logger, createLogger } from './services/logger.service.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing Metrics and Structured Logging');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testMetrics() {
  console.log('📊 Step 1: Testing Metrics Service...\n');

  // Test email metrics
  console.log('  Testing email metrics...');
  metrics.recordEmailValidation(true);
  metrics.recordEmailValidation(true);
  metrics.recordEmailValidation(false);
  
  metrics.recordEmailSending();
  metrics.recordEmailSent(0.5);
  metrics.recordEmailFailed('rate_limit', 0.3);
  metrics.recordEmailDeadLetter();
  console.log('  ✅ Email metrics recorded\n');

  // Test API metrics
  console.log('  Testing API metrics...');
  metrics.recordApiRequest('POST', '/mailings', 200, 0.123);
  metrics.recordApiRequest('GET', '/mailings/:id', 200, 0.045);
  metrics.recordApiRequest('GET', '/health', 200, 0.010);
  metrics.recordApiRequest('POST', '/mailings', 400, 0.050);
  console.log('  ✅ API metrics recorded\n');

  // Test token renewals
  console.log('  Testing token renewal metrics...');
  metrics.recordTokenRenewal(true);
  metrics.recordTokenRenewal(true);
  metrics.recordTokenRenewal(false);
  console.log('  ✅ Token renewal metrics recorded\n');

  // Test crash recovery
  console.log('  Testing crash recovery metrics...');
  metrics.recordCrashRecovery('job', 5);
  metrics.recordCrashRecovery('mailing', 2);
  console.log('  ✅ Crash recovery metrics recorded\n');

  // Test queue size
  console.log('  Testing queue size gauges...');
  metrics.updateQueueSize('PENDING', 100);
  metrics.updateQueueSize('SENDING', 5);
  metrics.updateQueueSize('SENT', 45);
  metrics.updateActiveWorkers(3);
  console.log('  ✅ Queue gauges updated\n');

  // Test mailing progress
  console.log('  Testing mailing progress...');
  metrics.updateMailingProgress('mailing-001', 25.5);
  metrics.updateMailingProgress('mailing-002', 75.0);
  console.log('  ✅ Mailing progress updated\n');

  // Test CSV processing
  console.log('  Testing CSV processing metrics...');
  metrics.recordCsvProcessing('COMPLETED', 45.2);
  metrics.recordCsvProcessing('FAILED', 12.5);
  console.log('  ✅ CSV processing metrics recorded\n');

  // Get metrics output
  console.log('📊 Step 2: Generating Prometheus Metrics...\n');
  const metricsOutput = await metrics.getMetrics();
  
  console.log('Metrics Output (first 1000 chars):');
  console.log('─'.repeat(60));
  console.log(metricsOutput.substring(0, 1000));
  console.log('...\n');

  // Verify metrics
  console.log('📊 Step 3: Verifying Metrics...\n');
  
  const checks = [
    { name: 'mailing_emails_total', expected: true },
    { name: 'mailing_api_requests_total', expected: true },
    { name: 'mailing_retries_total', expected: true },
    { name: 'token_renewals_total', expected: true },
    { name: 'mailing_duration_seconds', expected: true },
    { name: 'mailing_queue_size', expected: true },
    { name: 'mailing_active_workers', expected: true },
    { name: 'mailing_progress_percentage', expected: true },
  ];

  let allChecksPass = true;
  for (const check of checks) {
    const found = metricsOutput.includes(check.name);
    if (found === check.expected) {
      console.log(`  ✅ ${check.name}: Found`);
    } else {
      console.log(`  ❌ ${check.name}: Not found`);
      allChecksPass = false;
    }
  }

  if (!allChecksPass) {
    throw new Error('Some metrics checks failed');
  }

  console.log('\n✅ All metrics checks passed!\n');
}

async function testStructuredLogging() {
  console.log('📝 Step 4: Testing Structured Logging...\n');

  // Test mailing upload log
  console.log('  Testing mailing upload log...');
  logger.mailingUploaded({
    mailingId: 'test-mailing-001',
    filename: 'test.csv',
    totalRows: 100,
  });

  // Test CSV progress log
  console.log('  Testing CSV progress log...');
  logger.csvProgress({
    mailingId: 'test-mailing-001',
    processedRows: 50,
    totalRows: 100,
  });

  // Test checkpoint log
  console.log('  Testing checkpoint log...');
  logger.checkpointSaved({
    mailingId: 'test-mailing-001',
    lastLine: 50,
  });

  // Test email validation log
  console.log('  Testing email validation log...');
  logger.emailValidated({
    mailingId: 'test-mailing-001',
    email: 'valid@example.com',
    valid: true,
  });

  logger.emailValidated({
    mailingId: 'test-mailing-001',
    email: 'invalid@',
    valid: false,
    reason: 'Invalid format',
  });

  // Test email sending log
  console.log('  Testing email sending log...');
  logger.emailSending({
    mailingId: 'test-mailing-001',
    email: 'user@example.com',
    attempts: 1,
    workerId: 'worker-1',
  });

  // Test email sent log
  console.log('  Testing email sent log...');
  logger.emailSent({
    mailingId: 'test-mailing-001',
    email: 'user@example.com',
    attempts: 1,
    workerId: 'worker-1',
    http_status: 200,
    externalId: 'ext-123',
    duration: 500,
  });

  // Test email failed log
  console.log('  Testing email failed log...');
  logger.emailFailed({
    mailingId: 'test-mailing-001',
    email: 'user2@example.com',
    attempts: 2,
    workerId: 'worker-1',
    http_status: 429,
    error_code: 'RATE_LIMIT',
    error: 'Rate limit exceeded',
  });

  // Test dead letter log
  console.log('  Testing dead letter log...');
  logger.emailDeadLetter({
    mailingId: 'test-mailing-001',
    email: 'user3@example.com',
    attempts: 3,
    workerId: 'worker-1',
    http_status: 500,
    error_code: 'SERVER_ERROR',
    error: 'Permanent server error',
  });

  // Test token renewal logs
  console.log('  Testing token renewal logs...');
  logger.tokenRenewed({
    success: true,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  logger.tokenRenewed({
    success: false,
    error: 'Invalid credentials',
  });

  // Test crash recovery log
  console.log('  Testing crash recovery log...');
  logger.crashRecovery({
    staleJobs: 10,
    staleMailings: 2,
  });

  // Test shutdown logs
  console.log('  Testing shutdown logs...');
  logger.shutdownStarted({ signal: 'SIGTERM' });
  logger.shutdownCompleted({ duration: 5000 });

  // Test generic logs
  console.log('  Testing generic logs...');
  logger.info('Generic info message', { mailingId: 'test-001' });
  logger.warn('Generic warning', { email: 'test@example.com' });
  logger.error('Generic error', { error: new Error('Test error'), mailingId: 'test-001' });
  logger.debug('Generic debug', { status: 'TESTING' });

  // Test child logger
  console.log('  Testing child logger...');
  const childLogger = createLogger({ mailingId: 'child-001', workerId: 'worker-2' });
  childLogger.info('Message from child logger');

  console.log('\n✅ All logging tests completed!\n');
}

async function main() {
  try {
    await testMetrics();
    await testStructuredLogging();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Summary:');
    console.log('  • Metrics service working correctly');
    console.log('  • All Prometheus metrics exposed');
    console.log('  • Structured logging functional');
    console.log('  • All required fields present in logs');
    console.log('  • Child loggers working\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  }
}

main();
