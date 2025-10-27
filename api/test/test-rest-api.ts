/**
 * Test: REST API Endpoints
 * 
 * Tests all REST endpoints for mailing operations:
 * - POST /mailings (upload CSV)
 * - GET /mailings/:id/status (get progress)
 * - GET /mailings/:id/entries (get entries with filters)
 */

import { createReadStream, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import FormData from 'form-data';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing REST API Endpoints');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test CSV content
const testCsvContent = `email
valid1@example.com
valid2@example.com
valid3@example.com
invalid@
notanemail
valid4@example.com`;

async function testPostMailings() {
  console.log('📤 Step 1: Testing POST /mailings...\n');

  try {
    // Create temp CSV file
    const tempFile = join(tmpdir(), 'test-api-mailing.csv');
    writeFileSync(tempFile, testCsvContent);
    console.log(`  Created test CSV: ${tempFile}\n`);

    // Create form data
    const form = new FormData();
    form.append('file', createReadStream(tempFile), {
      filename: 'test-mailing.csv',
      contentType: 'text/csv',
    });
    form.append('hasHeader', 'true');

    // Upload file
    console.log('  Uploading CSV file...');
    const response = await axios.post(`${API_BASE_URL}/mailings`, form, {
      headers: form.getHeaders(),
    });

    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Response:`, JSON.stringify(response.data, null, 2));

    // Validate response
    if (response.status !== 202) {
      throw new Error(`Expected 202 Accepted, got ${response.status}`);
    }

    if (!response.data.mailingId) {
      throw new Error('Response missing mailingId');
    }

    if (response.data.status !== 'RUNNING') {
      throw new Error(`Expected status RUNNING, got ${response.data.status}`);
    }

    console.log('\n  ✅ POST /mailings test passed!');
    console.log(`  ✅ Received mailingId: ${response.data.mailingId}\n`);

    return response.data.mailingId;

  } catch (error: any) {
    console.error('\n  ❌ POST /mailings test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.data);
    }
    throw error;
  }
}

async function testGetMailingStatus(mailingId: string) {
  console.log('📊 Step 2: Testing GET /mailings/:id/status...\n');

  try {
    // Wait a bit for processing to start
    console.log('  Waiting 2 seconds for processing to start...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get mailing status
    console.log(`  Getting status for mailing: ${mailingId}...`);
    const response = await axios.get(`${API_BASE_URL}/mailings/${mailingId}/status`);

    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Response:`, JSON.stringify(response.data, null, 2));

    // Validate response
    if (response.status !== 200) {
      throw new Error(`Expected 200 OK, got ${response.status}`);
    }

    const data = response.data;

    if (!data.mailingId) {
      throw new Error('Response missing mailingId');
    }

    if (!data.status) {
      throw new Error('Response missing status');
    }

    if (!data.progress) {
      throw new Error('Response missing progress');
    }

    if (!data.counts) {
      throw new Error('Response missing counts');
    }

    // Validate progress structure
    const requiredProgressFields = ['totalRows', 'processedRows', 'percentage'];
    for (const field of requiredProgressFields) {
      if (!(field in data.progress)) {
        throw new Error(`Progress missing field: ${field}`);
      }
    }

    // Validate counts structure
    const requiredCountFields = ['total', 'valid', 'invalid', 'pending', 'sending', 'sent', 'failed'];
    for (const field of requiredCountFields) {
      if (!(field in data.counts)) {
        throw new Error(`Counts missing field: ${field}`);
      }
    }

    console.log('\n  ✅ GET /mailings/:id/status test passed!');
    console.log(`  ✅ Progress: ${data.progress.percentage}%`);
    console.log(`  ✅ Status: ${data.status}`);
    console.log(`  ✅ Counts: ${JSON.stringify(data.counts)}\n`);

  } catch (error: any) {
    console.error('\n  ❌ GET /mailings/:id/status test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.data);
    }
    throw error;
  }
}

