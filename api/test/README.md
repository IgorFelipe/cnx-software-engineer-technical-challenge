# Test Suite Documentation

This directory contains comprehensive tests for the Email Mailing System, covering unit tests, integration tests, and chaos engineering scenarios.

## 📁 Structure

```
test/
├── setup/
│   ├── global-setup.ts       # Runs once before all tests
│   └── test-setup.ts          # Runs before each test file
├── unit/
│   ├── setup.test.ts          # Setup verification tests
│   └── atomic-operations.test.ts  # Core logic tests (16 tests)
├── integration/
│   └── full-pipeline.test.ts  # End-to-end pipeline tests (4 scenarios)
├── chaos/
│   └── chaos-scenarios.ts     # Chaos engineering tests (3 scenarios)
└── wiremock/
    ├── mappings/              # WireMock stub definitions
    │   └── email-api.json
    └── __files/               # Response templates
        └── success-response.json
```

---

## 🚀 Quick Start

### Prerequisites

```bash
# Ensure Docker services are running
docker-compose up -d

# Install dependencies
cd api
npm install
```

### Run Tests

```bash
# All unit tests
npm run test:unit

# Specific test file
npm run test:unit -- atomic-operations

# Watch mode
npm run test:unit:watch

# All tests with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# Chaos tests (manual/semi-automated)
npm run test:chaos
```

---

## 📝 Test Categories

### 1. Unit Tests

**File**: `test/unit/atomic-operations.test.ts`  
**Tests**: 16  
**Duration**: ~5s  
**Status**: ✅ All passing

**Coverage**:
- Lock Logic (4 tests)
  - Concurrent lock acquisition
  - Lock prevention when already acquired
  - Lock release and re-acquisition
  - Race condition with 5 workers

- Consumer Finalization (3 tests)
  - Successful completion
  - Error handling
  - Retry attempt tracking

- Publisher Logic (4 tests)
  - Publish confirmation
  - Failed publish handling
  - Unpublished message recovery
  - Crash recovery

- Idempotency (2 tests)
  - Duplicate prevention
  - No reprocessing of completed mailings

**Run**:
```bash
npm run test:unit
```

**Expected Output**:
```
✓ test/unit/atomic-operations.test.ts (13)
  ✓ Lock Logic - Atomic Updates (4)
  ✓ Consumer Finalization (3)
  ✓ Publisher - Publish and Confirm (4)
  ✓ Idempotency - Duplicate Prevention (2)

Test Files  2 passed (2)
     Tests  16 passed (16)
  Duration  5.02s
```

---

### 2. Integration Tests

**File**: `test/integration/full-pipeline.test.ts`  
**Scenarios**: 4  
**Status**: ✅ Implemented (requires WireMock)

**Scenarios**:
1. **Happy Path**: CSV upload → Outbox → RabbitMQ → Worker → Completion
2. **Duplicate Delivery**: Idempotency via lock check
3. **Retry Path**: 5xx errors → retry queues → DLQ
4. **Publisher Crash**: Recovery of unpublished messages

**Setup**:
```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run tests
npm run test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

---

### 3. Chaos Tests

**File**: `test/chaos/chaos-scenarios.ts`  
**Scenarios**: 3  
**Status**: ✅ Implemented (manual/semi-automated)

**Scenarios**:
1. **Kill Consumer Mid-Processing**
   - Verifies message redelivery
   - Validates lock prevents duplicate processing

2. **RabbitMQ Downtime**
   - Verifies graceful degradation
   - Validates publisher recovery

3. **Concurrent Workers Race**
   - Stress tests lock mechanism
   - Validates only one worker succeeds

**Run**:
```bash
# Automated scenarios
npm run test:chaos

# Manual scenario - Kill consumer
docker-compose up -d
# Upload CSV
docker-compose stop api
docker-compose up -d api
# Verify no duplicate processing
```

---

## 🔧 Configuration

### Vitest Config

**File**: `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './test/setup/global-setup.ts',
    setupFiles: ['./test/setup/test-setup.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
});
```

### Global Setup

**File**: `test/setup/global-setup.ts`

**Actions**:
1. Check Docker services
2. Run database migrations
3. Clean test data

**Runs**: Once before all tests

### Test Setup

**File**: `test/setup/test-setup.ts`

**Actions**:
1. Connect to Prisma
2. Clean data after each test
3. Disconnect after all tests

**Runs**: Before each test file

---

## 📊 Test Data Management

### Cleanup Strategy

**After Each Test**:
```typescript
afterEach(async () => {
  await prisma.deadLetter.deleteMany();
  await prisma.outboxMessage.deleteMany();
  await prisma.mailing.deleteMany();
});
```

**Global Cleanup**:
```bash
# Manual cleanup
docker exec email-mailing-db psql -U postgres -d email_mailing -c "
  DELETE FROM dead_letters;
  DELETE FROM outbox_messages;
  DELETE FROM mailings;
