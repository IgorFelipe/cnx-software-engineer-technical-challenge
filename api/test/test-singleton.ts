/**
 * Test to verify TokenManager singleton enforcement
 * This test ensures that TokenManager cannot be instantiated directly
 */

import 'dotenv/config';

console.log('🧪 Testing TokenManager Singleton Enforcement\n');
console.log('==============================================\n');

async function test() {
  try {
    console.log('Test 1: Verify TokenManager class is not exported');
    console.log('---------------------------------------------------');
    
    const module = await import('./services/token-manager.service.js');
    
    // Check what's exported
    console.log('Exported members:');
    console.log('  - initializeTokenManager:', typeof module.initializeTokenManager);
    console.log('  - getTokenManager:', typeof module.getTokenManager);
    console.log('  - TokenManager class:', (module as any).TokenManager ? 'EXPORTED (BAD!)' : 'NOT EXPORTED (GOOD!)');
    console.log();
    
    if ((module as any).TokenManager) {
      console.error('❌ FAIL: TokenManager class is exported! Anyone can create instances!');
      process.exit(1);
    }
    
    console.log('✅ PASS: TokenManager class is not exported\n');
    
    // Test 2: Initialize and get instance
    console.log('Test 2: Initialize singleton and get instance');
    console.log('----------------------------------------------');
    
    const { initializeTokenManager, getTokenManager } = module;
    const { config } = await import('./config/env.js');
    
    console.log('Initializing TokenManager...');
    initializeTokenManager({
      authUrl: config.authApiUrl,
      username: config.authUsername,
      password: config.authPassword,
      renewalWindowMs: 5 * 60 * 1000,
    });
    
    console.log('Getting first instance...');
    const instance1 = getTokenManager();
    console.log('Getting second instance...');
    const instance2 = getTokenManager();
    
    if (instance1 === instance2) {
      console.log('✅ PASS: Both calls return the same instance (singleton)\n');
    } else {
      console.error('❌ FAIL: Different instances returned!');
      process.exit(1);
    }
    
    // Test 3: Verify instance works
    console.log('Test 3: Verify singleton instance works');
    console.log('----------------------------------------');
    
    const token = await instance1.getToken();
    console.log(`Token obtained: ${token.substring(0, 20)}...`);
    console.log('✅ PASS: Singleton instance works correctly\n');
    
    console.log('═══════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════');
    console.log();
    console.log('Summary:');
    console.log('  ✓ TokenManager class is NOT exported (cannot be instantiated)');
    console.log('  ✓ Only initializeTokenManager() and getTokenManager() are available');
    console.log('  ✓ getTokenManager() always returns the same instance');
    console.log('  ✓ Singleton pattern is strictly enforced');
    console.log();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
