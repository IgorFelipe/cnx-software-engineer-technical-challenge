/**
 * Test startup to verify TokenManager initialization
 */

import 'dotenv/config';

console.log('🧪 Testing API Startup with TokenManager\n');
console.log('==========================================\n');

async function test() {
  try {
    console.log('📦 Importing modules...');
    
    const { initializeTokenManager, getTokenManager } = await import('./services/token-manager.service.js');
    const { config } = await import('./config/env.js');

    console.log('✅ Modules imported successfully\n');

    console.log('🔐 Initializing TokenManager...');
    console.log(`   Auth URL: ${config.authApiUrl}`);
    console.log(`   Username: ${config.authUsername}`);
    console.log(`   Password: ${config.authPassword ? '***' : '(empty)'}\n`);

    if (!config.authApiUrl || !config.authUsername || !config.authPassword) {
      throw new Error('Missing required environment variables (AUTH_API_URL, AUTH_USERNAME, AUTH_PASSWORD)');
    }

    initializeTokenManager({
      authUrl: config.authApiUrl,
      username: config.authUsername,
      password: config.authPassword,
      renewalWindowMs: 5 * 60 * 1000,
    });

    console.log('✅ TokenManager initialized successfully\n');

    // Try to get a token
    console.log('🔑 Getting token from TokenManager...');
    
    const token = await getTokenManager().getToken();
    console.log(`✅ Token obtained: ${token.substring(0, 20)}...${token.substring(token.length - 10)}\n`);

    console.log('✅ ALL TESTS PASSED!');
    console.log('   The API will automatically initialize TokenManager on startup');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
