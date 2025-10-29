# Technical Challenge — Software Engineer

📋 **[Position Profile](POSITION.md)** - View detailed requirements and responsibilities

**Focus:** quality of process and decisions (requirements understanding, architecture, implementation, reliability)

**Suggested timeline:** 7 days

## Objective

Build a service that reads a **CSV mailing list** and triggers **e-mail sends** using an **authenticated sending API**.

* **Email subject:** *Complete your registration*
* **Email body:** *Thank you for signing up. Please verify your token {token} to continue.*
* **{token}:** must be generated randomly per recipient.

## API Information

**Base URL:** `https://email-test-api-475816.ue.r.appspot.com`

**Documentation:**
* Swagger UI: https://email-test-api-475816.ue.r.appspot.com/docs
* ReDoc: https://email-test-api-475816.ue.r.appspot.com/redoc
* OpenAPI Specification: `openapi.json` (included in repository for offline development/mocking)
* Use `mailing_list.csv` as a dummy data

## Notes

* The mailing may contain **invalid e-mail addresses**.
* The API **only accepts authenticated requests via token** (credentials will be provided).
* Token will expires in 30 minutes (need rotation).
* **Details matter**: not everything needs to be fully implemented, but your **decisions and trade-offs will be evaluated and discussed** during review.
* **LLMs/AI could be used** to assist, **as long as you understand and stay in control** of the code and design you submit.

## Expected scope

**Required**

* **Solution architecture**: draw the solution **in terms of components and cloud services** (even if you do not deploy to cloud). Choose whatever artifacts and level of detail you consider essential. Expect this service to scale, handle multiple mailings of different sizes.
* **Implementation** in an **object-oriented language** of your choice.
* **Unit tests** for your API/service.
* **Evidence** of the system running.

**Optional / desirable (include if you feel comfortable or wish to)**

* **Requirements understanding & work organization** (how you decomposed the problem, brief plan, etc.).
* **Software architecture**: Choose whatever artifacts and level of detail you consider essential to explain your software architecture (static / dynamic / packages)
* **Local environment setup solution** (any approach you prefer to spin up and run locally).
* **README** (at your discretion).
* **CI/CD** configuration.

## Non-functional requirements

* The API has a **low rate limit** and it must be respected.
* **All emails** from the CSV must be sent.
* **Security** is fundamental.
* **Extensibility (as a design exercise only):** consider how your design *could* support replacing the email-sending API with another provider. This is purely for evaluation — **your code will not be reused in our products**.
* **Maintainability** of the code is important.
* **Failures** must be handled; the system must be **idempotent**.
* Provide **logs** that help locate and understand issues.

## 📁 Project Structure

```
cnx-software-engineer-technical-challenge/
├── api/                          # Main application
│   ├── src/                      # Source code
│   ├── prisma/                   # Database schema & migrations
│   ├── test/                     # Test suite
│   │   ├── unit/                 # Unit tests (16 tests)
│   │   ├── integration/          # Integration tests (4 scenarios)
│   │   ├── chaos/                # Chaos tests (3 scenarios)
│   │   ├── fixtures/             # Test data (CSV files)
│   │   ├── setup/                # Test configuration
│   │   └── wiremock/             # API mocking configs
│   ├── package.json              # Dependencies
│   ├── Dockerfile                # Container image
│   └── README.md                 # API documentation
├── docs/                         # Complete documentation
│   ├── architecture.md           # System architecture
│   ├── ROLLOUT_STRATEGY.md       # Incremental deployment guide
│   ├── ROLLOUT_QUICKSTART.md     # Deployment quick reference
│   ├── ROLLOUT_DIAGRAMS.md       # Visual deployment flows
│   ├── API.md                    # REST API reference
│   ├── TEST-PLAN.md              # Testing strategy
│   ├── runbook.md                # Operations guide
│   └── ... (14 documents total)
├── scripts/                      # Utility scripts
│   ├── rollout/                  # Deployment scripts
│   │   ├── 01-apply-migrations.ps1
│   │   ├── 02-deploy-publisher.ps1
│   │   ├── 03-sanity-test.ps1
│   │   ├── 04-deploy-consumer-canary.ps1
│   │   ├── 05-observe-canary.ps1
│   │   ├── 06-backfill-outbox.ps1
│   │   ├── 07-scale-consumers.ps1
│   │   ├── rollback.ps1
│   │   ├── collect-evidence.ps1  # Evidence collection
│   │   └── README.md
│   ├── production-smoke-test.ps1 # Production verification (cannot fail)
│   ├── production-monitor.ps1    # Continuous monitoring
│   ├── monitor-backfill.ps1      # Monitoring tools
│   └── test-*.ps1                # Test automation
├── docker-compose.yml            # Production environment
├── docker-compose.test.yml       # Test environment
├── openapi.json                  # API specification
└── README.md                     # This file
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- PowerShell 5.1+ (for production testing scripts)

### Running with Docker

```bash
# Start all services
docker-compose up -d

# Check health
curl http://localhost:3000/health

