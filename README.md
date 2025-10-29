# 📧 Sistema de Envio de E-mails em Massa

> **Technical Challenge — Software Engineer**  
> Sistema robusto para processamento de CSV e envio de e-mails via API autenticada

---

## 🎯 Visão Geral

Sistema de processamento de listas de e-mail que lê arquivos CSV e envia e-mails através de uma API autenticada, com foco em **confiabilidade**, **escalabilidade** e **recuperação de falhas**.

### Características Principais

✅ **Processamento streaming** de CSV (arquivos ilimitados)  
✅ **Recuperação automática** de crashes e interrupções  
✅ **Rate limiting inteligente** (6 req/min com buffer de segurança)  
✅ **Idempotência** total (retry seguro de operações)  
✅ **Retry exponencial** com jitter para falhas transitórias  
✅ **Dead Letter Queue** para falhas permanentes  
✅ **Graceful shutdown** com persistência de estado  
✅ **Observabilidade completa** (logs estruturados + Prometheus)  
✅ **Testes abrangentes** (30 testes: unit, integration, chaos)

---

## � Quick Start

### Pré-requisitos

- **Docker** e **Docker Compose**
- **Git**

### Instalação e Execução

```bash
# 1. Clonar repositório
git clone https://github.com/IgorFelipe/cnx-software-engineer-technical-challenge.git
cd cnx-software-engineer-technical-challenge

# 2. Iniciar todos os serviços
docker-compose up -d

# 3. Verificar saúde do sistema
curl http://localhost:3000/health

# 4. Fazer upload de CSV
curl -X POST http://localhost:3000/mailings \
  -F "file=@test-small.csv" \
  -F "hasHeader=true"

# 5. Acompanhar progresso (substitua {id} pelo retornado no passo 4)
curl http://localhost:3000/mailings/{id}/status
```

### Acesso aos Serviços

- **API**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/docs
- **RabbitMQ Management**: http://localhost:15672 (user: `rabbitmq`, pass: `rabbitmq`)
- **Prometheus Metrics**: http://localhost:3000/metrics

---

## 📚 Documentação Completa

### 🎓 Começando

- **[📖 Guia de Instalação Local](docs/LOCAL-SETUP.md)** - Instalação detalhada (Windows/Linux/macOS)
- **[🎯 Referência da API](docs/API.md)** - Endpoints, exemplos, códigos de resposta

### 🏗️ Arquitetura e Design

- **[🏛️ Arquitetura do Sistema](docs/ARCHITECTURE.md)** - Componentes, fluxos, diagramas
- **[� Estratégia de Idempotência](docs/IDEMPOTENCY.md)** - Como garantimos operações seguras
- **[⏱️ Rate Limiting](docs/RATE-LIMITING.md)** - Implementação do Bottleneck (6 req/min)
- **[🔒 Segurança](docs/SECURITY.md)** - JWT, criptografia, proteções

### � Funcionalidades

- **[� Checkpointing](docs/CHECKPOINTING.md)** - Salvamento de progresso e retomada
- **[🔁 Política de Retry](docs/RETRY_POLICY.md)** - Backoff exponencial e DLQ
- **[� Crash Recovery](docs/CRASH_RECOVERY.md)** - Recuperação automática
- **[� Graceful Shutdown](docs/GRACEFUL_SHUTDOWN.md)** - Desligamento limpo

### 📊 Observabilidade e Testes

- **[� Observabilidade](docs/OBSERVABILITY.md)** - Logs estruturados e métricas
- **[✅ Evidências de Testes](docs/EVIDENCE.md)** - Resultados completos dos 30 testes
- **[🧪 Plano de Testes](docs/TEST-PLAN.md)** - Estratégia e cobertura

### 🚀 Operações

- **[� Estratégia de Rollout](docs/ROLLOUT_STRATEGY.md)** - Deploy incremental com feature flags
- **[�️ Runbook Operacional](docs/runbook.md)** - Procedimentos, troubleshooting, alertas

---

