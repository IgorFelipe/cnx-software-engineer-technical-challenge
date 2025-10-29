# Estratégia de Idempotência

## Índice

1. [Visão Geral](#visão-geral)
2. [Por Que Idempotência é Importante](#por-que-idempotência-é-importante)
3. [Níveis de Idempotência](#níveis-de-idempotência)
4. [Implementação](#implementação)
5. [Casos de Uso e Cenários](#casos-de-uso-e-cenários)
6. [Garantias e Limitações](#garantias-e-limitações)
7. [Testes de Idempotência](#testes-de-idempotência)

---

## Visão Geral

Idempotência é a propriedade de uma operação que pode ser executada múltiplas vezes sem alterar o resultado além da primeira aplicação. No contexto do sistema de email mailing, garantimos idempotência em **três níveis**:

1. **Upload de CSV (Mailing)** - Mesmo arquivo não cria múltiplos mailings
2. **Processamento de Email** - Mesmo email não é enviado múltiplas vezes
3. **Consumo de Mensagens** - Workers não processam a mesma mensagem simultaneamente

---

## Por Que Idempotência é Importante

### Problemas Sem Idempotência

```
┌─────────────────────────────────────────────────────────────┐
│  CENÁRIO: Sistema SEM idempotência                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Usuário faz upload de "newsletter.csv"                  │
│     → Cria mailing_1                                        │
│                                                              │
│  2. Request timeout (mas foi processado no servidor)        │
│     → Cliente não recebe resposta                           │
│                                                              │
│  3. Cliente tenta novamente (retry)                         │
│     → Cria mailing_2 (DUPLICADO! ❌)                        │
│                                                              │
│  4. Worker processa mailing_1                               │
│     → Envia email para user@example.com                     │
│                                                              │
│  5. Worker processa mailing_2                               │
│     → Envia NOVAMENTE email para user@example.com (SPAM! ❌)│
│                                                              │
│  RESULTADO:                                                  │
│  ❌ Usuário recebe 2 emails idênticos                        │
│  ❌ Custos duplicados (API calls)                            │
│  ❌ Má experiência do usuário                                │
│  ❌ Risco de blacklist por spam                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Benefícios da Idempotência

✅ **Segurança em Retries**: Cliente pode tentar novamente sem medo de duplicação  
✅ **Crash Recovery**: Reprocessamento seguro após falhas  
✅ **Distribuição**: Múltiplos workers não criam conflitos  
✅ **Previsibilidade**: Mesmo input = mesmo output  
✅ **Custos Controlados**: Evita processamento desnecessário  

---

## Níveis de Idempotência

### Nível 1: Upload de CSV (Mailing)

**Objetivo:** Mesmo arquivo CSV não deve criar múltiplos mailings.

**Estratégia:** Unique constraint no nome do arquivo.

#### Schema

```sql
CREATE TABLE mailings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        VARCHAR(255) UNIQUE NOT NULL,  -- ← IDEMPOTENCY KEY
    storage_url     TEXT,
    status          VARCHAR(50) DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index para performance em lookups
CREATE UNIQUE INDEX idx_mailings_filename ON mailings(filename);
```

#### Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│  UPLOAD COM IDEMPOTÊNCIA - Primeira tentativa               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client: POST /mailings                                     │
│          filename: "newsletter_2025_10.csv"                 │
│                                                              │
│  Server:                                                    │
│  1. Check if exists:                                        │
│     SELECT * FROM mailings WHERE filename = 'newsletter...' │
│     → Result: NULL (not found)                              │
│                                                              │
│  2. Insert mailing:                                         │
│     INSERT INTO mailings (filename, ...)                    │
│     VALUES ('newsletter_2025_10.csv', ...)                  │
│     → Success! ✓                                            │
│                                                              │
│  3. Return response:                                        │
│     {                                                        │
│       "mailingId": "abc-123",                               │
│       "status": "QUEUED",                                   │
│       "created": true                                       │
│     }                                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  UPLOAD COM IDEMPOTÊNCIA - Retry (duplicado)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client: POST /mailings (retry após timeout)               │
│          filename: "newsletter_2025_10.csv"                 │
│                                                              │
│  Server:                                                    │
│  1. Check if exists:                                        │
│     SELECT * FROM mailings WHERE filename = 'newsletter...' │
│     → Result: { id: "abc-123", status: "QUEUED" }          │
│                                                              │
│  2. Return existing mailing (IDEMPOTENT! ✓):               │
│     {                                                        │
│       "mailingId": "abc-123",                               │
│       "status": "QUEUED",                                   │
│       "created": false  ← Indica que já existia             │
│     }                                                        │
│                                                              │
│  3. NO DUPLICATE CREATED! ✓                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Implementação

```typescript
// api/src/services/mailing-ingestion.service.ts

async uploadMailing(file: File): Promise<MailingResponse> {
  const filename = file.originalname;
  
  // 1. Check if mailing already exists (IDEMPOTENCY CHECK)
  const existingMailing = await prisma.mailing.findUnique({
    where: { filename }
  });
  
  if (existingMailing) {
    logger.info(`Mailing already exists: ${filename}`);
    return {
      mailingId: existingMailing.id,
      status: existingMailing.status,
      created: false  // Idempotent response
    };
  }
  
  // 2. Create new mailing (first time)
  const mailing = await prisma.mailing.create({
    data: {
      filename,
      storageUrl: await uploadToStorage(file),
      status: 'PENDING'
    }
  });
  
  return {
    mailingId: mailing.id,
    status: mailing.status,
    created: true
  };
}
```

#### Casos Especiais

**Mesmo arquivo, conteúdo diferente?**

```
Cenário: Cliente faz upload de "monthly.csv" todo mês.

Solução: Adicionar timestamp ao filename:
  - "monthly_2025_10.csv"
  - "monthly_2025_11.csv"

Ou usar hash do conteúdo:
  - filename: "report.csv"
  - contentHash: "sha256:abc123..."
  - UNIQUE(filename, contentHash)
```

---

### Nível 2: Processamento de Email (Mailing Entry)

**Objetivo:** Mesmo email no mesmo mailing não deve ser processado múltiplas vezes.

**Estratégia:** Unique constraint composto `(mailing_id, email)`.

#### Schema

```sql
CREATE TABLE mailing_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailing_id          VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    token               VARCHAR(255) NOT NULL,
    status              VARCHAR(50) DEFAULT 'PENDING',
    attempts            INT DEFAULT 0,
    last_attempt        TIMESTAMPTZ,
    external_id         VARCHAR(255),  -- ID do serviço externo de email
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    
    -- IDEMPOTENCY CONSTRAINT
    CONSTRAINT unique_mailing_email 
        UNIQUE (mailing_id, email)  -- ← IDEMPOTENCY KEY
);

-- Index para performance
CREATE INDEX idx_mailing_entries_mailing_id ON mailing_entries(mailing_id);
CREATE INDEX idx_mailing_entries_status ON mailing_entries(status);
```

#### Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│  PROCESSAMENTO COM IDEMPOTÊNCIA                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CSV Content:                                               │
│  ┌──────────────────────┐                                   │
│  │ email                │                                   │
│  ├──────────────────────┤                                   │
│  │ user@example.com     │                                   │
│  │ admin@example.com    │                                   │
│  │ user@example.com     │  ← DUPLICADO no CSV!             │
│  └──────────────────────┘                                   │
│                                                              │
│  Ingestion Process:                                         │
│                                                              │
│  1. Process line 1: user@example.com                        │
│     INSERT INTO mailing_entries (mailing_id, email, ...)   │
│     VALUES ('mailing-123', 'user@example.com', ...)         │
│     → Success! ✓                                            │
│                                                              │
│  2. Process line 2: admin@example.com                       │
│     INSERT INTO mailing_entries (mailing_id, email, ...)   │
│     VALUES ('mailing-123', 'admin@example.com', ...)        │
│     → Success! ✓                                            │
│                                                              │
│  3. Process line 3: user@example.com (DUPLICATE!)           │
│     INSERT INTO mailing_entries (mailing_id, email, ...)   │
│     VALUES ('mailing-123', 'user@example.com', ...)         │
│     → ERROR: duplicate key violation                        │
│     → SKIP (already exists) ✓                               │
│                                                              │
│  Result:                                                     │
│  ✓ user@example.com:  1 entry (not 2!)                     │
│  ✓ admin@example.com: 1 entry                               │
│  ✓ Total entries: 2 (not 3)                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Implementação

```typescript
// api/src/services/csv-ingestion.service.ts

async ingestCSV(mailingId: string, csvContent: string): Promise<void> {
  const emails = parseCSV(csvContent);
  
  // Batch insert with ON CONFLICT (idempotency)
  for (const batch of chunk(emails, 1000)) {
    await prisma.$executeRaw`
      INSERT INTO mailing_entries (mailing_id, email, token, status)
      VALUES ${batch.map(email => `(
        ${mailingId},
        ${email},
        ${generateToken()},
        'PENDING'
      )`).join(',')}
      ON CONFLICT (mailing_id, email) DO NOTHING  -- ← IDEMPOTENCY
    `;
  }
  
  logger.info(`Ingested ${emails.length} unique emails for mailing ${mailingId}`);
}
```

#### Casos Especiais

**Email já existe mas em status diferente?**

```sql
-- Opção 1: ON CONFLICT DO NOTHING (ignora sempre)
INSERT INTO mailing_entries (mailing_id, email, token, status)
VALUES ('mailing-123', 'user@example.com', 'token', 'PENDING')
ON CONFLICT (mailing_id, email) DO NOTHING;

-- Opção 2: ON CONFLICT DO UPDATE (atualiza se necessário)
INSERT INTO mailing_entries (mailing_id, email, token, status)
VALUES ('mailing-123', 'user@example.com', 'token', 'PENDING')
ON CONFLICT (mailing_id, email) 
DO UPDATE SET
  status = CASE 
    WHEN mailing_entries.status IN ('FAILED', 'INVALID') 
    THEN 'PENDING'  -- Reset para retry
    ELSE mailing_entries.status  -- Keep current
  END,
  updated_at = NOW();
```

**Implementação Atual:**

Usamos `DO NOTHING` para simplificar - uma vez inserido, o entry não é modificado na ingestão.

---

### Nível 3: Consumo de Mensagens (Worker Lock)

**Objetivo:** Múltiplos workers não devem processar o mesmo mailing simultaneamente.

**Estratégia:** Distributed Lock usando UPDATE condicional no PostgreSQL.

#### Problema: Race Condition

```
┌─────────────────────────────────────────────────────────────┐
│  SEM LOCK - Race Condition                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Time    Worker 1              Worker 2          Database   │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  t0      Receive msg           Receive msg       status=    │
│          (mailing=123)         (mailing=123)     PENDING    │
│                                                              │
│  t1      Check status:         Check status:                │
│          "PENDING"             "PENDING"                     │
│          ✓ OK to process       ✓ OK to process              │
│                                                              │
│  t2      Start processing      Start processing             │
│          Send email to         Send email to                │
│          user@example.com      user@example.com             │
│                                                              │
│  t3      ❌ DUPLICATE! Both workers send the same email!    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Solução: Distributed Lock

```sql
-- Schema
CREATE TABLE mailings (
    id              UUID PRIMARY KEY,
    status          VARCHAR(50) DEFAULT 'PENDING',
    last_attempt    TIMESTAMPTZ,  -- ← Track last processing attempt
    -- ...
);

-- Lock acquisition (atomic operation)
UPDATE mailings
SET 
    status = 'PROCESSING',
    last_attempt = NOW()
WHERE id = :mailingId
  AND status IN ('PENDING', 'QUEUED', 'FAILED')
RETURNING *;

-- Returns:
--   1 row: Lock acquired! ✓
--   0 rows: Already locked by another worker
```

#### Fluxo Com Lock

```
┌─────────────────────────────────────────────────────────────┐
│  COM LOCK - Idempotência garantida                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Time    Worker 1              Worker 2          Database   │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  t0      Receive msg           Receive msg       status=    │
│          (mailing=123)         (mailing=123)     PENDING    │
│                                                              │
│  t1      UPDATE mailings       -                 status=    │
│          WHERE status=PENDING  -                 PROCESSING │
│          → 1 row affected ✓    -                 (Worker 1) │
│          Lock ACQUIRED!        -                            │
│                                                              │
│  t2      -                     UPDATE mailings              │
│          -                     WHERE status=PENDING         │
│          -                     → 0 rows affected            │
│          -                     Lock FAILED!                 │
│                                                              │
│  t3      Processing email...   Skip processing              │
│                                ACK message                   │
│                                                              │
│  t4      Send email ✓          (Worker 2 exits)             │
│                                                              │
│  t5      UPDATE status=SENT    -                 status=    │
│          ACK message           -                 SENT       │
│                                                              │
│  RESULTADO: ✓ Email enviado apenas 1 vez!                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Implementação

```typescript
// api/src/repositories/mailing.repository.ts

async tryAcquireLock(mailingId: string): Promise<Mailing | null> {
  const staleThreshold = new Date(Date.now() - 30 * 1000); // 30 seconds
  
  // Atomic lock acquisition
  const result = await prisma.$executeRaw`
    UPDATE mailings
    SET 
      status = 'PROCESSING',
      last_attempt = NOW()
    WHERE id = ${mailingId}::uuid
      AND (
        -- Accept if in initial states
        status IN ('PENDING', 'QUEUED', 'FAILED')
        
        -- OR accept if stale (crash recovery)
        OR (
          status = 'PROCESSING' 
          AND (
            last_attempt IS NULL 
            OR last_attempt < ${staleThreshold}
          )
        )
      )
  `;
  
  // Check if lock was acquired
  if (result === 0) {
    return null;  // Lock not acquired
  }
  
  // Fetch the locked mailing
  return await prisma.mailing.findUnique({
    where: { id: mailingId }
  });
}

// Worker usage
async processMessage(message: Message): Promise<void> {
  const { mailingId } = message.payload;
  
  // Try to acquire lock
  const mailing = await mailingRepository.tryAcquireLock(mailingId);
  
  if (!mailing) {
    // Lock not acquired - another worker is processing
    logger.info(`Mailing ${mailingId} already being processed, skipping`);
    await channel.ack(message);  // ACK to remove from queue
    return;
  }
  
  // Lock acquired - process the mailing
  try {
    await processEmails(mailing);
    await mailingRepository.markCompleted(mailingId);
    await channel.ack(message);
  } catch (error) {
    await mailingRepository.markFailed(mailingId, error.message);
    await channel.nack(message);  // Retry
  }
}
```

#### Crash Recovery e Lock

**Problema:** Worker morre enquanto processa, lock fica "travado".

**Solução:** Stale lock detection

```typescript
async tryAcquireLock(mailingId: string): Promise<Mailing | null> {
  const staleThreshold = new Date(Date.now() - 30 * 1000);
  
  const result = await prisma.$executeRaw`
    UPDATE mailings
    SET status = 'PROCESSING', last_attempt = NOW()
    WHERE id = ${mailingId}::uuid
      AND (
        status IN ('PENDING', 'QUEUED', 'FAILED')
        
        -- STALE LOCK DETECTION ↓
        OR (
          status = 'PROCESSING' 
          AND last_attempt < ${staleThreshold}
        )
      )
  `;
  
  return result > 0 ? await findById(mailingId) : null;
}
```

**Cenário:**

```
t0:  Worker 1 acquires lock
     status = PROCESSING
     last_attempt = 2025-10-29 14:00:00

t1:  Worker 1 crashes (container killed)

t2:  (30 seconds pass...)
     status = PROCESSING
     last_attempt = 2025-10-29 14:00:00  (stale!)

t3:  Worker 2 receives message
     Tries to acquire lock:
     
     Check: last_attempt < NOW() - 30 seconds?
            14:00:00 < 14:00:30? YES!
     
     → Lock acquired by Worker 2 ✓
     → Processing resumes ✓
```

---

## Casos de Uso e Cenários

### Cenário 1: Upload Duplicado por Retry do Cliente

```
User → API: POST /mailings (file: "monthly.csv")
         ↓
      [Network timeout]
         ↓
User → API: POST /mailings (file: "monthly.csv") [RETRY]
         ↓
      Response: { mailingId: "abc-123", created: false }
         ↓
✓ Nenhum duplicado criado!
✓ Cliente recebe o mesmo mailingId
```

### Cenário 2: CSV com Emails Duplicados

```
CSV Content:
  user@example.com
  admin@example.com
  user@example.com  ← Duplicate!
  admin@example.com ← Duplicate!

Result:
  ✓ 2 entries created (not 4)
  ✓ Each email appears once
  ✓ user@example.com:  1 entry
  ✓ admin@example.com: 1 entry
```

### Cenário 3: Mensagem Duplicada no RabbitMQ

```
RabbitMQ → Worker 1: { mailingId: "abc-123" }
RabbitMQ → Worker 2: { mailingId: "abc-123" } [Duplicate message]

Worker 1:
  1. Try acquire lock → Success ✓
  2. Process emails
  3. Mark completed

Worker 2:
  1. Try acquire lock → Failed (already PROCESSING)
  2. Skip processing
  3. ACK message

Result:
  ✓ Emails sent only once
  ✓ No duplication
```

### Cenário 4: Crash Durante Processamento

```
t0: Worker 1 acquires lock
    status = PROCESSING

t1: Worker 1 processes 50% of emails

t2: Worker 1 CRASHES (docker kill)
    status = PROCESSING (locked!)

t3: Crash Recovery runs (5 min later)
    Detects stale mailing
    → Reset status = PENDING
    → Re-queue via outbox

t4: Worker 2 receives message
    Try acquire lock → Success ✓
    → Resumes processing from checkpoint

Result:
  ✓ Processing resumes automatically
  ✓ No duplicate emails (idempotent entries)
  ✓ System self-heals
```

---

## Garantias e Limitações

### Garantias

✅ **Upload Idempotency**: Mesmo filename = mesmo mailing  
✅ **Email Idempotency**: Mesmo (mailing, email) = 1 entry  
✅ **Processing Idempotency**: Lock garante processamento único  
✅ **Crash Recovery**: Reprocessamento seguro após falhas  
✅ **Distributed Safety**: Múltiplos workers não conflitam  

### Limitações

⚠️ **Filename-based**: Se usuário renomeia arquivo, novo mailing é criado
- **Mitigação**: Usar hash do conteúdo ou instruir usuários

⚠️ **Email Case-Sensitivity**: `User@Example.com` ≠ `user@example.com`
- **Mitigação**: Normalizar emails para lowercase antes de inserir

⚠️ **Lock Timeout**: 30 segundos de timeout pode ser curto para grandes mailings
- **Mitigação**: Ajustar timeout ou usar heartbeat

⚠️ **External Service**: Se serviço externo enviar email mas falhar em responder, pode ter duplicação
- **Mitigação**: Usar `external_id` para detectar duplicatas

---

## Testes de Idempotência

### Teste 1: Upload Duplicado

```typescript
describe('Mailing Upload Idempotency', () => {
  it('should return same mailing for duplicate filename', async () => {
    const file = createTestCSV('test.csv', ['user@test.com']);
    
    // First upload
    const response1 = await uploadMailing(file);
    expect(response1.created).toBe(true);
    const mailingId1 = response1.mailingId;
    
    // Second upload (duplicate)
    const response2 = await uploadMailing(file);
    expect(response2.created).toBe(false);
    expect(response2.mailingId).toBe(mailingId1);
    
    // Verify only 1 mailing exists
    const count = await prisma.mailing.count({
      where: { filename: 'test.csv' }
    });
    expect(count).toBe(1);
  });
});
```

### Teste 2: Email Duplicado no CSV

```typescript
describe('Email Entry Idempotency', () => {
  it('should insert each email only once', async () => {
    const csv = `
email
user@test.com
admin@test.com
user@test.com
admin@test.com
`;
    
    await ingestCSV('mailing-123', csv);
    
    // Verify only 2 entries created (not 4)
    const count = await prisma.mailingEntry.count({
      where: { mailingId: 'mailing-123' }
    });
    expect(count).toBe(2);
    
    // Verify each email appears once
    const entries = await prisma.mailingEntry.findMany({
      where: { mailingId: 'mailing-123' }
    });
    const emails = entries.map(e => e.email);
    expect(emails).toEqual(['user@test.com', 'admin@test.com']);
  });
});
```

### Teste 3: Concurrent Processing

```typescript
describe('Processing Lock Idempotency', () => {
  it('should prevent concurrent processing', async () => {
    const mailingId = await createTestMailing();
    
    // Simulate 2 workers trying to process simultaneously
    const [result1, result2] = await Promise.all([
      mailingRepository.tryAcquireLock(mailingId),
      mailingRepository.tryAcquireLock(mailingId)
    ]);
    
    // Only one should succeed
    const successCount = [result1, result2].filter(r => r !== null).length;
    expect(successCount).toBe(1);
    
    // Verify status
    const mailing = await prisma.mailing.findUnique({
      where: { id: mailingId }
    });
    expect(mailing.status).toBe('PROCESSING');
  });
});
```

### Teste 4: Crash Recovery

```typescript
describe('Crash Recovery Idempotency', () => {
  it('should recover stale locks without duplication', async () => {
    // Create mailing in PROCESSING with stale timestamp
    const mailingId = await createMailingWithStatus({
      status: 'PROCESSING',
      lastAttempt: new Date(Date.now() - 60000) // 1 minute ago
    });
    
    // Run crash recovery
    await crashRecoveryService.run();
    
    // Verify mailing was reset
    const mailing = await prisma.mailing.findUnique({
      where: { id: mailingId }
    });
    expect(mailing.status).toBe('PENDING');
    expect(mailing.lastAttempt).toBeNull();
    
    // Verify outbox message created for re-queue
    const outboxCount = await prisma.outboxMessage.count({
      where: { mailingId, published: false }
    });
    expect(outboxCount).toBe(1);
  });
});
```

---

## Conclusão

A estratégia de idempotência implementada garante que:

1. ✅ **Uploads são seguros** - Clientes podem tentar novamente sem medo
2. ✅ **Emails não duplicam** - Mesmo email no mesmo mailing = 1 envio
3. ✅ **Workers não conflitam** - Lock distribuído previne race conditions
4. ✅ **Sistema se recupera** - Crash recovery sem duplicação

### Princípios Aplicados

- **Database Constraints**: UNIQUE constraints garantem idempotência no nível de dados
- **Atomic Operations**: UPDATE condicional garante lock distribuído
- **Idempotent Keys**: Composições únicas identificam recursos
- **Safe Retries**: Sistema preparado para reprocessamento

### Referências

- [Idempotency Patterns](https://stripe.com/docs/api/idempotent_requests)
- [Distributed Locks with PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
