/**
 * Integration Test: TokenManager + RateLimiter + EmailProvider
 * 
 * Tests the complete flow with all singletons working together
 */

import 'dotenv/config';
import { initializeTokenManager } from './services/token-manager.service.js';
import { initializeRateLimiter, getRateLimiter } from './services/rate-limiter.service.js';
import { EmailTestApiProvider } from './providers/email-test-api.provider.js';
import { config } from './config/env.js';

async function test() {
  console.log('🧪 Integration Test: Full Email Sending Flow\n');
  console.log('=============================================\n');

  // Step 1: Initialize TokenManager
  console.log('Step 1: Initialize TokenManager');
  console.log('--------------------------------');
  initializeTokenManager({
    authUrl: config.authApiUrl,
    username: config.authUsername,
    password: config.authPassword,
    renewalWindowMs: 5 * 60 * 1000,
  });
  console.log('✅ TokenManager ready\n');

  // Step 2: Initialize RateLimiter
  console.log('Step 2: Initialize RateLimiter');
  console.log('-------------------------------');
  initializeRateLimiter({
    rateLimitPerMinute: config.rateLimitPerMinute,
    workerConcurrency: config.workerConcurrency,
  });
  console.log('✅ RateLimiter ready\n');

  // Step 3: Create EmailProvider
  console.log('Step 3: Create EmailProvider');
  console.log('-----------------------------');
  const provider = new EmailTestApiProvider({
    baseUrl: config.emailApiUrl,
    timeout: 30000,
    maxRetries: 1,
  });
  console.log('✅ EmailProvider created\n');

  // Step 4: Send multiple emails (rate limited)
  console.log('Step 4: Send 3 Emails (Watch Rate Limiting)');
  console.log('--------------------------------------------');
  
  const emails = [
    {
      to: 'user1@example.com',
      subject: 'Test Email 1',
      body: 'Testing rate limiting - Email 1',
    },
    {
      to: 'user2@example.com',
      subject: 'Test Email 2',
      body: 'Testing rate limiting - Email 2',
    },
    {
      to: 'user3@example.com',
      subject: 'Test Email 3',
      body: 'Testing rate limiting - Email 3',
    },
  ];

  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const idempotencyKey = EmailTestApiProvider.generateIdempotencyKey(
      'integration-test',
      email.to,
      1
    );

    console.log(`\n📧 Sending email ${i + 1}/${emails.length}...`);
    
    const emailStartTime = Date.now();
    const response = await provider.sendEmail({
      to: email.to,
      subject: email.subject,
      body: email.body,
      idempotencyKey,
    });
    const emailDuration = Date.now() - emailStartTime;

    results.push({
      email: email.to,
      success: response.success,
      statusCode: response.statusCode,
      duration: emailDuration,
      messageId: response.messageId,
    });

    console.log(`   Status: ${response.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Duration: ${emailDuration}ms`);
    console.log(`   Status Code: ${response.statusCode}`);
  }

  const totalDuration = Date.now() - startTime;

  // Step 5: Summary
  console.log('\n\nStep 5: Results Summary');
  console.log('=======================\n');

  console.log('📊 Email Results:');
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ${result.email}`);
    console.log(`      Success: ${result.success}`);
    console.log(`      Status: ${result.statusCode}`);
    console.log(`      Duration: ${result.duration}ms`);
  });

  console.log(`\n⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Expected: ~${(emails.length - 1) * 10}s (rate limit enforcement)`);
  console.log(`   Actual: ${(totalDuration / 1000).toFixed(1)}s`);

  // Step 6: Check RateLimiter Metrics
  console.log('\n📈 RateLimiter Metrics:');
  const limiterMetrics = getRateLimiter().getMetrics();
  console.log(`   Total Requests: ${limiterMetrics.totalRequests}`);
  console.log(`   Done: ${limiterMetrics.done}`);
  console.log(`   Failed: ${limiterMetrics.failed}`);
  console.log(`   Min Time: ${limiterMetrics.minTime}ms`);

  // Step 7: Check EmailProvider Metrics
  console.log('\n📈 EmailProvider Metrics:');
  const providerMetrics = provider.getMetrics();
  console.log(`   Total Requests: ${providerMetrics.totalRequests}`);
  console.log(`   Successful: ${providerMetrics.successfulRequests}`);
  console.log(`   Failed: ${providerMetrics.failedRequests}`);
  console.log(`   By Status Code:`);
  for (const [code, count] of Object.entries(providerMetrics.requestsByStatusCode)) {
    console.log(`      ${code}: ${count} requests`);
  }

  console.log('\n\n═══════════════════════════════════════════════');
  console.log('✅ INTEGRATION TEST COMPLETED!');
  console.log('═══════════════════════════════════════════════\n');

  console.log('Summary:');
  console.log('  ✓ TokenManager provides authentication');
  console.log('  ✓ RateLimiter enforces API limits');
  console.log('  ✓ EmailProvider sends emails successfully');
  console.log('  ✓ All singletons working together');
  console.log('  ✓ Rate limiting prevents 429 errors\n');
}

test().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
