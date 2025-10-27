import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  await prisma.deadLetter.deleteMany();
  await prisma.mailingEntry.deleteMany();
  await prisma.mailingProgress.deleteMany();

  console.log('✅ Cleared existing data');

  // Create sample mailing progress
  const mailingProgress = await prisma.mailingProgress.create({
    data: {
      mailingId: 'test-mailing-001',
      totalRows: 5,
      processedRows: 0,
      lastProcessedLine: 0,
      status: 'RUNNING',
    },
  });

  console.log('✅ Created mailing progress:', mailingProgress.mailingId);

  // Create sample mailing entries
  const sampleEmails = [
    { email: 'user1@example.com', token: 'token-001' },
    { email: 'user2@example.com', token: 'token-002' },
    { email: 'user3@example.com', token: 'token-003' },
    { email: 'user4@example.com', token: 'token-004' },
    { email: 'user5@example.com', token: 'token-005' },
  ];

  for (const { email, token } of sampleEmails) {
    await prisma.mailingEntry.create({
      data: {
        mailingId: 'test-mailing-001',
        email,
        token,
        status: 'PENDING',
        attempts: 0,
      },
    });
  }

  console.log(`✅ Created ${sampleEmails.length} mailing entries`);

  // Create a sample dead letter
  await prisma.deadLetter.create({
    data: {
      mailingId: 'test-mailing-001',
      email: 'failed@example.com',
      reason: 'Max retries exceeded',
      attempts: 3,
      lastError: 'Connection timeout after 3 attempts',
    },
  });

  console.log('✅ Created sample dead letter');

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
