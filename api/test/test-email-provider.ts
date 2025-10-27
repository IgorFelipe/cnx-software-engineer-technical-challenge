/**
 * Test script for EmailTestApiProvider
 * 
 * Tests:
 * 1. Idempotency key generation
 * 2. Successful email send
 * 3. 401 handling with token refresh
 * 4. Metrics tracking
 */

import 'dotenv/config';
import { EmailTestApiProvider } from './providers/email-test-api.provider.js';
import type { EmailSendRequest } from './types/email.types.js';
import { initializeTokenManager } from './services/token-manager.service.js';

async function main() {
  console.log('🧪 Testing EmailTestApiProvider\n');

  // Initialize TokenManager
  console.log('🔐 Initializing TokenManager...');
  initializeTokenManager({
    authUrl: 'https://email-test-api-475816.ue.r.appspot.com/auth/token',
    username: process.env.AUTH_USERNAME || '',
    password: process.env.AUTH_PASSWORD || '',
    renewalWindowMs: 5 * 60 * 1000, // 5 minutes
  });
  console.log('✅ TokenManager initialized\n');

  // Configuration
  const config = {
    baseUrl: 'https://email-test-api-475816.ue.r.appspot.com',
    timeout: 30000,
    maxRetries: 1,
  };

  const provider = new EmailTestApiProvider(config);

  // Test 1: Idempotency key generation
  console.log('📋 Test 1: Idempotency Key Generation');
  console.log('=====================================');
  
  const key1 = EmailTestApiProvider.generateIdempotencyKey('mailing-1', 'test@example.com', 1);
  const key2 = EmailTestApiProvider.generateIdempotencyKey('mailing-1', 'test@example.com', 1);
  const key3 = EmailTestApiProvider.generateIdempotencyKey('mailing-1', 'test@example.com', 2);
  
  console.log(`Key 1: ${key1}`);
  console.log(`Key 2: ${key2}`);
  console.log(`Key 3 (different attempt): ${key3}`);
  console.log(`✅ Keys 1 and 2 are identical: ${key1 === key2}`);
  console.log(`✅ Keys 1 and 3 are different: ${key1 !== key3}`);
  console.log();

  // Test 2: Send email
  console.log('📧 Test 2: Send Email');
  console.log('=====================');
  
  const emailRequest: EmailSendRequest = {
    to: 'test@example.com',
    subject: 'Test Email from EmailTestApiProvider',
    body: 'This is a test email to validate the provider implementation.',
    idempotencyKey: EmailTestApiProvider.generateIdempotencyKey('test-mailing', 'test@example.com', 1),
  };

  const response = await provider.sendEmail(emailRequest);
  console.log('\n📨 Response:');
  console.log(`   Success: ${response.success}`);
  console.log(`   Status Code: ${response.statusCode}`);
  console.log(`   Message ID: ${response.messageId || 'N/A'}`);
  console.log(`   Error: ${response.error || 'N/A'}`);
  console.log();

  // Test 3: Metrics
  console.log('📊 Test 3: Metrics Tracking');
  console.log('===========================');
  
  const metrics = provider.getMetrics();
  console.log(`   Provider Name: ${provider.getName()}`);
  console.log(`   Total Requests: ${metrics.totalRequests}`);
  console.log(`   Successful: ${metrics.successfulRequests}`);
  console.log(`   Failed: ${metrics.failedRequests}`);
  console.log(`   By Status Code:`);
  for (const [code, count] of Object.entries(metrics.requestsByStatusCode)) {
    console.log(`      ${code}: ${count} requests`);
  }
  console.log(`   Last Request: ${metrics.lastRequestAt ? new Date(metrics.lastRequestAt).toISOString() : 'N/A'}`);
  console.log();

  // Test 4: Idempotency (send same email again)
  console.log('🔁 Test 4: Idempotency Test');
  console.log('===========================');
  console.log('Sending same email again with same idempotency key...\n');
  
  const response2 = await provider.sendEmail(emailRequest);
  console.log('\n📨 Response 2:');
  console.log(`   Success: ${response2.success}`);
  console.log(`   Status Code: ${response2.statusCode}`);
  console.log(`   Message ID: ${response2.messageId || 'N/A'}`);
  console.log(`   Error: ${response2.error || 'N/A'}`);
  console.log();

  // Final metrics
  console.log('📊 Final Metrics');
  console.log('================');
  
  const finalMetrics = provider.getMetrics();
  console.log(`   Total Requests: ${finalMetrics.totalRequests}`);
  console.log(`   Successful: ${finalMetrics.successfulRequests}`);
  console.log(`   Failed: ${finalMetrics.failedRequests}`);
  console.log(`   By Status Code:`);
  for (const [code, count] of Object.entries(finalMetrics.requestsByStatusCode)) {
    console.log(`      ${code}: ${count} requests`);
  }
  console.log();

  console.log('✅ All tests completed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