"
```

---

## 🎯 Test Assertions

### Lock Logic
```typescript
// Only one worker should acquire lock
const [result1, result2] = await Promise.all([
  updateMany({ where: { status: 'PENDING' }, data: { status: 'PROCESSING' } }),
  updateMany({ where: { status: 'PENDING' }, data: { status: 'PROCESSING' } })
]);

expect(result1.count + result2.count).toBe(1);
```

### Publisher Confirm
```typescript
// Should mark as published after RabbitMQ confirm
await prisma.outboxMessage.create({
  mailingId, published: false
});

// Simulate publish
await publishToRabbitMQ();

const outbox = await prisma.outboxMessage.findFirst({ where: { mailingId } });
expect(outbox.published).toBe(true);
expect(outbox.publishedAt).toBeDefined();
```

### Idempotency
```typescript
// Duplicate message should not reprocess
const result1 = await lockMailing(id); // count = 1
const result2 = await lockMailing(id); // count = 0

expect(result1.count).toBe(1);
expect(result2.count).toBe(0);
```

---

## 🐛 Debugging Tests

### Verbose Mode
```bash
npm run test:unit -- --reporter=verbose
```

### Run Single Test
```bash
npm run test:unit -- -t "should allow only one worker"
```

### Show Heap Usage
```bash
npm run test:unit -- --logHeapUsage
```

### UI Mode
```bash
npm run test:ui
# Opens browser with test UI
```

### Database State
```bash
# Check current state
docker exec email-mailing-db psql -U postgres -d email_mailing -c "
  SELECT status, COUNT(*) FROM mailings GROUP BY status;
  SELECT published, COUNT(*) FROM outbox_messages GROUP BY published;
"
```

---

## 📚 Best Practices

### 1. Test Isolation
- Each test has its own data
- Global cleanup after each test
- No shared state between tests

### 2. Naming Conventions
- **Descriptive**: `should allow only one worker to acquire lock`
- **Scenario**: `should mark as published after successful publish`
- **Negative**: `should NOT mark as published if publish fails`

### 3. Assertion Patterns
```typescript
// Prefer specific assertions
expect(result.count).toBe(1);

// Over generic assertions
expect(result).toBeTruthy();
```

### 4. Async Handling
```typescript
// Always await async operations
await prisma.mailing.create({ ... });

// Use Promise.all for concurrent operations
const [r1, r2] = await Promise.all([op1(), op2()]);
```

---

## 🔍 Coverage Reports

### Generate Coverage
```bash
npm run test:coverage
```

### View HTML Report
```bash
# Generate report
npm run test:coverage

# Open in browser
start api/coverage/index.html  # Windows
open api/coverage/index.html   # Mac
xdg-open api/coverage/index.html  # Linux
```

### Coverage Thresholds
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

---

## 🚨 Troubleshooting

### Tests Timeout
```bash
# Increase timeout
npm run test:unit -- --testTimeout=10000
```

### Database Connection Issues
```bash
# Check services
docker-compose ps

# Restart services
docker-compose restart db rabbitmq
```

### WireMock Not Starting
```bash
# Check WireMock logs
docker logs email-mailing-wiremock

# Restart WireMock
docker-compose -f docker-compose.test.yml restart wiremock
```

### Prisma Connection Pool
```bash
# If hitting connection limits
# Update .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_mailing?connection_limit=10"
```

---

## 📖 Further Reading

- [Vitest Documentation](https://vitest.dev/)
- [WireMock Documentation](https://wiremock.org/)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing)
- [Chaos Engineering Principles](https://principlesofchaos.org/)

---

## ✅ Status

| Category | Tests | Status |
|----------|-------|--------|
| Unit | 16 | ✅ Passing |
| Integration | 4 | ✅ Implemented |
| Chaos | 3 | ✅ Implemented |
| Coverage | ~80% | ⏳ In Progress |

**Last Updated**: 2024-01-XX
