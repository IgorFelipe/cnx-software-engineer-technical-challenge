/**
 * Test Setup
 * Runs before each test file
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/email_mailing'
    }
  }
});

// Make Prisma available globally in tests
declare global {
  var testPrisma: PrismaClient;
}

global.testPrisma = prisma;

// Setup before all tests in a file
beforeAll(async () => {
  // Ensure database connection
  try {
    await prisma.$connect();
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
});

// Cleanup after each test
afterEach(async () => {
  // Clean up test data after each test
  // This ensures isolation between tests
  try {
    await prisma.deadLetter.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.mailing.deleteMany();
  } catch (error) {
    console.warn('Failed to cleanup after test:', error);
  }
});

// Cleanup after all tests in a file
afterAll(async () => {
  await prisma.$disconnect();
});
