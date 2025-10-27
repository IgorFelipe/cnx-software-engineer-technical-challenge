# Email Mailing API

API service for batch email sending with rate limiting, retry logic, and transactional outbox pattern.

## 📁 Project Structure

```
api/
├── src/                          # Application source code
│   ├── config/                   # Configuration files
│   ├── routes/                   # API routes
│   ├── services/                 # Business logic services
│   ├── workers/                  # Background workers
│   ├── scripts/                  # Utility scripts
│   └── index.ts                  # Application entry point
├── prisma/                       # Database schema and migrations
│   ├── schema.prisma             # Prisma schema
│   └── migrations/               # Database migrations
├── test/                         # Test suite
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── chaos/                    # Chaos engineering tests
│   ├── setup/                    # Test setup and configuration
│   ├── fixtures/                 # Test data (CSV files)
│   └── wiremock/                 # WireMock mock server configs
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.ts              # Test framework configuration
└── Dockerfile                    # Container image definition
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16 (via Docker)
- RabbitMQ 3.13 (via Docker)

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate:prod
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run chaos tests
npm run test:chaos

# Generate coverage report
npm run test:coverage

# Watch mode
npm run test:unit:watch
```

### Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Deploy migrations (production)
npm run db:migrate:prod

# Open Prisma Studio
npm run db:studio

# Reset database
npm run db:reset
```

### Scripts

```bash
# Backfill existing mailings to outbox
npm run backfill:outbox

# Dry run backfill (preview only)
npm run backfill:dry-run
```

## 🔧 Configuration

Configuration is done via environment variables. See `.env.example` for required variables.

Key environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `EXTERNAL_API_BASE_URL` - Email sending API base URL
- `EXTERNAL_API_TOKEN` - Authentication token
- `PORT` - API server port (default: 3000)

## 📚 Documentation

For comprehensive documentation, see the `/docs` directory in the project root:

- [Architecture](../docs/architecture.md) - System design and components
- [API Reference](../docs/API.md) - REST API documentation
- [Test Plan](../docs/TEST-PLAN.md) - Testing strategy and scenarios
- [Runbook](../docs/runbook.md) - Operational procedures

## 🧪 Test Fixtures

Test CSV files are located in `test/fixtures/`:
- `mailing_list.csv` - Sample mailing list (105 entries)
- Various test-*.csv files for different test scenarios

## 🐳 Docker

```bash
# Build image
docker build -t email-mailing-api .

# Run container
docker run -p 3000:3000 --env-file .env email-mailing-api
```

## 📊 Key Features

- ✅ Streaming CSV processing (handles large files)
- ✅ Transactional outbox pattern (guaranteed message delivery)
- ✅ Retry logic with exponential backoff
- ✅ Dead letter queue for permanent failures
- ✅ Atomic lock mechanism (prevents duplicate processing)
- ✅ Graceful shutdown (SIGTERM/SIGINT handling)
- ✅ Structured logging (JSON format)
- ✅ Prometheus metrics
- ✅ Health checks
- ✅ Auto-migrations on startup

## 🔍 Monitoring

- **Health Check**: `GET /health`
- **Metrics**: `GET /metrics` (Prometheus format)
- **API Docs**: `GET /docs` (Swagger UI)

## 🛠️ Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript 5.x
- **Framework**: Fastify 5.x
- **Database**: PostgreSQL 16 + Prisma
- **Message Queue**: RabbitMQ 3.13
- **Testing**: Vitest + WireMock
- **Logging**: Pino
- **Metrics**: prom-client

## 📝 License

See LICENSE file in project root.
