import { prisma } from './src/config/database.js';

/**
 * Test script to verify the outbox pattern implementation
 * 
 * This script checks:
 * 1. Unpublished messages in outbox_messages
 * 2. Mailings with PENDING/QUEUED status
 * 3. Relationship between mailings and outbox messages
 */

async function verifyOutboxPattern() {
  console.log('🔍 Verificando implementação do Outbox Pattern...\n');

  try {
    // 1. Check unpublished outbox messages
    console.log('📬 Checando mensagens não publicadas...');
    const unpublishedMessages = await prisma.outboxMessage.findMany({
      where: { published: false },
      include: {
        mailing: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`✅ Total de mensagens não publicadas: ${unpublishedMessages.length}\n`);

    if (unpublishedMessages.length > 0) {
      console.log('📋 Detalhes das mensagens:');
      unpublishedMessages.forEach((msg: any, index: number) => {
        console.log(`\n   ${index + 1}. Outbox Message ID: ${msg.id}`);
        console.log(`      • Mailing ID: ${msg.mailingId}`);
        console.log(`      • Target Queue: ${msg.targetQueue}`);
        console.log(`      • Attempts: ${msg.attempts}`);
        console.log(`      • Published: ${msg.published}`);
        console.log(`      • Created At: ${msg.createdAt.toISOString()}`);
        console.log(`      • Mailing Status: ${msg.mailing.status}`);
        console.log(`      • Mailing Filename: ${msg.mailing.filename}`);
        console.log(`      • Storage URL: ${msg.mailing.storageUrl}`);
        console.log(`      • Payload:`, JSON.stringify(msg.payload, null, 2));
      });
    }

    // 2. Check mailings with PENDING or QUEUED status
    console.log('\n\n📊 Checando mailings PENDING/QUEUED...');
    const pendingMailings = await prisma.mailing.findMany({
      where: {
        status: {
          in: ['PENDING', 'QUEUED'],
        },
      },
      include: {
        outboxMessages: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`✅ Total de mailings PENDING/QUEUED: ${pendingMailings.length}\n`);

    if (pendingMailings.length > 0) {
      console.log('📋 Detalhes dos mailings:');
      pendingMailings.forEach((mailing: any, index: number) => {
        console.log(`\n   ${index + 1}. Mailing ID: ${mailing.id}`);
        console.log(`      • Filename: ${mailing.filename}`);
        console.log(`      • Status: ${mailing.status}`);
        console.log(`      • Storage URL: ${mailing.storageUrl}`);
        console.log(`      • Total Lines: ${mailing.totalLines ?? 'N/A'}`);
        console.log(`      • Processed Lines: ${mailing.processedLines}`);
        console.log(`      • Attempts: ${mailing.attempts}`);
        console.log(`      • Created At: ${mailing.createdAt.toISOString()}`);
        console.log(`      • Outbox Messages: ${mailing.outboxMessages.length}`);
      });
    }

    // 3. Statistics
    console.log('\n\n📈 Estatísticas:');
    const totalMailings = await prisma.mailing.count();
    const totalOutboxMessages = await prisma.outboxMessage.count();
    const publishedMessages = await prisma.outboxMessage.count({
      where: { published: true },
    });

    console.log(`   • Total de mailings: ${totalMailings}`);
    console.log(`   • Total de outbox messages: ${totalOutboxMessages}`);
    console.log(`   • Mensagens publicadas: ${publishedMessages}`);
    console.log(`   • Mensagens não publicadas: ${unpublishedMessages.length}`);

    // 4. Verify atomic transaction consistency
    console.log('\n\n🔐 Verificando consistência (atomicidade):');
    const mailingsWithoutOutbox = await prisma.mailing.findMany({
      where: {
        outboxMessages: {
          none: {},
        },
      },
    });

    if (mailingsWithoutOutbox.length === 0) {
      console.log('   ✅ Todos os mailings têm pelo menos uma mensagem outbox');
    } else {
      console.log(`   ⚠️  Encontrados ${mailingsWithoutOutbox.length} mailings sem mensagem outbox`);
      mailingsWithoutOutbox.forEach((m: any) => {
        console.log(`      - Mailing ID: ${m.id} (${m.filename})`);
      });
    }

    console.log('\n✅ Verificação completa!\n');
  } catch (error) {
    console.error('❌ Erro ao verificar outbox pattern:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyOutboxPattern().catch((error: any) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