# Upload CSV file
curl -X POST http://localhost:3000/mailing \
  -F "file=@mailing_list.csv" \
  -F "hasHeader=true"

# Check progress (replace {mailingId} with response from upload)
curl http://localhost:3000/mailing/{mailingId}
```

### 🔍 Production Testing (Robust & Reliable)

The system includes comprehensive production testing scripts that **cannot fail**:

```powershell
# Comprehensive smoke test (all components)
cd scripts
.\production-smoke-test.ps1

# Smoke test with end-to-end validation (creates test data)
.\production-smoke-test.ps1 -SkipEndToEnd:$false

# Continuous monitoring (real-time health checks)
.\production-monitor.ps1

# Test remote production environment
.\production-smoke-test.ps1 -ApiUrl "https://api.prod.example.com"
```

**Features:**
- ✅ 7 testing phases (Health, RabbitMQ, API, Database, Feature Flags, End-to-End, Performance)
- ✅ 20+ individual tests with critical/non-critical classification
- ✅ Automatic alerting on consecutive failures (continuous monitoring)
- ✅ Incident logging for troubleshooting
- ✅ Performance checks (response time, queue depth, DLQ size)
- ✅ Exit codes for CI/CD integration (0=success, 1=failure)

See [scripts/PRODUCTION_TESTS_README.md](scripts/PRODUCTION_TESTS_README.md) for complete documentation.

### API Endpoints

- **Swagger UI**: `GET /docs` - Interactive API documentation
- **Health Check**: `GET /health` - Service health status
- **Metrics**: `GET /metrics` - Prometheus metrics
- **Upload CSV**: `POST /mailings` - Start new mailing (202 Accepted)
- **Get Mailing Status**: `GET /mailings/:id/status` - Progress and counts
- **Get Mailing Entries**: `GET /mailings/:id/entries` - List emails with filters

### Quick API Usage

```bash
# Open Swagger UI in browser
open http://localhost:3000/docs

# Upload CSV file
curl -X POST http://localhost:3000/mailings \
  -F "file=@api/test/fixtures/mailing_list.csv" \
  -F "hasHeader=true"

# Response: { "mailingId": "...", "status": "RUNNING" }

# Check progress
curl http://localhost:3000/mailings/{mailingId}/status

# Get sent emails
curl "http://localhost:3000/mailings/{mailingId}/entries?status=SENT"

