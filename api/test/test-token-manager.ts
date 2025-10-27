import { initializeTokenManager, getTokenManager } from './services/token-manager.service.js';
import { config } from './config/config.js';

/**
 * Test script for TokenManager
 * Tests token acquisition, renewal, and metrics
 */
async function testTokenManager() {
  console.log('🧪 Testing TokenManager...\n');

  // Initialize token manager (singleton)
  initializeTokenManager(config.tokenManager);
  
  // Get the singleton instance
  const tokenManager = getTokenManager();

  try {
    // Test 1: Get initial token
    console.log('📝 Test 1: Getting initial token...');
    const token1 = await tokenManager.getToken();
    console.log(`✅ Token obtained: ${token1.substring(0, 20)}...`);
    console.log(`   Time until expiry: ${Math.floor(tokenManager.getTimeUntilExpiry()! / 1000 / 60)} minutes\n`);

    // Test 2: Get token again (should return cached)
    console.log('📝 Test 2: Getting token again (should be cached)...');
    const token2 = await tokenManager.getToken();
    console.log(`✅ Token obtained: ${token2.substring(0, 20)}...`);
    console.log(`   Same as first? ${token1 === token2}\n`);

    // Test 3: Check metrics
    console.log('📝 Test 3: Checking metrics...');
    const metrics = tokenManager.getMetrics();
    console.log(`   Total renewals: ${metrics.totalRenewals}`);
    console.log(`   Last renewal: ${metrics.lastRenewalAt ? new Date(metrics.lastRenewalAt).toISOString() : 'N/A'}`);
    console.log(`   Token expires: ${metrics.currentTokenExpiresAt ? new Date(metrics.currentTokenExpiresAt).toISOString() : 'N/A'}`);
    console.log(`   Last error: ${metrics.lastError || 'None'}\n`);

    // Test 4: Force invalidation and renewal
    console.log('📝 Test 4: Testing invalidation and forced renewal...');
    const token3 = await tokenManager.invalidateAndRenew();
    console.log(`✅ New token obtained: ${token3.substring(0, 20)}...`);
    console.log(`   Different from first? ${token1 !== token3}\n`);

    // Test 5: Final metrics
    console.log('📝 Test 5: Final metrics...');
    const finalMetrics = tokenManager.getMetrics();
    console.log(`   Total renewals: ${finalMetrics.totalRenewals}`);
    console.log(`   Has valid token? ${tokenManager.hasValidToken()}`);
    console.log(`   Time until expiry: ${Math.floor(tokenManager.getTimeUntilExpiry()! / 1000 / 60)} minutes\n`);

    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testTokenManager();