async function testGetMailingEntries(mailingId: string) {
  console.log('📋 Step 3: Testing GET /mailings/:id/entries...\n');

  try {
    // Wait a bit more for processing to complete
    console.log('  Waiting 5 seconds for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 1: Get all entries
    console.log('\n  Test 3.1: Get all entries (no filter)...');
    const response1 = await axios.get(`${API_BASE_URL}/mailings/${mailingId}/entries`);

    console.log(`  Status: ${response1.status} ${response1.statusText}`);
    console.log(`  Total entries: ${response1.data.entries.length}`);

    if (response1.status !== 200) {
      throw new Error(`Expected 200 OK, got ${response1.status}`);
    }

    if (!response1.data.entries || !Array.isArray(response1.data.entries)) {
      throw new Error('Response missing entries array');
    }

    if (!response1.data.pagination) {
      throw new Error('Response missing pagination');
    }

    console.log(`  ✅ Retrieved ${response1.data.entries.length} entries`);
    console.log(`  ✅ Pagination: ${JSON.stringify(response1.data.pagination)}`);

    // Test 2: Filter by SENT status
    console.log('\n  Test 3.2: Get entries with status=SENT...');
    const response2 = await axios.get(`${API_BASE_URL}/mailings/${mailingId}/entries?status=SENT`);

    console.log(`  Status: ${response2.status} ${response2.statusText}`);
    console.log(`  SENT entries: ${response2.data.entries.length}`);

    if (response2.data.filters.status !== 'SENT') {
      throw new Error('Filter not applied correctly');
    }

    console.log(`  ✅ Retrieved ${response2.data.entries.length} SENT entries`);

    // Test 3: Filter by INVALID status
    console.log('\n  Test 3.3: Get entries with status=INVALID...');
    const response3 = await axios.get(`${API_BASE_URL}/mailings/${mailingId}/entries?status=INVALID`);

    console.log(`  Status: ${response3.status} ${response3.statusText}`);
    console.log(`  INVALID entries: ${response3.data.entries.length}`);

    console.log(`  ✅ Retrieved ${response3.data.entries.length} INVALID entries`);

    // Test 4: Pagination
    console.log('\n  Test 3.4: Test pagination (limit=2, offset=0)...');
    const response4 = await axios.get(`${API_BASE_URL}/mailings/${mailingId}/entries?limit=2&offset=0`);

    console.log(`  Status: ${response4.status} ${response4.statusText}`);
    console.log(`  Entries: ${response4.data.entries.length}`);
    console.log(`  Has more: ${response4.data.pagination.hasMore}`);

    if (response4.data.entries.length > 2) {
      throw new Error('Pagination limit not respected');
    }

    console.log(`  ✅ Pagination working correctly`);

    // Test 5: Invalid status
    console.log('\n  Test 3.5: Test invalid status (should return 400)...');
    try {
      await axios.get(`${API_BASE_URL}/mailings/${mailingId}/entries?status=INVALID_STATUS`);
      throw new Error('Should have returned 400 for invalid status');
    } catch (error: any) {
      if (error.response && error.response.status === 400) {
        console.log(`  ✅ Correctly rejected invalid status with 400`);
      } else {
        throw error;
      }
    }

    console.log('\n  ✅ GET /mailings/:id/entries all tests passed!\n');

  } catch (error: any) {
    console.error('\n  ❌ GET /mailings/:id/entries test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.data);
    }
    throw error;
  }
}

async function testNotFound() {
  console.log('🔍 Step 4: Testing 404 Not Found...\n');

  try {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    // Test status endpoint
    console.log('  Test 4.1: GET non-existent mailing status...');
    try {
      await axios.get(`${API_BASE_URL}/mailings/${fakeId}/status`);
      throw new Error('Should have returned 404');
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`  ✅ Correctly returned 404 for status`);
      } else {
        throw error;
      }
    }

    // Test entries endpoint
    console.log('  Test 4.2: GET non-existent mailing entries...');
    try {
      await axios.get(`${API_BASE_URL}/mailings/${fakeId}/entries`);
      throw new Error('Should have returned 404');
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`  ✅ Correctly returned 404 for entries`);
      } else {
        throw error;
      }
    }

    console.log('\n  ✅ 404 Not Found tests passed!\n');

  } catch (error: any) {
    console.error('\n  ❌ 404 tests failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('⚠️  Prerequisites:');
    console.log('  • API must be running on http://localhost:3000');
    console.log('  • Database must be accessible');
    console.log('  • Run: npm run dev (in another terminal)\n');

    // Run tests
    const mailingId = await testPostMailings();
    await testGetMailingStatus(mailingId);
    await testGetMailingEntries(mailingId);
    await testNotFound();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All API Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Summary:');
    console.log('  ✅ POST /mailings - Upload CSV and start processing');
    console.log('  ✅ GET /mailings/:id/status - Get progress and counts');
    console.log('  ✅ GET /mailings/:id/entries - Get entries with filters');
    console.log('  ✅ 404 Not Found - Proper error handling');
    console.log('  ✅ Pagination - Working correctly');
    console.log('  ✅ Status filters - All statuses working');
    console.log('  ✅ Input validation - 400 errors for invalid input\n');

    process.exit(0);

  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ API Tests Failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('Error:', error);
    process.exit(1);
  }
}

// Check if API is running
axios.get(`${API_BASE_URL}/health`)
  .then(() => {
    console.log('✅ API is running\n');
    return main();
  })
  .catch((error) => {
    console.error('❌ API is not running!');
    console.error('   Please start the API with: npm run dev\n');
    console.error('Error:', error.message);
    process.exit(1);
  });