# Get failed emails (for retry)
curl "http://localhost:3000/mailings/{mailingId}/entries?status=FAILED&limit=100"
```

### Documentation

- 🎯 [API Reference](docs/API.md) - Complete REST API documentation with examples
- 📖 [Architecture](docs/architecture.md) - System architecture and design
- � **[Rollout Strategy](docs/ROLLOUT_STRATEGY.md)** - Incremental deployment guide with feature flags
- 📋 **[Rollout Quick Start](docs/ROLLOUT_QUICKSTART.md)** - Quick reference for deployment
- 📊 **[Rollout Diagrams](docs/ROLLOUT_DIAGRAMS.md)** - Visual deployment flow and architecture
- �🔄 [Checkpointing](docs/CHECKPOINTING.md) - CSV checkpointing and resume capability
- 🔁 [Retry Policy](docs/RETRY_POLICY.md) - Email sending retry logic and DLQ
- 🔧 [Crash Recovery](docs/CRASH_RECOVERY.md) - Automatic recovery of interrupted work
- 🛑 [Graceful Shutdown](docs/GRACEFUL_SHUTDOWN.md) - Signal handling and clean shutdown
- 📊 [Observability](docs/OBSERVABILITY.md) - Structured logging and Prometheus metrics
- 🧪 [Test Plan](docs/TEST-PLAN.md) - Comprehensive test suite documentation
- 📝 [Test README](api/test/README.md) - Detailed test execution guide
- 🛠️ [Runbook](docs/runbook.md) - Operational procedures and monitoring
- 🐳 [Docker Guide](docs/DOCKER.md) - Container deployment guide
- 💾 [Database Guide](docs/DATABASE_QUICKSTART.md) - Database setup and migrations
- 📋 [Implementation Checklist](docs/IMPLEMENTATION_CHECKLIST.md) - Development progress tracking
- 📁 [Project Organization](docs/PROJECT-ORGANIZATION.md) - Project structure and guidelines
- ✅ [Reorganization Summary](docs/REORGANIZATION-COMPLETE.md) - Recent reorganization details
- 📚 **[Step 14 - Documentation Index](docs/STEP14_INDEX.md)** - Complete Step 14 documentation index
- ✅ **[Step 14 - Acceptance Criteria](docs/STEP14_ACCEPTANCE_CRITERIA.md)** - Complete validation and evidence
- 🔍 **[Step 14 - Validation Guide](docs/STEP14_VALIDATION_GUIDE.md)** - Quick validation commands
- 🧪 **[Production Tests](scripts/PRODUCTION_TESTS_README.md)** - Robust smoke tests and continuous monitoring

## Implementation Details

### Technologies Used

- **Runtime**: Node.js 20 (Alpine)
- **Language**: TypeScript 5.x (strict mode)
- **Framework**: Fastify 5.x (high performance)
- **Database**: PostgreSQL 16
- **ORM**: Prisma 6.x
- **CSV Processing**: csv-parse (streaming)
- **File Upload**: @fastify/multipart
- **Logging**: Pino (structured JSON logs)
- **Metrics**: prom-client (Prometheus)
- **Container**: Docker multi-stage builds

### Key Features

✅ **Streaming CSV Processing** - Handles files of any size without memory overflow  
✅ **Checkpointing & Resume** - Automatically resumes from last checkpoint after interruption  
✅ **Crash Recovery** - Detects and recovers stale jobs on application boot  
✅ **Encoding Detection** - Auto-detects UTF-8, UTF-8-BOM, ISO-8859-1  
✅ **Batch Insertion** - Configurable batch size for optimal performance (default: 500)  
✅ **Progress Tracking** - Periodic checkpoints with configurable interval (default: 1000 lines)  
✅ **Duplicate Prevention** - Skips duplicates using database constraints and idempotency keys  
✅ **Email Validation** - Layered validation (syntax, disposable, MX records)  
✅ **Outbox Pattern** - Transactional message publishing with reliability guarantees  
✅ **RabbitMQ Integration** - Durable queues, publisher confirms, dead letter queues  
✅ **Worker Pool** - Concurrent email sending with controlled concurrency  
✅ **Smart Retry Policy** - Exponential backoff with jitter for transient failures  
✅ **Dead Letter Queue** - Permanent failures logged for manual review  
✅ **Rate Limiting** - Respects API limits with 11s intervals (10s + 1s safety buffer)  
✅ **Token Management** - Automatic token renewal before expiration  
✅ **Stale Job Recovery** - Re-queues interrupted work automatically  
✅ **Graceful Shutdown** - Handles SIGTERM/SIGINT with proper cleanup  
✅ **Signal Handling** - Stops accepting work, drains queue, persists state  
✅ **Feature Flags** - Enable/disable publisher and consumer for safe rollout  
✅ **Incremental Rollout** - Canary deployments with monitoring and rollback  
✅ **Horizontal Scaling** - Multiple consumer replicas with configurable concurrency  
✅ **Structured Logging** - JSON logs with all required fields (timestamp, level, mailingId, email, status, etc.)  
✅ **Prometheus Metrics** - Complete observability with counters, histograms, and gauges  
✅ **Metrics Endpoint** - `/metrics` endpoint for Prometheus scraping  
✅ **Swagger/OpenAPI** - Interactive API documentation at `/docs`  
✅ **Idempotent** - Safe to retry any operation  
✅ **Auto-Migrations** - Database schema updates on container start  
✅ **Health Checks** - Comprehensive system health monitoring  
✅ **Unit Tests** - 16 unit tests covering atomic operations, lock logic, and idempotency  
✅ **Integration Tests** - 4 full pipeline scenarios including happy path and error handling  
✅ **Chaos Tests** - 3 resilience scenarios including consumer crashes and RabbitMQ downtime  

### Test Results

**Unit Tests** (16 tests):
```
✓ Lock Logic - Atomic Updates (4)
  ✓ Concurrent lock acquisition
  ✓ Lock prevention when already acquired
  ✓ Lock release and re-acquisition
  ✓ Race condition with 5 workers

✓ Consumer Finalization (3)
  ✓ Successful completion
  ✓ Error handling
  ✓ Retry attempt tracking

✓ Publisher - Publish and Confirm (4)
  ✓ Publish confirmation
  ✓ Failed publish handling
  ✓ Unpublished message recovery
  ✓ Crash recovery

✓ Idempotency - Duplicate Prevention (2)
  ✓ Duplicate prevention
  ✓ No reprocessing of completed mailings

Test Files  2 passed (2)
     Tests  16 passed (16)
  Duration  5.02s
```

**Integration Tests** (4 scenarios):
- Happy Path: CSV → Outbox → RabbitMQ → Worker → Completion
- Duplicate Delivery: Idempotency via lock check
- Retry Path: 5xx errors → retry queues → DLQ
- Publisher Crash: Recovery of unpublished messages

**Chaos Tests** (3 scenarios):
- Kill Consumer Mid-Processing
- RabbitMQ Downtime and Recovery
- Concurrent Workers Race Condition

See [TEST-PLAN.md](docs/TEST-PLAN.md) for detailed test documentation and [test/README.md](api/test/README.md) for execution instructions.

**CSV Processing Test** (mailing_list.csv):
- Total rows: 105
- Valid emails: 102
- Invalid emails: 3 (skipped)
- Processing time: ~2 seconds
- Status: ✅ COMPLETED

Evidence: See [CSV_PROCESSING.md](docs/CSV_PROCESSING.md) for detailed test results and logs.

## Deliverables

* Repository link containing what you deem necessary to fulfill the challenge.
* Clear instructions to run locally (and to run tests, if applicable).
* **Evidence** of execution (e.g., screenshots, logs, or a brief report).

## Submission & feedback

* Send the repository link by the agreed date.
* We will provide feedback **within 7 days** after submission.