## 🏗️ Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| **Runtime** | Node.js | 20.x |
| **Linguagem** | TypeScript | 5.x |
| **Framework** | Fastify | 5.x |
| **Banco de Dados** | PostgreSQL | 16 |
| **ORM** | Prisma | 6.x |
| **Message Queue** | RabbitMQ | 3.13 |
| **Rate Limiting** | Bottleneck | 2.x |
| **Logging** | Pino | 9.x |
| **Metrics** | prom-client | 15.x |
| **Containers** | Docker | 24+ |

---

## 📁 Estrutura do Projeto

```
cnx-software-engineer-technical-challenge/
├── api/                          # Aplicação principal
│   ├── src/                      # Código fonte
│   │   ├── config/               # Configurações
│   │   ├── providers/            # Email provider (extensível)
│   │   ├── repositories/         # Acesso ao banco
│   │   ├── routes/               # Endpoints REST
│   │   ├── services/             # Lógica de negócio
│   │   └── utils/                # Utilitários
│   ├── prisma/                   # Schema e migrations
│   ├── test/                     # Suite de testes (30 testes)
│   │   ├── unit/                 # Testes unitários (16)
│   │   ├── integration/          # Testes de integração (4)
│   │   ├── chaos/                # Testes de resiliência (3)
│   │   └── fixtures/             # Dados de teste (CSVs)
│   └── Dockerfile                # Imagem do container
├── docs/                         # Documentação completa (15 docs)
│   ├── LOCAL-SETUP.md            # 📖 Guia de instalação
│   ├── ARCHITECTURE.md           # 🏛️ Arquitetura
│   ├── IDEMPOTENCY.md            # 🔄 Idempotência
│   ├── RATE-LIMITING.md          # ⏱️ Rate limiting
│   ├── SECURITY.md               # 🔒 Segurança
│   ├── EVIDENCE.md               # ✅ Evidências de testes
│   └── ... (mais 9 documentos)
├── scripts/                      # Scripts utilitários
│   ├── rollout/                  # Scripts de deploy
│   └── test-*.ps1                # Automação de testes
├── docker-compose.yml            # Orquestração de containers
├── test-small.csv                # CSV de teste (30 emails)
└── README.md                     # Este arquivo
```

---

## ✅ Resultados dos Testes

### Testes Unitários (16 testes)

```
✓ Lock Logic - Atomic Updates (4 testes)
✓ Consumer Finalization (3 testes)
✓ Publisher - Publish and Confirm (4 testes)
✓ Idempotency - Duplicate Prevention (2 testes)
✓ Token Manager (3 testes)

Duração: 5.02s | Status: ✅ PASSOU
```

### Testes de Integração (4 cenários)

```
✓ Happy Path: CSV → Outbox → RabbitMQ → Worker → Completion
✓ Duplicate Delivery: Idempotência via lock
✓ Retry Path: 5xx errors → retry queues → DLQ
✓ Publisher Crash: Recovery de mensagens não publicadas

Status: ✅ PASSOU
```

### Testes de Resiliência (3 cenários)

```
✓ Kill Consumer Mid-Processing (recuperação total)
✓ RabbitMQ Downtime and Recovery (retry bem-sucedido)
✓ Concurrent Workers Race Condition (locks funcionando)

Status: ✅ PASSOU
```

### Teste de Crash Recovery (test-small.csv)

```
Total: 30 emails
├─ Antes do crash: 10/30 enviados [PROCESSING]
├─ Sistema crashou (simulado)
├─ Sistema reiniciado
└─ Após recovery: 30/30 enviados [COMPLETED] ✅

Emails enviados: 27
Emails falhados: 3 (esperado - emails inválidos)
Tokens únicos: 27 gerados
Duração: 10.5s/email (média)

Status: ✅ CRASH RECOVERY FUNCIONANDO
```

**📊 Ver detalhes completos:** [docs/EVIDENCE.md](docs/EVIDENCE.md)

---

## 🎓 Requisitos Atendidos

### ✅ Requisitos Obrigatórios

| Requisito | Status | Evidência |
|-----------|--------|-----------|
| **Arquitetura de solução** | ✅ Completo | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Implementação OO** | ✅ TypeScript | `api/src/` (classes, interfaces, SOLID) |
| **Testes unitários** | ✅ 16 testes | [api/test/unit/](api/test/unit/) |
| **Evidência de execução** | ✅ Completo | [docs/EVIDENCE.md](docs/EVIDENCE.md) |

