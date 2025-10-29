# 🚀 Guia de Instalação e Execução Local

**Sistema de Envio de E-mails em Massa - Setup Completo**

---

## 📋 Índice

1. [Requisitos do Sistema](#requisitos-do-sistema)
2. [Instalação de Dependências](#instalação-de-dependências)
3. [Clone do Repositório](#clone-do-repositório)
4. [Configuração do Ambiente](#configuração-do-ambiente)
5. [Execução com Docker](#execução-com-docker)
6. [Execução Manual (Sem Docker)](#execução-manual-sem-docker)
7. [Verificação da Instalação](#verificação-da-instalação)
8. [Testes do Sistema](#testes-do-sistema)
9. [Troubleshooting](#troubleshooting)
10. [Comandos Úteis](#comandos-úteis)

---

## 💻 Requisitos do Sistema

### Hardware Mínimo

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Disco** | 5 GB livres | 10+ GB livres |
| **Sistema Operacional** | Windows 10+, Linux, macOS | Qualquer |

### Software Necessário

#### ✅ Obrigatório (para execução com Docker)

- **Docker Desktop** (ou Docker Engine + Docker Compose)
- **Git**

#### ✅ Obrigatório (para execução manual)

- **Node.js** (versão 20.x ou superior)
- **npm** ou **yarn**
- **PostgreSQL** (versão 14 ou superior)
- **RabbitMQ** (versão 3.13 ou superior)
- **Git**

---

## 📥 Instalação de Dependências

### Windows

#### 1. Instalar Git

**Opção A: Download direto**

1. Acesse: https://git-scm.com/download/win
2. Baixe o instalador (64-bit Git for Windows Setup)
3. Execute o instalador
4. Aceite as configurações padrão
5. Verifique a instalação:

```powershell
git --version
# Saída esperada: git version 2.42.0 (ou superior)
```

**Opção B: Via Chocolatey**

```powershell
# Abra PowerShell como Administrador
choco install git -y
```

#### 2. Instalar Docker Desktop

1. **Download:**
   - Acesse: https://www.docker.com/products/docker-desktop/
   - Baixe "Docker Desktop for Windows"

2. **Instalação:**
   - Execute o instalador `Docker Desktop Installer.exe`
   - Aceite os termos de serviço
   - Aguarde a instalação (pode levar alguns minutos)
   - Reinicie o computador quando solicitado

3. **Configuração inicial:**
   - Abra o Docker Desktop
   - Aguarde o Docker iniciar (ícone verde no system tray)
   - Aceite os termos de uso

4. **Verificação:**

```powershell
docker --version
# Saída esperada: Docker version 24.0.0 (ou superior)

docker-compose --version
# Saída esperada: Docker Compose version v2.20.0 (ou superior)
```

5. **Configuração de recursos (Recomendado):**
   - Abra Docker Desktop
   - Vá em Settings (ícone de engrenagem)
   - Resources → Advanced
   - Configure:
     - **CPUs**: 4 (ou metade dos seus cores)
     - **Memory**: 4 GB (mínimo)
     - **Swap**: 1 GB
     - **Disk image size**: 20 GB

#### 3. Instalar Node.js (Opcional - apenas para desenvolvimento)

**Opção A: Download direto**

1. Acesse: https://nodejs.org/
2. Baixe a versão LTS (recomendada)
3. Execute o instalador
4. Aceite as configurações padrão
5. Verifique a instalação:

```powershell
node --version
# Saída esperada: v20.10.0 (ou superior)

npm --version
# Saída esperada: 10.2.0 (ou superior)
```

**Opção B: Via Chocolatey**

```powershell
choco install nodejs-lts -y
```

### Linux (Ubuntu/Debian)

#### 1. Instalar Git

```bash
sudo apt update
sudo apt install git -y
git --version
```

#### 2. Instalar Docker

```bash
# Remover versões antigas (se existirem)
sudo apt remove docker docker-engine docker.io containerd runc

# Atualizar repositórios
sudo apt update

# Instalar dependências
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Adicionar chave GPG oficial do Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Adicionar repositório do Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Adicionar seu usuário ao grupo docker (evita necessidade de sudo)
sudo usermod -aG docker $USER

# IMPORTANTE: Faça logout e login novamente para aplicar as permissões

# Verificar instalação
docker --version
docker compose version
```

#### 3. Instalar Node.js (Opcional)

```bash
# Via NodeSource (versão LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar
node --version
npm --version
```

### macOS

#### 1. Instalar Homebrew (gerenciador de pacotes)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Instalar Git

```bash
brew install git
git --version
```

#### 3. Instalar Docker Desktop

**Opção A: Download direto**

1. Acesse: https://www.docker.com/products/docker-desktop/
2. Baixe "Docker Desktop for Mac"
3. Abra o arquivo `.dmg`
4. Arraste Docker para Applications
5. Abra Docker Desktop
6. Aguarde o Docker iniciar

**Opção B: Via Homebrew**

```bash
brew install --cask docker
```

#### 4. Instalar Node.js (Opcional)

```bash
brew install node@20
node --version
npm --version
```

---

## 📂 Clone do Repositório

### 1. Criar Pasta de Trabalho

**Windows (PowerShell):**
```powershell
# Criar pasta para projetos
mkdir C:\Projetos
cd C:\Projetos
```

**Linux/macOS:**
```bash
# Criar pasta para projetos
mkdir -p ~/projetos
cd ~/projetos
```

### 2. Clonar o Repositório

```bash
git clone https://github.com/IgorFelipe/cnx-software-engineer-technical-challenge.git
cd cnx-software-engineer-technical-challenge
```

### 3. Verificar Estrutura

```bash
# Listar arquivos
ls -la

# Você deve ver:
# - api/
# - docs/
# - scripts/
# - docker-compose.yml
# - README.md
# - etc.
```

---

## ⚙️ Configuração do Ambiente

### 1. Configurar Variáveis de Ambiente

O sistema utiliza o arquivo `.env` para configurações. **Este arquivo não está no repositório por segurança.**

#### Opção A: Copiar do Template (Recomendado)

**Windows (PowerShell):**
```powershell
# Copiar template
Copy-Item api\.env.example api\.env
```

**Linux/macOS:**
```bash
# Copiar template
cp api/.env.example api/.env
```

#### Opção B: Criar Manualmente

Crie o arquivo `api/.env` com o seguinte conteúdo:

```bash
# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_mailing?schema=public"

# ============================================================================
# SERVER CONFIGURATION
# ============================================================================
PORT=3000
NODE_ENV=development

# ============================================================================
# AUTHENTICATION API CONFIGURATION
# ============================================================================
AUTH_API_URL=https://email-test-api-475816.ue.r.appspot.com/auth/token
AUTH_USERNAME=cnx_test
AUTH_PASSWORD=cnx_password_2025!
TOKEN_RENEWAL_WINDOW_MS=300000

# ============================================================================
# EMAIL API CONFIGURATION
# ============================================================================
EMAIL_API_URL=https://email-test-api-475816.ue.r.appspot.com

# ============================================================================
# RATE LIMITING CONFIGURATION
# ============================================================================
RATE_LIMIT_PER_MINUTE=6
WORKER_CONCURRENCY=1

# ============================================================================
# RABBITMQ CONFIGURATION
# ============================================================================
RABBITMQ_URL=amqp://rabbitmq:rabbitmq@localhost:5672
RABBITMQ_QUEUE_NAME=mailing_jobs
RABBITMQ_RETRY_DELAY_MS=10000
RABBITMQ_MAX_RETRIES=3

# ============================================================================
# RETRY CONFIGURATION
# ============================================================================
MAX_RETRIES=3
RETRY_BASE_DELAY_MS=1000
RETRY_MAX_DELAY_MS=300000
RETRY_JITTER_PERCENT=20

# ============================================================================
# CSV PROCESSING CONFIGURATION
# ============================================================================
CSV_CHECKPOINT_INTERVAL=1000
CSV_BATCH_SIZE=500
STALE_SENDING_THRESHOLD_MS=300000

# ============================================================================
# SHUTDOWN CONFIGURATION
# ============================================================================
SHUTDOWN_TIMEOUT_MS=30000
FORCE_SHUTDOWN_TIMEOUT_MS=60000

# ============================================================================
# FEATURE FLAGS
# ============================================================================
ENABLE_OUTBOX_PUBLISHER=true
ENABLE_WORKER_CONSUMER=true
MAX_CONSUMER_REPLICAS=1
```

### 2. Ajustar Configurações (se necessário)

**Para Docker:**
- Use as configurações padrão
- `DATABASE_URL` deve apontar para `postgres` (nome do serviço Docker)
- `RABBITMQ_URL` deve apontar para `rabbitmq` (nome do serviço Docker)

**Para execução manual:**
- Use `localhost` ao invés dos nomes dos serviços
- Ajuste portas se necessário

---

## 🐳 Execução com Docker (Recomendado)

### Método 1: Execução Simples

Este é o método mais rápido e fácil.

#### Passo 1: Iniciar Todos os Serviços

**Windows (PowerShell):**
```powershell
# Na pasta raiz do projeto
docker-compose up -d
```

**Linux/macOS:**
```bash
# Na pasta raiz do projeto
docker compose up -d
```

**O que acontece:**
```
✅ Baixa imagens Docker (primeira vez - pode levar 5-10 minutos)
✅ Cria containers:
   - email-mailing-db (PostgreSQL)
   - email-mailing-rabbitmq (RabbitMQ)
   - email-mailing-api (API REST)
   - email-mailing-worker (Worker Consumer)
✅ Cria rede privada entre containers
✅ Aplica migrations do banco de dados
✅ Inicia todos os serviços
```

#### Passo 2: Acompanhar Logs

```bash
# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs apenas da API
docker-compose logs -f api

# Ver logs apenas do Worker
docker-compose logs -f worker

# Ver últimas 50 linhas
docker-compose logs --tail=50
```

#### Passo 3: Verificar Status

```bash
# Listar containers em execução
docker ps

# Você deve ver 4 containers:
# - email-mailing-db
# - email-mailing-rabbitmq
# - email-mailing-api
# - email-mailing-worker
```

### Método 2: Execução Passo-a-Passo (Debug)

Para entender melhor o processo ou debugar problemas.

#### Passo 1: Iniciar Infraestrutura

```bash
# Apenas PostgreSQL e RabbitMQ
docker-compose up -d postgres rabbitmq

# Aguardar inicialização (30 segundos)
Start-Sleep -Seconds 30  # Windows
sleep 30                  # Linux/macOS

# Verificar health
docker ps
```

#### Passo 2: Verificar Conexões

**PostgreSQL:**
```bash
docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "SELECT 1"
```

**RabbitMQ:**
```bash
docker exec -it email-mailing-rabbitmq rabbitmq-diagnostics ping
```

#### Passo 3: Iniciar API

```bash
docker-compose up -d api

# Ver logs
docker-compose logs -f api

# Aguardar mensagem: "Server listening on http://0.0.0.0:3000"
```

#### Passo 4: Iniciar Worker

```bash
docker-compose up -d worker

# Ver logs
docker-compose logs -f worker

# Aguardar mensagem: "Worker Consumer started and listening"
```

### Método 3: Rebuild (Após Alterações de Código)

Se você modificou o código e precisa reconstruir as imagens:

```bash
# Parar tudo
docker-compose down

# Rebuild e iniciar
docker-compose up -d --build

# Ou apenas rebuild de um serviço específico
docker-compose up -d --build api
docker-compose up -d --build worker
```

### Comandos Docker Úteis

```bash
# Parar todos os serviços
docker-compose stop

# Parar e remover containers
docker-compose down

# Parar, remover containers E volumes (LIMPA TUDO!)
docker-compose down -v

# Reiniciar serviço específico
docker-compose restart api

# Ver logs em tempo real
docker-compose logs -f --tail=100

# Entrar em um container
docker exec -it email-mailing-api sh
docker exec -it email-mailing-worker sh

# Ver recursos consumidos
docker stats

# Limpar tudo (containers, imagens, volumes órfãos)
docker system prune -a --volumes
```

---

## 🔧 Execução Manual (Sem Docker)

### Pré-requisitos

Certifique-se de ter instalado:
- ✅ Node.js 20+
- ✅ PostgreSQL 14+
- ✅ RabbitMQ 3.13+

### Passo 1: Instalar PostgreSQL

**Windows:**

1. Download: https://www.postgresql.org/download/windows/
2. Execute o instalador
3. Configure:
   - Porta: `5432`
   - Usuário: `postgres`
   - Senha: `postgres` (ou outra de sua escolha)
   - Database: `email_mailing`

**Linux (Ubuntu/Debian):**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Criar database
sudo -u postgres psql
CREATE DATABASE email_mailing;
\q
```

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16

# Criar database
createdb email_mailing
```

### Passo 2: Instalar RabbitMQ

**Windows:**

1. Instalar Erlang: https://www.erlang.org/downloads
2. Instalar RabbitMQ: https://www.rabbitmq.com/install-windows.html
3. Ativar Management Plugin:
```powershell
rabbitmq-plugins enable rabbitmq_management
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install rabbitmq-server
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server

# Ativar Management Plugin
sudo rabbitmq-plugins enable rabbitmq_management
```

**macOS:**
```bash
brew install rabbitmq
brew services start rabbitmq

# Ativar Management Plugin
rabbitmq-plugins enable rabbitmq_management
```

### Passo 3: Instalar Dependências Node.js

```bash
# Entrar na pasta da API
cd api

# Instalar dependências
npm install

# Aguardar conclusão (pode levar 2-5 minutos na primeira vez)
```

### Passo 4: Configurar Banco de Dados

```bash
# Gerar Prisma Client
npm run db:generate

# Aplicar migrations
npm run db:migrate

# Verificar se migrations foram aplicadas
npm run db:studio
# (Abre interface gráfica do Prisma Studio)
```

### Passo 5: Iniciar API

**Terminal 1 (API REST):**
```bash
cd api
npm run dev

# Aguardar mensagem: "Server listening on http://localhost:3000"
```

### Passo 6: Iniciar Worker

**Terminal 2 (Worker Consumer):**
```bash
cd api

# Definir modo worker
# Windows PowerShell:
$env:WORKER_MODE="true"

# Linux/macOS:
export WORKER_MODE=true

npm run dev

# Aguardar mensagem: "Worker Consumer started and listening"
```

### Passo 7: (Opcional) Iniciar Outbox Publisher

Se quiser executar o Outbox Publisher separadamente:

**Terminal 3 (Outbox Publisher):**
```bash
cd api

# Windows PowerShell:
$env:PUBLISHER_MODE="true"

# Linux/macOS:
export PUBLISHER_MODE=true

npm run dev
```

---

## ✅ Verificação da Instalação

### 1. Health Check da API

**Browser:**
```
http://localhost:3000/health
```

**cURL:**
```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-29T14:30:00.000Z",
  "uptime": 123.45,
  "database": {
    "status": "connected"
  },
  "tokenManager": {
    "status": "initialized",
    "hasToken": true,
    "expiresAt": "2025-10-29T15:00:00.000Z"
  }
}
```

### 2. Verificar Swagger UI

```
http://localhost:3000/docs
```

Você deve ver a documentação interativa da API.

### 3. Verificar RabbitMQ Management

```
http://localhost:15672
```

**Credenciais:**
- Username: `rabbitmq`
- Password: `rabbitmq`

### 4. Verificar PostgreSQL

**Via psql (Docker):**
```bash
docker exec -it email-mailing-db psql -U postgres -d email_mailing

# Dentro do psql:
\dt  # Listar tabelas
\q   # Sair
```

**Via psql (Local):**
```bash
psql -U postgres -d email_mailing

\dt  # Listar tabelas
```

**Tabelas esperadas:**
- `mailings`
- `mailing_entries`
- `mailing_progress`
- `outbox_messages`
- `dead_letters`

### 5. Verificar Logs

**Docker:**
```bash
docker-compose logs --tail=50
```

**Manual:**
Verifique a saída dos terminais onde iniciou API e Worker.

---

## 🧪 Testes do Sistema

### Teste Rápido: Upload de CSV

#### 1. Criar Arquivo CSV de Teste

Crie `test.csv`:
```csv
email
user1@example.com
user2@gmail.com
user3@yahoo.com
```

#### 2. Fazer Upload via cURL

**Windows (PowerShell):**
```powershell
$boundary = [guid]::NewGuid().ToString()
$filePath = "test.csv"
$content = Get-Content $filePath -Raw

$body = @"
--$boundary
Content-Disposition: form-data; name="file"; filename="test.csv"
Content-Type: text/csv

$content
--$boundary
Content-Disposition: form-data; name="hasHeader"

true
--$boundary--
"@

Invoke-RestMethod `
  -Uri "http://localhost:3000/mailings" `
  -Method POST `
  -ContentType "multipart/form-data; boundary=$boundary" `
  -Body $body
```

**Linux/macOS:**
```bash
curl -X POST http://localhost:3000/mailings \
  -F "file=@test.csv" \
  -F "hasHeader=true"
```

#### 3. Resposta Esperada

```json
{
  "id": "7deabe22-8950-4120-ab40-90a7f050b3ad",
  "filename": "test.csv",
  "status": "QUEUED",
  "totalLines": 3,
  "createdAt": "2025-10-29T14:30:00.000Z"
}
```

#### 4. Verificar Status

```bash
# Substituir {id} pelo ID retornado
curl http://localhost:3000/mailings/{id}
```

### Teste Completo: Suíte de Testes

**Docker:**
```bash
# Executar script de teste completo
cd scripts
./run-all-tests.ps1
```

**Manual:**
```bash
cd api

# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Todos os testes
npm run test:all

# Testes com cobertura
npm run test:coverage
```

### Monitorar Processamento

```bash
# Ver logs do worker
docker-compose logs -f worker

# Você deve ver:
# 📧 Sending email to user1@example.com
# ✅ Email sent successfully - Message ID: msg_123
# 📧 Sending email to user2@gmail.com
# ✅ Email sent successfully - Message ID: msg_456
```

---

## 🔍 Troubleshooting

### Problema 1: Docker não inicia

**Sintomas:**
```
Cannot connect to the Docker daemon
```

**Solução:**

**Windows:**
1. Abra Docker Desktop
2. Aguarde o ícone ficar verde
3. Se ainda não funcionar, reinicie o serviço:
   - Abra Services (Win + R → `services.msc`)
   - Procure por "Docker Desktop Service"
   - Reinicie o serviço

**Linux:**
```bash
# Verificar status
sudo systemctl status docker

# Iniciar Docker
sudo systemctl start docker

# Habilitar auto-start
sudo systemctl enable docker
```

### Problema 2: Porta 3000 já em uso

**Sintomas:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solução:**

**Opção A: Matar processo na porta 3000**

**Windows:**
```powershell
# Encontrar processo
netstat -ano | findstr :3000

# Matar processo (substitua PID)
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
# Encontrar e matar processo
lsof -ti:3000 | xargs kill -9
```

**Opção B: Mudar porta no .env**

```bash
# Editar api/.env
PORT=3001
```

### Problema 3: PostgreSQL não conecta

**Sintomas:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solução:**

**Docker:**
```bash
# Verificar se container está rodando
docker ps | grep postgres

# Se não estiver, iniciar
docker-compose up -d postgres

# Ver logs
docker-compose logs postgres
```

**Manual:**
```bash
# Verificar se PostgreSQL está rodando
# Windows:
sc query postgresql-x64-16

# Linux:
sudo systemctl status postgresql

# Iniciar se necessário
# Linux:
sudo systemctl start postgresql
```

### Problema 4: RabbitMQ não conecta

**Sintomas:**
```
Error: Failed to connect to RabbitMQ
```

**Solução:**

**Docker:**
```bash
# Verificar container
docker ps | grep rabbitmq

# Reiniciar se necessário
docker-compose restart rabbitmq

# Ver logs
docker-compose logs rabbitmq
```

**Manual:**
```bash
# Verificar status
# Linux:
sudo systemctl status rabbitmq-server

# Windows:
rabbitmqctl status

# Reiniciar
sudo systemctl restart rabbitmq-server
```

### Problema 5: Migrations falham

**Sintomas:**
```
Error: Migration failed
```

**Solução:**

```bash
cd api

# Resetar banco (CUIDADO: apaga todos os dados!)
npm run db:reset

# Ou aplicar migrations manualmente
npm run db:migrate

# Verificar status
npm run db:studio
```

### Problema 6: "Cannot find module"

**Sintomas:**
```
Error: Cannot find module '@prisma/client'
```

**Solução:**

```bash
cd api

# Reinstalar dependências
rm -rf node_modules
rm package-lock.json
npm install

# Gerar Prisma Client
npm run db:generate
```

### Problema 7: Out of Memory

**Sintomas:**
```
FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Solução:**

**Docker:**
```yaml
# Editar docker-compose.yml
services:
  api:
    environment:
      NODE_OPTIONS: "--max-old-space-size=4096"
```

**Manual:**
```bash
# Aumentar limite de memória
export NODE_OPTIONS="--max-old-space-size=4096"
npm run dev
```

### Problema 8: Rate Limit Atingido

**Sintomas:**
```
Error 429: Rate limit exceeded
```

**Solução:**

```bash
# Editar api/.env
RATE_LIMIT_PER_MINUTE=6
WORKER_CONCURRENCY=1

# Reiniciar worker
docker-compose restart worker
```

---

## 📚 Comandos Úteis

### Docker

```bash
# Status de todos os containers
docker ps -a

# Logs em tempo real
docker-compose logs -f

# Entrar em um container
docker exec -it email-mailing-api sh

# Ver recursos consumidos
docker stats

# Limpar volumes
docker-compose down -v

# Rebuild completo
docker-compose build --no-cache
docker-compose up -d

# Ver networks
docker network ls

# Inspecionar network
docker network inspect cnx-software-engineer-technical-challenge_email-mailing-network
```

### PostgreSQL

```bash
# Conectar ao banco
docker exec -it email-mailing-db psql -U postgres -d email_mailing

# Comandos úteis dentro do psql:
\dt              # Listar tabelas
\d mailings      # Descrever tabela
\l               # Listar databases
\du              # Listar usuários
\q               # Sair

# Backup
docker exec email-mailing-db pg_dump -U postgres email_mailing > backup.sql

# Restore
docker exec -i email-mailing-db psql -U postgres email_mailing < backup.sql
```

### RabbitMQ

```bash
# Ver status
docker exec email-mailing-rabbitmq rabbitmqctl status

# Listar queues
docker exec email-mailing-rabbitmq rabbitmqctl list_queues

# Listar exchanges
docker exec email-mailing-rabbitmq rabbitmqctl list_exchanges

# Purgar queue
docker exec email-mailing-rabbitmq rabbitmqctl purge_queue mailing_jobs
```

### npm Scripts

```bash
cd api

# Desenvolvimento
npm run dev              # API em modo watch
npm run build            # Build para produção
npm run start            # Iniciar produção

# Banco de dados
npm run db:generate      # Gerar Prisma Client
npm run db:migrate       # Aplicar migrations
npm run db:push          # Push schema sem migration
npm run db:studio        # Abrir Prisma Studio
npm run db:reset         # Resetar banco (CUIDADO!)

# Testes
npm run test:unit        # Testes unitários
npm run test:integration # Testes de integração
npm run test:all         # Todos os testes
npm run test:coverage    # Cobertura de código
npm run test:ui          # Interface visual de testes

# Scripts
npm run backfill:outbox  # Backfill do outbox
```

### Git

```bash
# Atualizar código
git pull origin main

# Ver status
git status

# Ver diferenças
git diff

# Criar branch
git checkout -b feature/nova-funcionalidade

# Commitar alterações
git add .
git commit -m "Mensagem do commit"
git push origin feature/nova-funcionalidade
```

---

## 🎯 Próximos Passos

Após configurar o ambiente local:

1. **Explorar a API:**
   - Acesse http://localhost:3000/docs
   - Teste os endpoints via Swagger UI

2. **Ler a Documentação:**
   - `docs/ARCHITECTURE.md` - Entender a arquitetura
   - `docs/IDEMPOTENCY.md` - Estratégia de idempotência
   - `docs/RATE-LIMITING.md` - Sistema de rate limiting
   - `docs/SECURITY.md` - Práticas de segurança

3. **Executar Testes:**
   ```bash
   cd scripts
   ./run-all-tests.ps1
   ```

4. **Desenvolver:**
   - Modificar código em `api/src/`
   - Ver changes automaticamente (hot reload)
   - Testar suas alterações

---

## 📞 Suporte

### Documentação Adicional

- [README Principal](../README.md)
- [Arquitetura do Sistema](./ARCHITECTURE.md)
- [Guia de API](./API.md)
- [Evidências de Testes](./EVIDENCE.md)
- [Estratégia de Segurança](./SECURITY.md)

### Logs e Debug

**Ver todos os logs:**
```bash
docker-compose logs -f --tail=100
```

**Habilitar debug mode:**
```bash
# Editar api/.env
NODE_ENV=development
LOG_LEVEL=debug
```

### Recursos Online

- **Docker Docs:** https://docs.docker.com/
- **Node.js Docs:** https://nodejs.org/docs/
- **Prisma Docs:** https://www.prisma.io/docs
- **Fastify Docs:** https://www.fastify.io/docs/
- **RabbitMQ Docs:** https://www.rabbitmq.com/documentation.html

---

## ✅ Checklist de Instalação

Use este checklist para garantir que tudo está instalado corretamente:

### Pré-requisitos

- [ ] Git instalado e funcionando
- [ ] Docker Desktop instalado e rodando
- [ ] Docker Compose disponível
- [ ] Node.js 20+ instalado (opcional)
- [ ] Repositório clonado

### Configuração

- [ ] Arquivo `.env` criado e configurado
- [ ] Docker containers iniciados (`docker ps` mostra 4 containers)
- [ ] PostgreSQL acessível (health check OK)
- [ ] RabbitMQ acessível (management UI acessível)
- [ ] API respondendo em http://localhost:3000
- [ ] Worker iniciado e processando

### Verificação

- [ ] `/health` retorna status OK
- [ ] `/docs` mostra Swagger UI
- [ ] RabbitMQ Management acessível em http://localhost:15672
- [ ] Tabelas criadas no PostgreSQL
- [ ] Upload de CSV funcionando
- [ ] E-mails sendo processados
- [ ] Testes passando

### Pronto para Desenvolvimento

- [ ] Código modificado recarrega automaticamente
- [ ] Logs visíveis e informativos
- [ ] Debugger configurado (opcional)
- [ ] Documentação lida e compreendida

---

**Data:** 29 de Outubro de 2025  
**Versão:** 1.0  
**Status:** ✅ Completo e Testado  
**Autor:** Sistema de Envio de E-mails
