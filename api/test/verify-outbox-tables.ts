/**
 * Script de verificação das tabelas do Outbox Pattern
 * 
 * Este script verifica se as tabelas foram criadas corretamente
 * e exibe informações sobre sua estrutura.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyOutboxTables() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Verificando Tabelas do Outbox Pattern');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Verificar tabela mailings
    console.log('📊 1. Verificando tabela MAILINGS...\n');
    const mailingsCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM mailings
    `;
    console.log(`   ✅ Tabela 'mailings' existe`);
    console.log(`   📈 Registros: ${mailingsCount[0].count}\n`);

    // 2. Verificar tabela outbox_messages
    console.log('📊 2. Verificando tabela OUTBOX_MESSAGES...\n');
    const outboxCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM outbox_messages
    `;
    console.log(`   ✅ Tabela 'outbox_messages' existe`);
    console.log(`   📈 Registros: ${outboxCount[0].count}\n`);

    // 3. Verificar tabela outbox_dead_letters
    console.log('📊 3. Verificando tabela OUTBOX_DEAD_LETTERS...\n');
    const deadLettersCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM outbox_dead_letters
    `;
    console.log(`   ✅ Tabela 'outbox_dead_letters' existe`);
    console.log(`   📈 Registros: ${deadLettersCount[0].count}\n`);

    // 4. Verificar estrutura da tabela mailings
    console.log('🏗️  4. Estrutura da tabela MAILINGS:\n');
    const mailingsStructure = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>>`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_name = 'mailings'
      ORDER BY ordinal_position
    `;

    mailingsStructure.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      console.log(`   • ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${nullable}${defaultVal}`);
    });
    console.log();

    // 5. Verificar estrutura da tabela outbox_messages
    console.log('🏗️  5. Estrutura da tabela OUTBOX_MESSAGES:\n');
    const outboxStructure = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>>`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_name = 'outbox_messages'
      ORDER BY ordinal_position
    `;

    outboxStructure.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      console.log(`   • ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${nullable}${defaultVal}`);
    });
    console.log();

    // 6. Verificar índices
    console.log('🔑 6. Índices criados:\n');
    const indexes = await prisma.$queryRaw<Array<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>>`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN ('mailings', 'outbox_messages', 'outbox_dead_letters')
      ORDER BY tablename, indexname
    `;

    let currentTable = '';
    indexes.forEach((idx: any) => {
      if (idx.tablename !== currentTable) {
        console.log(`\n   📋 Tabela: ${idx.tablename}`);
        currentTable = idx.tablename;
      }
      console.log(`      • ${idx.indexname}`);
    });
    console.log();

    // 7. Verificar constraints e foreign keys
    console.log('🔗 7. Constraints e Foreign Keys:\n');
    const constraints = await prisma.$queryRaw<Array<{
      table_name: string;
      constraint_name: string;
      constraint_type: string;
      column_name: string;
      foreign_table_name: string | null;
      foreign_column_name: string | null;
    }>>`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.table_name IN ('mailings', 'outbox_messages', 'outbox_dead_letters')
      ORDER BY tc.table_name, tc.constraint_type
    `;

    currentTable = '';
    constraints.forEach((constraint: any) => {
      if (constraint.table_name !== currentTable) {
        console.log(`\n   📋 Tabela: ${constraint.table_name}`);
        currentTable = constraint.table_name;
      }

      if (constraint.constraint_type === 'PRIMARY KEY') {
        console.log(`      🔑 PRIMARY KEY: ${constraint.column_name}`);
      } else if (constraint.constraint_type === 'UNIQUE') {
        console.log(`      🎯 UNIQUE: ${constraint.column_name}`);
      } else if (constraint.constraint_type === 'FOREIGN KEY') {
        console.log(`      🔗 FOREIGN KEY: ${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
      }
    });
    console.log();

    // 8. Teste de inserção e leitura
    console.log('🧪 8. Testando operações básicas...\n');

    // Criar um mailing de teste
    const testMailing = await prisma.mailing.create({
      data: {
        filename: 'test-outbox-verification.csv',
        storageUrl: '/tmp/test.csv',
        status: 'PENDING',
        totalLines: 100,
        processedLines: 0,
      },
    });

    console.log(`   ✅ Mailing criado: ${testMailing.id}`);

    // Criar uma mensagem de outbox
    const testOutboxMessage = await prisma.outboxMessage.create({
      data: {
        mailingId: testMailing.id,
        targetQueue: 'mailing.jobs.process',
        payload: {
          mailingId: testMailing.id,
          filename: 'test-outbox-verification.csv',
          storageUrl: '/tmp/test.csv',
          attempt: 0,
          createdAt: new Date().toISOString(),
        },
        attempts: 0,
        published: false,
      },
    });

    console.log(`   ✅ Outbox message criada: ${testOutboxMessage.id}`);

    // Verificar relacionamento
    const mailingWithOutbox = await prisma.mailing.findUnique({
      where: { id: testMailing.id },
      include: { outboxMessages: true },
    });

    console.log(`   ✅ Relacionamento verificado: ${mailingWithOutbox?.outboxMessages.length} mensagem(ns) de outbox`);

    // Limpar dados de teste
    await prisma.outboxMessage.deleteMany({
      where: { mailingId: testMailing.id },
    });
    await prisma.mailing.delete({
      where: { id: testMailing.id },
    });

    console.log(`   ✅ Dados de teste removidos\n`);

    // Resumo final
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VERIFICAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Resumo:');
    console.log('   ✅ Tabela mailings criada e funcional');
    console.log('   ✅ Tabela outbox_messages criada e funcional');
    console.log('   ✅ Tabela outbox_dead_letters criada');
    console.log('   ✅ Índices criados corretamente');
    console.log('   ✅ Foreign keys configuradas');
    console.log('   ✅ Relacionamentos funcionando');
    console.log('   ✅ Operações CRUD testadas\n');

    console.log('🎯 Próximos passos:');
    console.log('   1. Implementar serviço de outbox publisher');
    console.log('   2. Criar worker para processar mensagens');
    console.log('   3. Implementar retry logic para outbox');
    console.log('   4. Adicionar monitoramento de outbox\n');

  } catch (error) {
    console.error('❌ Erro ao verificar tabelas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar verificação
verifyOutboxTables()
  .then(() => {
    console.log('✅ Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script falhou:', error);
    process.exit(1);
  });
