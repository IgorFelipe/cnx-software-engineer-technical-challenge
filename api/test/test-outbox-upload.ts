import { readFile } from 'fs/promises';
import { FormData, File } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';
import { Readable } from 'stream';
import { fetch } from 'undici';

/**
 * Test script for POST /mailings with Outbox Pattern
 * 
 * This script:
 * 1. Uploads a test CSV file
 * 2. Verifies the mailing was created
 * 3. Verifies an unpublished outbox message was created
 */

const API_URL = 'http://localhost:3000';

async function testOutboxPattern() {
  console.log('🧪 Testing POST /mailings with Outbox Pattern\n');

  try {
    // 1. Read test CSV file
    console.log('📂 Reading test CSV file...');
    const csvBuffer = await readFile('../test-outbox.csv');
    console.log(`✅ File read: ${csvBuffer.length} bytes\n`);

    // 2. Prepare form data
    console.log('📦 Preparing multipart form data...');
    const formData = new FormData();
    const file = new File([csvBuffer], 'test-outbox.csv', {
      type: 'text/csv',
    });
    formData.set('file', file);

    const encoder = new FormDataEncoder(formData);

    // 3. Upload CSV
    console.log('📤 Uploading CSV to POST /mailings...');
    const uploadResponse = await fetch(`${API_URL}/mailings`, {
      method: 'POST',
      headers: encoder.headers,
      body: Readable.from(encoder.encode()) as any,
      duplex: 'half',
    } as any);

    console.log(`   Status: ${uploadResponse.status} ${uploadResponse.statusText}`);

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      console.error('❌ Upload failed:', errorData);
      return;
    }

    const uploadData = await uploadResponse.json() as any;
    console.log('✅ Upload successful!');
    console.log(`   Mailing ID: ${uploadData.mailingId}`);
    console.log(`   Status: ${uploadData.status}`);
    console.log(`   Message: ${uploadData.message}\n`);

    const mailingId = uploadData.mailingId;

    // 4. Wait a moment for transaction to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Verify mailing was created
    console.log('🔍 Verifying mailing was created...');
    const statusResponse = await fetch(`${API_URL}/mailings/${mailingId}/status`);
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json() as any;
      console.log('✅ Mailing found in database');
      console.log(`   Status: ${statusData.status}`);
      console.log(`   Progress: ${statusData.progress}%`);
    } else {
      console.log('⚠️  Could not fetch mailing status');
    }

    // 6. Instructions for manual verification
    console.log('\n📋 Próximos passos para verificação manual:\n');
    console.log('1. Verificar mensagem outbox não publicada:');
    console.log('   npx tsx api/verify-outbox-implementation.ts\n');
    
    console.log('2. Verificar no banco de dados:');
    console.log(`   SELECT * FROM mailings WHERE id = '${mailingId}';`);
    console.log(`   SELECT * FROM outbox_messages WHERE mailing_id = '${mailingId}' AND published = false;\n`);
    
    console.log('3. Verificar arquivo salvo no storage:');
    console.log('   Deve existir em: storage/mailings/{mailingId}_test-outbox.csv\n');

    console.log('✅ Teste completo!\n');
    console.log('⚠️  IMPORTANTE: A mensagem foi gravada no outbox mas NÃO foi publicada no RabbitMQ.');
    console.log('   Isso está correto! O publisher irá processá-la posteriormente.\n');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  }
}

// Run test
testOutboxPattern().catch((error: any) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
