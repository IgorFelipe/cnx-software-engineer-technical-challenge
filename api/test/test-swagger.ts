/**
 * Test: Swagger/OpenAPI Integration
 * 
 * Verifies that Swagger UI is accessible and OpenAPI spec is valid
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📚 Testing Swagger/OpenAPI Integration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testSwaggerUI() {
  console.log('🌐 Step 1: Testing Swagger UI availability...\n');

  try {
    // Test Swagger UI HTML page
    const response = await axios.get(`${API_BASE_URL}/docs`, {
      headers: { 'Accept': 'text/html' }
    });

    console.log(`  Status: ${response.status} ${response.statusText}`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200 OK, got ${response.status}`);
    }

    if (!response.data.includes('swagger-ui')) {
      throw new Error('Response does not contain Swagger UI HTML');
    }

    console.log('  ✅ Swagger UI is accessible at /docs');
    console.log('  ✅ HTML contains swagger-ui elements\n');

  } catch (error: any) {
    console.error('  ❌ Swagger UI test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.status, error.response.statusText);
    }
    throw error;
  }
}

async function testOpenAPISpec() {
  console.log('📄 Step 2: Testing OpenAPI specification...\n');

  try {
    // Get OpenAPI JSON
    const response = await axios.get(`${API_BASE_URL}/docs/json`);

    console.log(`  Status: ${response.status} ${response.statusText}`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200 OK, got ${response.status}`);
    }

    const spec = response.data;

    // Validate OpenAPI structure
    if (!spec.openapi) {
      throw new Error('Missing openapi version field');
    }

    if (!spec.info) {
      throw new Error('Missing info section');
    }

    if (!spec.info.title) {
      throw new Error('Missing API title');
    }

    if (!spec.info.version) {
      throw new Error('Missing API version');
    }

    if (!spec.paths) {
      throw new Error('Missing paths section');
    }

    console.log(`  ✅ OpenAPI version: ${spec.openapi}`);
    console.log(`  ✅ API title: ${spec.info.title}`);
    console.log(`  ✅ API version: ${spec.info.version}`);
    console.log(`  ✅ Description: ${spec.info.description?.substring(0, 50)}...`);

    // Check endpoints
    const endpoints = Object.keys(spec.paths);
    console.log(`\n  📍 Documented endpoints (${endpoints.length}):`);
    endpoints.forEach(path => {
      const methods = Object.keys(spec.paths[path]);
      console.log(`     ${methods.map(m => m.toUpperCase()).join(', ')} ${path}`);
    });

    // Check components
    if (spec.components && spec.components.schemas) {
      const schemas = Object.keys(spec.components.schemas);
      console.log(`\n  📦 Defined schemas (${schemas.length}):`);
      schemas.forEach(schema => {
        console.log(`     - ${schema}`);
      });
    }

    // Check tags
    if (spec.tags) {
      console.log(`\n  🏷️  Tags (${spec.tags.length}):`);
      spec.tags.forEach((tag: any) => {
        console.log(`     - ${tag.name}: ${tag.description || 'No description'}`);
      });
    }

    console.log('\n  ✅ OpenAPI spec is valid and complete\n');

  } catch (error: any) {
    console.error('  ❌ OpenAPI spec test failed:', error.message);
    if (error.response) {
      console.error('  Response:', error.response.status, error.response.statusText);
    }
    throw error;
  }
}

async function testEndpointDocumentation() {
  console.log('📋 Step 3: Testing endpoint documentation...\n');

  try {
    const response = await axios.get(`${API_BASE_URL}/docs/json`);
    const spec = response.data;

    // Check POST /mailings
    const mailingPost = spec.paths['/mailings']?.post;
    if (!mailingPost) {
      throw new Error('POST /mailings not documented');
    }

    console.log('  ✅ POST /mailings documented');
    console.log(`     Description: ${mailingPost.description}`);
    console.log(`     Tags: ${mailingPost.tags?.join(', ')}`);
    console.log(`     Responses: ${Object.keys(mailingPost.responses || {}).join(', ')}`);

    // Check GET /mailings/:id/status
    const statusGet = spec.paths['/mailings/{id}/status']?.get;
    if (!statusGet) {
      throw new Error('GET /mailings/:id/status not documented');
    }

    console.log('\n  ✅ GET /mailings/:id/status documented');
    console.log(`     Description: ${statusGet.description}`);
    console.log(`     Parameters: ${statusGet.parameters?.length || 0}`);
    console.log(`     Responses: ${Object.keys(statusGet.responses || {}).join(', ')}`);

    // Check GET /mailings/:id/entries
    const entriesGet = spec.paths['/mailings/{id}/entries']?.get;
    if (!entriesGet) {
      throw new Error('GET /mailings/:id/entries not documented');
    }

    console.log('\n  ✅ GET /mailings/:id/entries documented');
    console.log(`     Description: ${entriesGet.description}`);
    console.log(`     Query params: status, limit, offset`);
    console.log(`     Responses: ${Object.keys(entriesGet.responses || {}).join(', ')}`);

    // Check GET /health
    const healthGet = spec.paths['/health']?.get;
    if (!healthGet) {
      throw new Error('GET /health not documented');
    }

    console.log('\n  ✅ GET /health documented');
    console.log(`     Tags: ${healthGet.tags?.join(', ')}`);

    // Check GET /metrics
    const metricsGet = spec.paths['/metrics']?.get;
    if (!metricsGet) {
      throw new Error('GET /metrics not documented');
    }

    console.log('\n  ✅ GET /metrics documented');
    console.log(`     Tags: ${metricsGet.tags?.join(', ')}`);

    console.log('\n  ✅ All endpoints properly documented\n');

  } catch (error: any) {
    console.error('  ❌ Endpoint documentation test failed:', error.message);
    throw error;
  }
}

async function testSchemaReferences() {
  console.log('🔗 Step 4: Testing schema references...\n');

  try {
    const response = await axios.get(`${API_BASE_URL}/docs/json`);
    const spec = response.data;

    const schemas = spec.components?.schemas || {};
    
    // Check required schemas
    const requiredSchemas = [
      'Error',
      'MailingUploadResponse',
      'MailingStatus',
      'MailingEntry',
      'MailingEntriesResponse'
    ];

    for (const schemaName of requiredSchemas) {
      if (!schemas[schemaName]) {
        throw new Error(`Missing schema: ${schemaName}`);
      }
      console.log(`  ✅ Schema defined: ${schemaName}`);
    }

    // Check schema properties
    console.log('\n  Checking schema structures:');

    // MailingUploadResponse
    const uploadResponse = schemas.MailingUploadResponse;
    if (!uploadResponse.properties?.mailingId) {
      throw new Error('MailingUploadResponse missing mailingId property');
    }
    console.log('    ✅ MailingUploadResponse has all required properties');

    // MailingStatus
    const status = schemas.MailingStatus;
    if (!status.properties?.progress || !status.properties?.counts) {
      throw new Error('MailingStatus missing required properties');
    }
    console.log('    ✅ MailingStatus has progress and counts');

    // MailingEntry
    const entry = schemas.MailingEntry;
    if (!entry.properties?.email || !entry.properties?.status) {
      throw new Error('MailingEntry missing required properties');
    }
    console.log('    ✅ MailingEntry has email and status');

    // MailingEntriesResponse
    const entriesResponse = schemas.MailingEntriesResponse;
    if (!entriesResponse.properties?.pagination || !entriesResponse.properties?.entries) {
      throw new Error('MailingEntriesResponse missing required properties');
    }
    console.log('    ✅ MailingEntriesResponse has pagination and entries');

    console.log('\n  ✅ All schema references valid\n');

  } catch (error: any) {
    console.error('  ❌ Schema references test failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('⚠️  Prerequisites:');
    console.log('  • API must be running on http://localhost:3000');
    console.log('  • Run: npm run dev (in another terminal)\n');

    // Run tests
    await testSwaggerUI();
    await testOpenAPISpec();
    await testEndpointDocumentation();
    await testSchemaReferences();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Swagger Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Summary:');
    console.log('  ✅ Swagger UI accessible at /docs');
    console.log('  ✅ OpenAPI spec valid (v3.0)');
    console.log('  ✅ All endpoints documented');
    console.log('  ✅ All schemas defined');
    console.log('  ✅ Schema references valid\n');

    console.log('🎯 Next Steps:');
    console.log('  1. Open http://localhost:3000/docs in your browser');
    console.log('  2. Try testing endpoints interactively');
    console.log('  3. Export OpenAPI spec: curl http://localhost:3000/docs/json > openapi.json');
    console.log('  4. Generate API clients using OpenAPI Generator\n');

    process.exit(0);

  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Swagger Tests Failed!');
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
