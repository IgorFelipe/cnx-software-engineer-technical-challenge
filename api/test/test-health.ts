import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function testHealthEndpoint(): Promise<void> {
  console.log('🧪 Testing /health endpoint...\n');

  try {
    const response = await axios.get(`${BASE_URL}/health`);
    
    console.log('✅ Health check successful!\n');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\nStatus Code:', response.status);
    
    // Validate response structure
    const { status, timestamp, database } = response.data;
    
    console.log('\n📊 Validation:');
    console.log(`  ✓ Status: ${status}`);
    console.log(`  ✓ Timestamp: ${timestamp}`);
    console.log(`  ✓ Database status: ${database.status}`);
    console.log(`  ✓ Database response time: ${database.responseTime}ms`);
    
    if (database.status === 'connected') {
      console.log('\n✅ Database connection is healthy!');
    } else {
      console.log('\n⚠️  Database is not connected!');
    }
    
  } catch (error) {
    const err = error as Error & { response?: { status: number; data: unknown } };
    console.error('❌ Health check failed:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}

testHealthEndpoint();
