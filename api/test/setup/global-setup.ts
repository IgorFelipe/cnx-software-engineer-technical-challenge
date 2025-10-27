/**
 * Global Setup for Vitest
 * Runs once before all test suites
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function setup() {
  console.log('🔧 Global test setup starting...');
  
  // 1. Check if Docker services are running
  console.log('📦 Checking Docker services...');
  try {
    const { stdout } = await execAsync('docker-compose ps');
    
    if (!stdout.includes('email-mailing-db') || !stdout.includes('Up')) {
      console.warn('⚠️  Database not running. Starting services...');
      await execAsync('docker-compose up -d db rabbitmq');
      
      // Wait for services to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('✅ Docker services running');
    }
  } catch (error) {
    console.error('❌ Failed to check Docker services:', error);
    throw error;
  }
  
  // 2. Run migrations
  console.log('🗄️  Running database migrations...');
  try {
    await execAsync('npm run db:migrate:prod');
    console.log('✅ Migrations applied');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
  
  // 3. Clean test data
  console.log('🧹 Cleaning test data...');
  try {
    await execAsync(`docker exec email-mailing-db psql -U postgres -d email_mailing -c "DELETE FROM dead_letters; DELETE FROM outbox_messages; DELETE FROM mailings;"`);
    console.log('✅ Test data cleaned');
  } catch (error) {
    console.warn('⚠️  Failed to clean test data:', error);
    // Non-fatal, continue
  }
  
  console.log('✅ Global test setup complete\n');
}

export async function teardown() {
  console.log('\n🔧 Global test teardown starting...');
  
  // Clean up test data
  console.log('🧹 Cleaning up test data...');
  try {
    await execAsync(`docker exec email-mailing-db psql -U postgres -d email_mailing -c "DELETE FROM dead_letters; DELETE FROM outbox_messages; DELETE FROM mailings;"`);
    console.log('✅ Test data cleaned');
  } catch (error) {
    console.warn('⚠️  Failed to clean test data:', error);
  }
  
  console.log('✅ Global test teardown complete');
}
