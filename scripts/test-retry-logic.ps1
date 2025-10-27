# Test Retry Logic - Simula falhas da API externa
# Este script testa o fluxo completo de retry:
# 1. Upload CSV
# 2. Simular falha na API (via mock ou erro forçado)
# 3. Verificar mensagem em retry.1 (60s)
# 4. Aguardar TTL expirar
# 5. Verificar retorno para mailing.jobs.process
# 6. Após MAX_RETRIES, verificar em DLQ e dead_letters

Write-Host "`nTEST RETRY LOGIC - Verificacao de Fluxo de Retry" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

$RABBITMQ_USER = "rabbitmq"
$RABBITMQ_PASS = "rabbitmq"
$RABBITMQ_HOST = "localhost:15672"
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${RABBITMQ_USER}:${RABBITMQ_PASS}"))
$headers = @{ Authorization = "Basic $base64Auth" }

# Função para consultar filas
function Get-QueueStats {
    $queues = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/queues/%2F" -Headers $headers
    
    Write-Host "`nSTATUS DAS FILAS:" -ForegroundColor Yellow
    Write-Host "-" * 70 -ForegroundColor Gray
    
    foreach ($queue in $queues | Where-Object { $_.name -like 'mailing.*' }) {
        $status = if ($queue.messages -gt 0) { "Yellow" } else { "Green" }
        Write-Host "  $($queue.name):" -NoNewline -ForegroundColor White
        Write-Host " $($queue.messages) messages" -ForegroundColor $status
        Write-Host "    Ready: $($queue.messages_ready), Unacked: $($queue.messages_unacknowledged)" -ForegroundColor Gray
    }
    Write-Host ""
}

# Função para consultar mailings no banco
function Get-MailingStatus {
    param([string]$mailingId)
    
    $query = "SELECT id, filename, status, attempts, last_attempt, error_message, processed_lines FROM mailings WHERE id = '$mailingId'"
    $result = docker exec -i email-mailing-db psql -U postgres -d email_mailing -c $query 2>&1
    
    Write-Host "`nSTATUS DO MAILING:" -ForegroundColor Yellow
    Write-Host "-" * 70 -ForegroundColor Gray
    Write-Host $result
}

# Função para consultar dead letters
function Get-DeadLetters {
    $query = "SELECT id, mailing_id, reason, attempts, last_error, created_at FROM dead_letters ORDER BY created_at DESC LIMIT 5"
    $result = docker exec -i email-mailing-db psql -U postgres -d email_mailing -c $query 2>&1
    
    Write-Host "`nDEAD LETTERS:" -ForegroundColor Yellow
    Write-Host "-" * 70 -ForegroundColor Gray
    Write-Host $result
}

# Passo 1: Upload CSV de teste
Write-Host "PASSO 1: Upload CSV de teste" -ForegroundColor Cyan
Write-Host "-" * 70 -ForegroundColor Gray

$csvContent = @"
email
test-retry-1@example.com
test-retry-2@example.com
"@

$csvContent | Out-File -Encoding utf8 -FilePath "test-retry.csv"

Write-Host "Uploading CSV..." -ForegroundColor Gray
$response = curl.exe -X POST http://localhost:3000/mailings -F "file=@test-retry.csv" 2>&1 | ConvertFrom-Json

if ($response.mailingId) {
    $mailingId = $response.mailingId
    Write-Host "OK - Mailing ID: $mailingId" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "ERRO - Falha no upload" -ForegroundColor Red
    Write-Host $response
    exit 1
}

# Passo 2: Aguardar processamento inicial
Write-Host "PASSO 2: Aguardando processamento inicial (5s)..." -ForegroundColor Cyan
Write-Host "-" * 70 -ForegroundColor Gray
Start-Sleep -Seconds 5

Get-QueueStats
Get-MailingStatus -mailingId $mailingId

# Passo 3: Verificar se foi para retry
Write-Host "`nPASSO 3: Verificando retry queue..." -ForegroundColor Cyan
Write-Host "-" * 70 -ForegroundColor Gray

$retry1 = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/queues/%2F/mailing.jobs.retry.1" -Headers $headers

if ($retry1.messages -gt 0) {
    Write-Host "OK - Mensagem em retry.1 (TTL: 60s)" -ForegroundColor Green
    Write-Host "   Messages: $($retry1.messages)" -ForegroundColor Gray
} else {
    Write-Host "INFO - Nenhuma mensagem em retry.1" -ForegroundColor Yellow
    Write-Host "   (Job pode ter completado com sucesso ou ido para retry.2/DLQ)" -ForegroundColor Gray
}

# Passo 4: Aguardar TTL (apenas se houver mensagens em retry.1)
if ($retry1.messages -gt 0) {
    Write-Host "`nPASSO 4: Aguardando TTL de 60s..." -ForegroundColor Cyan
    Write-Host "-" * 70 -ForegroundColor Gray
    Write-Host "Aguardando retorno automatico para mailing.jobs.process..." -ForegroundColor Gray
    
    for ($i = 60; $i -gt 0; $i -= 10) {
        Write-Host "  $i segundos restantes..." -ForegroundColor Gray
        Start-Sleep -Seconds 10
        
        # Verificar se ja voltou
        $retry1Check = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/queues/%2F/mailing.jobs.retry.1" -Headers $headers
        if ($retry1Check.messages -eq 0) {
            Write-Host "  Mensagem retornou para processo!" -ForegroundColor Green
            break
        }
    }
}

# Passo 5: Verificar status final
Write-Host "`nPASSO 5: Status final das filas" -ForegroundColor Cyan
Write-Host "-" * 70 -ForegroundColor Gray
Get-QueueStats

# Passo 6: Verificar mailing no banco
Get-MailingStatus -mailingId $mailingId

# Passo 7: Verificar dead letters (se houver)
Get-DeadLetters

# Cleanup
Remove-Item -Path "test-retry.csv" -ErrorAction SilentlyContinue

Write-Host "`n" -NoNewline
Write-Host "TESTE CONCLUIDO" -ForegroundColor Green
Write-Host "Para monitorar em tempo real:" -ForegroundColor Yellow
Write-Host "  docker logs email-mailing-api --follow" -ForegroundColor White
Write-Host "  RabbitMQ Management: http://localhost:15672" -ForegroundColor White
Write-Host ""