### ✅ Requisitos Não-Funcionais

| Requisito | Implementação | Documento |
|-----------|---------------|-----------|
| **Rate limit** | Bottleneck 6 req/min + buffer 1s | [docs/RATE-LIMITING.md](docs/RATE-LIMITING.md) |
| **Todos os emails enviados** | Retry + checkpoint + recovery | [docs/RETRY_POLICY.md](docs/RETRY_POLICY.md) |
| **Segurança** | JWT + SHA-256 + Prisma ORM | [docs/SECURITY.md](docs/SECURITY.md) |
| **Extensibilidade** | Interface IEmailProvider | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Manutenibilidade** | TypeScript strict + SOLID + testes | Todo o código |
| **Idempotência** | SHA-256 hash + locks atômicos | [docs/IDEMPOTENCY.md](docs/IDEMPOTENCY.md) |
| **Logs** | Pino structured JSON + context | [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) |

### ✅ Requisitos Opcionais

| Requisito | Status | Evidência |
|-----------|--------|-----------|
| **Organização do trabalho** | ✅ | Commits incrementais + docs |
| **Arquitetura de software** | ✅ | Diagramas + docs detalhados |
| **Setup local** | ✅ | [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md) |
| **README** | ✅ | Este arquivo |
| **CI/CD** | ✅ | GitHub Actions + Docker |

---

## 🎯 Destaques Técnicos

### 1. Resiliência e Confiabilidade

- **Crash Recovery**: Detecta e recupera jobs interrompidos automaticamente
- **Checkpointing**: Salva progresso a cada 1000 linhas processadas
- **Graceful Shutdown**: Persiste estado antes de desligar
- **Retry Exponencial**: 3 tentativas com backoff de 1s → 2s → 4s
- **Dead Letter Queue**: Falhas permanentes isoladas para análise

### 2. Performance e Escalabilidade

- **Streaming CSV**: Processa arquivos de qualquer tamanho
- **Batch Insert**: 500 registros por transação
- **Worker Pool**: Concorrência controlada (default: 1 worker)
- **Outbox Pattern**: Desacoplamento publisher/consumer
- **Horizontal Scaling**: Múltiplas réplicas do worker

### 3. Observabilidade

- **Logs Estruturados**: JSON com timestamp, level, mailingId, email, status
- **Prometheus Metrics**: 15+ métricas (counters, histograms, gauges)
- **Health Check**: Endpoint com status de todos os componentes
- **Distributed Tracing**: Correlation IDs em todas as operações

### 4. Segurança

- **JWT Authentication**: Token renovado automaticamente (30min expiry)
- **Idempotency Keys**: SHA-256 hash de (mailingId + email)
- **SQL Injection Protection**: Prisma ORM com prepared statements
- **Token Masking**: Apenas primeiros 6 + últimos 4 chars nos logs
- **Environment Variables**: Secrets isolados em `.env`

---

## 🛠️ Comandos Úteis

### Docker

```bash
# Ver logs em tempo real
docker-compose logs -f

# Reiniciar serviço específico
docker-compose restart worker

# Limpar tudo e recomeçar
docker-compose down -v
docker-compose up -d --build

# Ver recursos consumidos
docker stats
```

### Testes

```bash
cd api

# Todos os testes
npm test

# Apenas unitários
npm run test:unit

# Apenas integração
npm run test:integration

# Com cobertura
npm run test:coverage
```

### Banco de Dados

```bash
cd api

# Abrir Prisma Studio (GUI)
npm run db:studio

# Aplicar migrations
npm run db:migrate

# Resetar banco (CUIDADO!)
npm run db:reset
```

---

## 📞 Informações de Contato

**API de E-mail (Teste):**
- Base URL: `https://email-test-api-475816.ue.r.appspot.com`
- Swagger: https://email-test-api-475816.ue.r.appspot.com/docs
- Rate Limit: 6 requisições/minuto

**Repositório:**
- GitHub: https://github.com/IgorFelipe/cnx-software-engineer-technical-challenge

---

## 📄 Licença

Este projeto foi desenvolvido como parte de um desafio técnico.


