# Arquitetura do Sistema de Email Mailing

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura de Alto Nível](#arquitetura-de-alto-nível)
3. [Componentes Principais](#componentes-principais)
4. [Padrões Arquiteturais](#padrões-arquiteturais)
5. [Fluxo de Dados](#fluxo-de-dados)
6. [Persistência](#persistência)
7. [Comunicação Assíncrona](#comunicação-assíncrona)
8. [Resiliência e Tolerância a Falhas](#resiliência-e-tolerância-a-falhas)
9. [Monitoramento e Observabilidade](#monitoramento-e-observabilidade)

---

## Visão Geral

O sistema é uma aplicação de processamento de emails em massa baseada em arquitetura orientada a eventos, utilizando o padrão **Outbox** para garantir consistência eventual e **RabbitMQ** para processamento assíncrono distribuído.

### Características Principais

- **Processamento Assíncrono**: Upload de CSV e processamento desacoplado
- **Consistência Eventual**: Padrão Outbox garante que nenhuma mensagem seja perdida
- **Tolerância a Falhas**: Retry automático, Dead Letter Queue e crash recovery
- **Escalabilidade Horizontal**: Workers podem ser escalados independentemente
- **Idempotência**: Sistema preparado para reprocessamento seguro
- **Observabilidade**: Métricas Prometheus, logs estruturados e health checks

---

## Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT / USER                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP POST /mailings
                            │ (Upload CSV)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API SERVICE                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  REST API (Fastify)                                        │  │
│  │  - Upload Handler                                          │  │
│  │  - Validation                                              │  │
│  │  - Storage (MinIO/S3)                                      │  │
│  └────────────────┬──────────────────────────────────────────┘  │
│                   │                                              │
│                   ▼                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  CSV Ingestion Service                                     │  │
│  │  - Parse CSV                                               │  │
│  │  - Email Validation                                        │  │
│  │  - Batch Insert                                            │  │
│  └────────────────┬──────────────────────────────────────────┘  │
│                   │                                              │
│                   ▼                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                       │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                │  │
│  │  │ mailings        │  │ mailing_entries  │                │  │
│  │  └─────────────────┘  └──────────────────┘                │  │
│  │  ┌─────────────────┐                                       │  │
│  │  │ outbox_messages │  ← Transactional Outbox              │  │
│  │  └─────────────────┘                                       │  │
│  └────────────────┬──────────────────────────────────────────┘  │
│                   │                                              │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    │ Outbox Publisher (polling)
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         RabbitMQ                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Exchange: mailing.exchange (topic)                       │   │
│  └────┬──────────────────────────────────────────────────┬──┘   │
│       │                                                    │      │
│       ▼                                                    ▼      │
│  ┌──────────────────┐  Retry Logic  ┌──────────────────┐        │
│  │ mailing.jobs     │◄──────────────┤ mailing.retry.1  │        │
│  │ .process         │               │ mailing.retry.2  │        │
│  └────────┬─────────┘               └──────────────────┘        │
│           │                                    │                 │
│           │                         Max Retries│                 │
│           │                                    ▼                 │
│           │                         ┌──────────────────┐         │
│           │                         │ mailing.jobs.dlq │         │
│           │                         └──────────────────┘         │
└───────────┼──────────────────────────────────────────────────────┘
            │
            │ Consumer (prefetch=1)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKER SERVICE                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Worker Consumer                                           │  │
│  │  - Acquire Distributed Lock (PostgreSQL)                  │  │
│  │  - Generate Verification Token                            │  │
│  │  - Send Email (External Service)                          │  │
│  │  - Update Status                                           │  │
│  │  - ACK/NACK Message                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Crash Recovery Service (cron: every 5 min)               │  │
│  │  - Detect stale PROCESSING mailings                       │  │
│  │  - Reset status to PENDING                                 │  │
│  │  - Re-queue via Outbox                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componentes Principais

### 1. API Service

**Responsabilidades:**
- Receber upload de arquivos CSV
- Validar formato e dados
- Armazenar arquivo em storage (MinIO/S3)
- Processar CSV e inserir emails no banco
- Criar mensagens na Outbox transacionalmente

**Tecnologias:**
- **Fastify**: Framework web rápido e eficiente
- **Prisma ORM**: Acesso ao banco de dados com type-safety
- **MinIO**: Storage compatível com S3
- **Pino**: Logging estruturado

### 2. Outbox Publisher

**Responsabilidades:**
- Polling da tabela `outbox_messages`
- Publicar mensagens no RabbitMQ
- Marcar mensagens como publicadas
- Garantir at-least-once delivery

**Funcionamento:**
```
┌─────────────────────────────────────────────────────────┐
│  OUTBOX PUBLISHER CYCLE                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. SELECT * FROM outbox_messages                       │
│     WHERE published = false                             │
│     LIMIT 100                                           │
│     FOR UPDATE SKIP LOCKED                              │
│                                                          │
│  2. FOR EACH message:                                   │
│     ├─ Publish to RabbitMQ                              │
│     ├─ Wait for confirm                                 │
│     └─ UPDATE outbox_messages                           │
│        SET published = true                             │
│        WHERE id = message.id                            │
│                                                          │
│  3. Sleep 1 second                                      │
│                                                          │
│  4. REPEAT                                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. RabbitMQ Message Broker

**Topologia:**

```
                        ┌─────────────────────┐
                        │  mailing.exchange   │
                        │  (type: topic)      │
                        └──────────┬──────────┘
                                   │
                    routing key: mailing.process
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │  mailing.jobs.process                  │
              │  - durable: true                       │
              │  - x-dead-letter-exchange: retry.1     │
              │  - x-message-ttl: none                 │
              └────────────┬───────────────────────────┘
                           │
                 Consumer ACK/NACK
                           │
        ┌──────────────────┼──────────────────┐
        │ ACK              │ NACK             │
        │ (success)        │ (failure)        │
        │                  ▼                  │
        │         ┌──────────────────┐        │
        │         │ mailing.retry.1  │        │
        │         │ TTL: 10s         │        │
        │         └────────┬─────────┘        │
        │                  │                  │
        │         Retry 1: after 10s          │
        │                  │                  │
        │                  ▼                  │
        │         ┌──────────────────┐        │
        │         │ mailing.retry.2  │        │
        │         │ TTL: 30s         │        │
        │         └────────┬─────────┘        │
        │                  │                  │
        │         Retry 2: after 30s          │
        │                  │                  │
        │         Max retries exceeded        │
        │                  │                  │
        │                  ▼                  │
        │         ┌──────────────────┐        │
        │         │ mailing.jobs.dlq │        │
        │         │ (manual review)  │        │
        │         └──────────────────┘        │
        │                                     │
        └─────────────────────────────────────┘
```

### 4. Worker Consumer

**Responsabilidades:**
- Consumir mensagens do RabbitMQ
- Adquirir lock distribuído (evitar duplicação)
- Gerar token de verificação
- Enviar email via serviço externo
- Atualizar status no banco
- ACK/NACK mensagem

**Fluxo de Processamento:**

```
┌─────────────────────────────────────────────────────────┐
│  WORKER CONSUMER FLOW                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Receive message from RabbitMQ                       │
│     ├─ mailingId: uuid                                  │
│     └─ payload: { email, token, ... }                   │
│                                                          │
│  2. Try Acquire Lock (PostgreSQL)                       │
│     UPDATE mailings                                     │
│     SET status = 'PROCESSING',                          │
│         last_attempt = NOW()                            │
│     WHERE id = mailingId                                │
│       AND status IN ('PENDING', 'QUEUED', 'FAILED')     │
│                                                          │
│     ┌─────────────────────────────────────────┐         │
│     │ Lock Acquired?                          │         │
│     └───┬─────────────────────────────────┬───┘         │
│         │ YES                             │ NO          │
│         ▼                                 ▼             │
│  3a. Process Email              3b. Skip (already       │
│      ├─ Generate token               processing)       │
│      ├─ Build payload                └─ ACK msg        │
│      ├─ Log JSON payload                               │
│      ├─ Send to external API                           │
│      └─ Wait for response                              │
│                                                          │
│  4. Handle Response                                     │
│     ┌─────────────────────────────────────────┐         │
│     │ Success?                                │         │
│     └───┬─────────────────────────────────┬───┘         │
│         │ YES                             │ NO          │
│         ▼                                 ▼             │
│  5a. Update DB              5b. Update DB               │
│      status = 'SENT'            status = 'FAILED'       │
│      external_id = msgId        attempts++              │
│                                 last_error = err        │
│                                                          │
│  6. ACK/NACK Message                                    │
│     ├─ Success: ACK (remove from queue)                │
│     └─ Failure: NACK (requeue with retry)              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5. Crash Recovery Service

**Responsabilidades:**
- Detectar mailings em estado inconsistente
- Resetar status de jobs "travados"
- Re-enfileirar mensagens perdidas

**Algoritmo:**

```
┌─────────────────────────────────────────────────────────┐
│  CRASH RECOVERY (runs every 5 minutes)                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Find Stale Mailings                                 │
│     SELECT * FROM mailings                              │
│     WHERE status = 'PROCESSING'                         │
│       AND (last_attempt IS NULL                         │
│            OR last_attempt < NOW() - INTERVAL '30 sec') │
│                                                          │
│  2. FOR EACH stale_mailing:                             │
│     ┌────────────────────────────────────────┐          │
│     │ BEGIN TRANSACTION                      │          │
│     │                                        │          │
│     │ UPDATE mailings                        │          │
│     │ SET status = 'PENDING',                │          │
│     │     last_attempt = NULL                │          │
│     │ WHERE id = stale_mailing.id            │          │
│     │                                        │          │
│     │ INSERT INTO outbox_messages            │          │
│     │ (mailing_id, target_queue, payload)   │          │
│     │ VALUES (...)                           │          │
│     │                                        │          │
│     │ COMMIT                                 │          │
│     └────────────────────────────────────────┘          │
│                                                          │
│  3. Log recovery count                                  │
│                                                          │
│  4. Wait 5 minutes                                      │
│                                                          │
│  5. REPEAT                                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Padrões Arquiteturais

### 1. Transactional Outbox Pattern

**Problema:** Como garantir que uma mensagem seja enviada ao message broker se e somente se uma transação de banco de dados for commitada?

**Solução:** Escrever a mensagem na mesma transação do banco, em uma tabela "outbox". Um processo separado publica essas mensagens.

**Benefícios:**
- ✅ Atomicidade: Mensagem e dados commitados juntos
- ✅ Consistência Eventual: Publisher garante entrega
- ✅ Sem Two-Phase Commit: Mais simples e performático
- ✅ Auditoria: Histórico completo de mensagens

**Diagrama:**

```
┌──────────────────────────────────────────────────────────┐
│  CLIENT REQUEST                                          │
└─────────────────┬────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────┐
│  API SERVICE                                             │
│                                                           │
│  BEGIN TRANSACTION                                       │
│  ┌───────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │  1. INSERT INTO mailings (...)                    │   │
│  │     VALUES (...)                                  │   │
│  │                                                    │   │
│  │  2. INSERT INTO mailing_entries (...)             │   │
│  │     VALUES (...)                                  │   │
│  │                                                    │   │
│  │  3. INSERT INTO outbox_messages (                 │   │
│  │       mailing_id,                                 │   │
│  │       target_queue,                               │   │
│  │       payload,                                    │   │
│  │       published                                   │   │
│  │     ) VALUES (                                    │   │
│  │       '123...',                                   │   │
│  │       'mailing.jobs.process',                     │   │
│  │       '{"mailingId": "123..."}',                  │   │
│  │       false                                       │   │
│  │     )                                             │   │
│  │                                                    │   │
│  └───────────────────────────────────────────────────┘   │
│  COMMIT TRANSACTION                                      │
│                                                           │
└──────────────────────────────────────────────────────────┘
                  │
                  │ All or Nothing!
                  │
                  ▼
┌──────────────────────────────────────────────────────────┐
│  OUTBOX PUBLISHER (separate process)                     │
│                                                           │
│  Polling every 1 second:                                 │
│                                                           │
│  1. SELECT * FROM outbox_messages                        │
│     WHERE published = false                              │
│                                                           │
│  2. Publish to RabbitMQ                                  │
│                                                           │
│  3. UPDATE outbox_messages                               │
│     SET published = true                                 │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 2. Repository Pattern

**Problema:** Acoplamento entre lógica de negócio e detalhes de persistência.

**Solução:** Abstrair acesso ao banco em repositórios dedicados.

**Estrutura:**

```
┌─────────────────────────────────────────────────────────┐
│  SERVICES (Business Logic)                              │
│  ├─ WorkerConsumerService                               │
│  ├─ IngestionService                                    │
│  └─ OutboxPublisherService                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Uses
                 ▼
┌─────────────────────────────────────────────────────────┐
│  REPOSITORIES (Data Access)                             │
│  ├─ MailingRepository                                   │
│  │  ├─ tryAcquireLock(mailingId)                        │
│  │  ├─ markCompleted(mailingId)                         │
│  │  └─ markFailed(mailingId, error)                     │
│  │                                                       │
│  ├─ MailingEntryRepository                              │
│  │  ├─ createInvalidEntry(data)                         │
│  │  └─ upsertEmailResult(data)                          │
│  │                                                       │
│  ├─ OutboxRepository                                    │
│  │  ├─ findPending(limit)                               │
│  │  └─ markPublished(id)                                │
│  │                                                       │
│  └─ DeadLetterRepository                                │
│     ├─ create(mailingId, reason)                        │
│     └─ findByMailingId(mailingId)                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Uses
                 ▼
┌─────────────────────────────────────────────────────────┐
│  PRISMA CLIENT (ORM)                                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL DATABASE                                    │
└─────────────────────────────────────────────────────────┘
```

**Benefícios:**
- ✅ Testabilidade: Fácil mockar repositórios
- ✅ Manutenibilidade: Mudanças isoladas
- ✅ Reusabilidade: Lógica de acesso centralizada
- ✅ Separação de Concerns: Business != Persistence

### 3. Distributed Lock Pattern

**Problema:** Múltiplos workers podem processar o mesmo mailing simultaneamente.

**Solução:** Lock otimista usando UPDATE com condições no PostgreSQL.

**Implementação:**

```sql
-- Try to acquire lock
UPDATE mailings 
SET status = 'PROCESSING',
    last_attempt = NOW()
WHERE id = :mailingId
  AND status IN ('PENDING', 'QUEUED', 'FAILED')
RETURNING *;

-- If rows affected > 0: Lock acquired!
-- If rows affected = 0: Already processing
```

**Cenário de Concorrência:**

```
Time    Worker 1                    Worker 2                DB State
─────────────────────────────────────────────────────────────────────
t0      Receive msg (mailing=123)  Receive msg (mailing=123)  status=PENDING
t1      UPDATE ... WHERE id=123    -                          status=PROCESSING ✓
        (1 row affected)           -                          (Worker 1 locked)
t2      -                          UPDATE ... WHERE id=123    status=PROCESSING
        -                          (0 rows affected)          (No change - already locked)
t3      -                          Skip processing            -
        -                          ACK message                -
t4      Process email...           -                          -
t5      Update status=SENT         -                          status=SENT
t6      ACK message                -                          -
```

---

## Fluxo de Dados

### Upload e Ingestão

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /mailings (CSV file)
     ▼
┌─────────────────────────────────────────────────────────┐
│ API Service                                             │
│                                                          │
│ 1. Validate CSV format                                  │
│    ├─ Check header                                      │
│    ├─ Check encoding                                    │
│    └─ Check file size                                   │
│                                                          │
│ 2. Upload to Storage (MinIO)                            │
│    └─ storageUrl = "s3://bucket/mailings/file.csv"     │
│                                                          │
│ 3. BEGIN TRANSACTION                                    │
│                                                          │
│    ├─ INSERT mailing                                    │
│    │  - id, filename, storageUrl, status=PENDING        │
│    │                                                     │
│    ├─ Stream CSV and INSERT mailing_entries             │
│    │  - Batch inserts (1000 per batch)                  │
│    │  - Email validation (syntax, MX, disposable)       │
│    │  - Generate unique token per email                 │
│    │                                                     │
│    └─ INSERT outbox_messages                            │
│       - One message to trigger processing               │
│       - payload: { mailingId, storageUrl }              │
│                                                          │
│ 4. COMMIT TRANSACTION                                   │
│                                                          │
│ 5. Return response                                      │
│    └─ { mailingId, status: "QUEUED" }                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Processamento Assíncrono

```
┌──────────────────┐         ┌──────────────────┐
│ Outbox Publisher │         │ Worker Consumer  │
└────────┬─────────┘         └────────┬─────────┘
         │                             │
         │ Poll outbox (every 1s)      │
         ▼                             │
    ┌─────────┐                        │
    │ Outbox  │                        │
    │Messages │                        │
    └────┬────┘                        │
         │                             │
         │ Publish to RabbitMQ         │
         ▼                             │
    ┌─────────┐                        │
    │RabbitMQ │                        │
    │ Queue   │                        │
    └────┬────┘                        │
         │                             │
         │ Consume message             │
         │────────────────────────────►│
         │                             │
         │                             ▼
         │                    ┌─────────────────┐
         │                    │ Try Acquire     │
         │                    │ Lock            │
         │                    └────────┬────────┘
         │                             │
         │                             │ Lock OK?
         │                             │
         │                     ┌───────┴───────┐
         │                     │ YES           │ NO
         │                     ▼               ▼
         │            ┌──────────────┐   ┌─────────┐
         │            │ Process      │   │ Skip    │
         │            │ Email        │   │ ACK     │
         │            └──────┬───────┘   └─────────┘
         │                   │
         │                   │ Generate Token
         │                   │ Build Payload
         │                   │ Log JSON
         │                   │ Send Email
         │                   │
         │                   ▼
         │            ┌──────────────┐
         │            │ Update DB    │
         │            │ status=SENT  │
         │            └──────┬───────┘
         │                   │
         │                   │ ACK
         │                   ▼
         │            ┌──────────────┐
         │            │ Message      │
         │            │ Removed      │
         │            └──────────────┘
```

### Retry Logic

```
┌──────────────────────────────────────────────────────────┐
│ RETRY FLOW                                               │
└──────────────────────────────────────────────────────────┘

Worker sends email
      │
      ▼
  ┌────────┐
  │ Error? │
  └───┬────┘
      │
      ├─ NO ──► Update DB: status=SENT, ACK message ✓
      │
      └─ YES
          │
          ▼
    ┌──────────────────┐
    │ NACK message     │
    │ (requeue=true)   │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Message goes to  │
    │ retry queue      │
    │ TTL: 10s         │
    └────────┬─────────┘
             │
             │ Wait 10 seconds...
             │
             ▼
    ┌──────────────────┐
    │ Message returns  │
    │ to main queue    │
    └────────┬─────────┘
             │
             │ ATTEMPT 2
             ▼
    ┌──────────────────┐
    │ Try again        │
    └────────┬─────────┘
             │
             ├─ Success ──► Update DB, ACK ✓
             │
             └─ Error ──► NACK → retry queue 2 (TTL: 30s)
                          │
                          │ ATTEMPT 3
                          │
                          ├─ Success ──► Update DB, ACK ✓
                          │
                          └─ Error ──► Dead Letter Queue (manual review)
```

---

## Persistência

### Modelo de Dados

```
┌────────────────────────────────────────────────────────────┐
│ mailings                                                   │
├────────────────────────────────────────────────────────────┤
│ id                UUID PRIMARY KEY                         │
│ filename          VARCHAR(255) UNIQUE                      │
│ storage_url       TEXT                                     │
│ status            VARCHAR(50)  (PENDING|PROCESSING|...)    │
│ attempts          INT DEFAULT 0                            │
│ last_attempt      TIMESTAMPTZ                              │
│ error_message     TEXT                                     │
│ total_lines       INT                                      │
│ processed_lines   INT DEFAULT 0                            │
│ created_at        TIMESTAMPTZ DEFAULT NOW()                │
│ updated_at        TIMESTAMPTZ DEFAULT NOW()                │
└────────────────────────────────────────────────────────────┘
           │
           │ 1:N
           ▼
┌────────────────────────────────────────────────────────────┐
│ mailing_entries                                            │
├────────────────────────────────────────────────────────────┤
│ id                UUID PRIMARY KEY                         │
│ mailing_id        VARCHAR(255) FK → mailings               │
│ email             VARCHAR(255)                             │
│ token             VARCHAR(255)  (verification token)       │
│ status            VARCHAR(50)  (PENDING|SENT|FAILED)       │
│ attempts          INT DEFAULT 0                            │
│ last_attempt      TIMESTAMPTZ                              │
│ external_id       VARCHAR(255)  (email service msg ID)     │
│ invalid_reason    VARCHAR(50)   (syntax|disposable|mx)     │
│ validation_details TEXT                                    │
│ created_at        TIMESTAMPTZ DEFAULT NOW()                │
│ updated_at        TIMESTAMPTZ DEFAULT NOW()                │
│                                                             │
│ UNIQUE(mailing_id, email)  ← Idempotency                  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ outbox_messages   (Transactional Outbox)                  │
├────────────────────────────────────────────────────────────┤
│ id                UUID PRIMARY KEY                         │
│ mailing_id        UUID FK → mailings                       │
│ target_queue      TEXT  (RabbitMQ queue name)              │
│ payload           JSONB (message data)                     │
│ attempts          INT DEFAULT 0                            │
│ published         BOOLEAN DEFAULT false                    │
│ published_at      TIMESTAMPTZ                              │
│ created_at        TIMESTAMPTZ DEFAULT NOW()                │
│                                                             │
│ INDEX(published) WHERE published = false                   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ dead_letters      (Manual review queue)                   │
├────────────────────────────────────────────────────────────┤
│ id                UUID PRIMARY KEY                         │
│ mailing_id        VARCHAR(255)                             │
│ email             VARCHAR(255)                             │
│ reason            TEXT                                     │
│ attempts          INT                                      │
│ last_error        TEXT                                     │
│ created_at        TIMESTAMPTZ DEFAULT NOW()                │
│ updated_at        TIMESTAMPTZ DEFAULT NOW()                │
└────────────────────────────────────────────────────────────┘
```

### Transações e Consistência

**Princípio:** Todas as operações críticas são transacionais.

```typescript
// Exemplo: Ingestão com Outbox
await prisma.$transaction(async (tx) => {
  // 1. Create mailing
  const mailing = await tx.mailing.create({
    data: { filename, storageUrl, status: 'PENDING' }
  });

  // 2. Insert entries (batch)
  await tx.mailingEntry.createMany({
    data: entries
  });

  // 3. Create outbox message
  await tx.outboxMessage.create({
    data: {
      mailingId: mailing.id,
      targetQueue: 'mailing.jobs.process',
      payload: { mailingId: mailing.id }
    }
  });
  
  // COMMIT - All or nothing!
});
```

---

## Comunicação Assíncrona

### RabbitMQ Configuration

```typescript
const QUEUE_CONFIG = {
  // Main processing queue
  main: {
    name: 'mailing.jobs.process',
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'mailing.retry.1',
      'x-dead-letter-routing-key': 'retry'
    }
  },
  
  // Retry queues with progressive delays
  retry1: {
    name: 'mailing.retry.1',
    durable: true,
    messageTtl: 10000, // 10 seconds
    deadLetterExchange: 'mailing.exchange',
    deadLetterRoutingKey: 'mailing.process'
  },
  
  retry2: {
    name: 'mailing.retry.2',
    durable: true,
    messageTtl: 30000, // 30 seconds
    deadLetterExchange: 'mailing.jobs.dlq'
  },
  
  // Dead letter queue (manual intervention)
  dlq: {
    name: 'mailing.jobs.dlq',
    durable: true
  }
};
```

### Publisher Confirms

```
Publisher                    RabbitMQ
   │                            │
   │  1. Publish message        │
   ├───────────────────────────►│
   │     with confirm mode      │
   │                            │
   │                            │ Message persisted to disk
   │                            │
   │  2. Basic.Ack              │
   │◄───────────────────────────┤
   │     (confirm)              │
   │                            │
   │  3. Mark as published      │
   │     in outbox              │
   │                            │
```

---

## Resiliência e Tolerância a Falhas

### 1. Crash Recovery

**Cenário:** Worker container é morto durante processamento.

**Detecção:**
- Mailing fica em status `PROCESSING`
- `last_attempt` não é atualizado
- Timeout: 30 segundos

**Recovery:**
```
Crash Recovery Service (every 5 min)
├─ Find stale mailings
│  └─ WHERE status = 'PROCESSING' 
│     AND last_attempt < NOW() - INTERVAL '30 sec'
│
├─ For each stale mailing:
│  ├─ UPDATE status = 'PENDING'
│  ├─ Clear last_attempt
│  └─ INSERT outbox_message (re-queue)
│
└─ Log recovery count
```

### 2. Idempotency

**Garantias:**
- ✅ Mesmo CSV não cria múltiplos mailings (unique filename)
- ✅ Mesmo email não duplica no mailing (unique mailing_id + email)
- ✅ Reprocessamento seguro (check status antes de processar)

### 3. At-Least-Once Delivery

**RabbitMQ → Worker:**
- Message ACK após processar com sucesso
- Message NACK para retry automático
- Publisher Confirms garantem persistência

**Database → RabbitMQ (Outbox):**
- Polling garante eventual delivery
- Retry automático em falhas
- Idempotência no consumer

---

## Monitoramento e Observabilidade

### Métricas (Prometheus)

```
# Email processing metrics
mailing_emails_total{status="sent|failed"}
mailing_processing_duration_seconds

# Queue metrics
mailing_queue_size{queue="main|retry|dlq"}
mailing_queue_consumer_count

# Outbox metrics
mailing_outbox_pending_count
mailing_outbox_publish_duration_seconds

# API metrics
mailing_api_requests_total{method,path,status}
mailing_api_request_duration_seconds
```

### Health Checks

```
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2025-10-29T14:00:00Z",
  "database": {
    "status": "connected",
    "responseTime": 5
  },
  "rabbitmq": {
    "status": "connected",
    "consumers": 2
  },
  "storage": {
    "status": "accessible"
  },
  "tokenManager": {
    "status": "initialized",
    "availableTokens": 1000
  }
}
```

### Logging

**Estrutura de Logs:**
```json
{
  "level": "info",
  "timestamp": "2025-10-29T14:00:00.000Z",
  "service": "email-mailing-api",
  "environment": "production",
  "message": "Email sent successfully",
  "context": {
    "mailingId": "123...",
    "email": "user@example.com",
    "token": "ABC123XYZ",
    "externalId": "msg_xyz",
    "duration": 250
  }
}
```

---

## Conclusão

Esta arquitetura foi projetada com foco em:

1. **Confiabilidade**: Garantia de entrega com retry e DLQ
2. **Consistência**: Padrão Outbox previne perda de mensagens
3. **Escalabilidade**: Workers horizontalmente escaláveis
4. **Resiliência**: Crash recovery automático
5. **Observabilidade**: Métricas, logs e health checks completos
6. **Manutenibilidade**: Código organizado com Repository Pattern

O sistema está preparado para processar milhões de emails com alta disponibilidade e recuperação automática de falhas.
