/**
 * Test script for Idempotency with Rate Limit
 * 
 * Tests idempotency behavior by waiting for rate limit to reset
 */

import 'dotenv/config';
import { EmailTestApiProvider } from './providers/email-test-api.provider.js';
import type { EmailSendRequest } from './types/email.types.js';
import { initializeTokenManager } from './services/token-manager.service.js';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 Testing Idempotency with Rate Limit\n');

  // Initialize TokenManager
  console.log('🔐 Initializing TokenManager...');
  initializeTokenManager({
    authUrl: 'https://email-test-api-475816.ue.r.appspot.com/auth/token',
    username: process.env.AUTH_USERNAME || '',
    password: process.env.AUTH_PASSWORD || '',
    renewalWindowMs: 5 * 60 * 1000,
  });
  console.log('✅ TokenManager initialized\n');

  // Configuration
  const config = {
    baseUrl: 'https://email-test-api-475816.ue.r.appspot.com',
    timeout: 30000,
    maxRetries: 1,
  };

  const provider = new EmailTestApiProvider(config);

  // Test: Send email with same idempotency key after waiting
  console.log('📧 Test: Idempotency After Rate Limit Reset');
  console.log('============================================');
  
  const idempotencyKey = EmailTestApiProvider.generateIdempotencyKey('test-mailing', 'idempotency-test@example.com', 1);
  console.log(`Idempotency Key: ${idempotencyKey}\n`);

  // First request
  console.log('📤 Sending email (attempt 1)...');
  const emailRequest: EmailSendRequest = {
    to: 'idempotency-test@example.com',
    subject: 'Idempotency Test #1',
    body: 'Testing idempotency behavior with rate limits.',
    idempotencyKey,
  };

  const response1 = await provider.sendEmail(emailRequest);
  console.log(`✅ Attempt 1: ${response1.success ? 'Success' : 'Failed'} (Status: ${response1.statusCode})`);
  console.log(`   Message ID: ${response1.messageId || 'N/A'}\n`);

  // Wait for rate limit to reset (10 seconds + buffer)
  console.log('⏳ Waiting 11 seconds for rate limit to reset...');
  await sleep(11000);
  console.log('✅ Rate limit should be reset\n');

  // Second request with SAME idempotency key
  console.log('📤 Sending same email (attempt 2 - same idempotency key)...');
  const response2 = await provider.sendEmail(emailRequest);
  console.log(`${response2.success ? '✅' : '❌'} Attempt 2: ${response2.success ? 'Success' : 'Failed'} (Status: ${response2.statusCode})`);
  console.log(`   Message ID: ${response2.messageId || 'N/A'}`);
  console.log(`   Error: ${response2.error || 'N/A'}\n`);

  // Compare message IDs
  if (response1.messageId && response2.messageId) {
    if (response1.messageId === response2.messageId) {
      console.log('✅ IDEMPOTENCY WORKS: Same message ID returned!');
      console.log(`   Both requests returned: ${response1.messageId}`);
    } else {
      console.log('⚠️  DIFFERENT MESSAGE IDs (new email created)');
      console.log(`   First:  ${response1.messageId}`);
      console.log(`   Second: ${response2.messageId}`);
    }
  } else {
    console.log('⚠️  Could not compare message IDs');
  }

  console.log('\n📊 Final Metrics');
  console.log('================');
  const metrics = provider.getMetrics();
  console.log(`   Total Requests: ${metrics.totalRequests}`);
  console.log(`   Successful: ${metrics.successfulRequests}`);
  console.log(`   Failed: ${metrics.failedRequests}`);
  console.log(`   By Status Code:`);
  for (const [code, count] of Object.entries(metrics.requestsByStatusCode)) {
    console.log(`      ${code}: ${count} requests`);
  }
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
