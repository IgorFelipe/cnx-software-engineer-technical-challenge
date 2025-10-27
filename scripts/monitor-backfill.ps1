# Monitor Outbox Backfill Progress
# Usage: .\scripts\monitor-backfill.ps1

Write-Host "📊 Monitoring Outbox Backfill Progress" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

function Get-BackfillStats {
    Write-Host "⏰ $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Yellow
    Write-Host ""
    
    # Database stats
    Write-Host "📦 Database Statistics:" -ForegroundColor Green
    
    $queries = @"
-- Pending mailings
SELECT COUNT(*) as pending_mailings FROM mailings WHERE status = 'PENDING';

-- Queued mailings
SELECT COUNT(*) as queued_mailings FROM mailings WHERE status = 'QUEUED';

-- Mailings without outbox
SELECT COUNT(*) as mailings_without_outbox 
FROM mailings m
WHERE m.status IN ('PENDING', 'QUEUED')
  AND NOT EXISTS (
    SELECT 1 FROM outbox_messages o WHERE o.mailing_id = m.id
  );

-- Unpublished outbox messages
SELECT COUNT(*) as unpublished_outbox FROM outbox_messages WHERE published = false;

-- Published outbox messages
SELECT COUNT(*) as published_outbox FROM outbox_messages WHERE published = true;

-- Failed mailings
SELECT COUNT(*) as failed_mailings FROM mailings WHERE status = 'FAILED';

-- Processing mailings
SELECT COUNT(*) as processing_mailings FROM mailings WHERE status = 'PROCESSING';

-- Completed mailings
SELECT COUNT(*) as completed_mailings FROM mailings WHERE status = 'COMPLETED';
"@

    docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "$queries"
    
    Write-Host ""
    Write-Host "🔄 RabbitMQ Queue Status:" -ForegroundColor Green
    docker exec email-mailing-rabbitmq rabbitmqctl list_queues name messages messages_ready messages_unacknowledged
    
    Write-Host ""
    Write-Host "-----------------------------------" -ForegroundColor DarkGray
    Write-Host ""
}

# Initial stats
Get-BackfillStats

# Monitor continuously
Write-Host "🔍 Monitoring mode (press Ctrl+C to stop)..." -ForegroundColor Cyan
Write-Host "   Refreshing every 5 seconds..." -ForegroundColor Gray
Write-Host ""

while ($true) {
    Start-Sleep -Seconds 5
    Get-BackfillStats
}
