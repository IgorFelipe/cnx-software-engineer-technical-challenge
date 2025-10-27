# RabbitMQ Topology Inspector
# Verifica a topologia do RabbitMQ

$RABBITMQ_USER = "rabbitmq"
$RABBITMQ_PASS = "rabbitmq"
$RABBITMQ_HOST = "localhost:15672"
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${RABBITMQ_USER}:${RABBITMQ_PASS}"))
$headers = @{ Authorization = "Basic $base64Auth" }

Write-Host ""
Write-Host "RABBITMQ TOPOLOGY SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 100 -ForegroundColor Gray
Write-Host ""

# Show Exchanges
Write-Host "EXCHANGES" -ForegroundColor Yellow
Write-Host "-" * 100 -ForegroundColor Gray

$exchanges = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/exchanges/%2F" -Headers $headers
$mailings = $exchanges | Where-Object { $_.name -eq 'mailings' }

Write-Host "  Name: $($mailings.name)" -ForegroundColor White
Write-Host "  Type: $($mailings.type)" -ForegroundColor Green
Write-Host "  Durable: $($mailings.durable)" -ForegroundColor Green
Write-Host ""

# Show Queues
Write-Host "QUEUES" -ForegroundColor Yellow
Write-Host "-" * 100 -ForegroundColor Gray

$queues = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/queues/%2F" -Headers $headers

foreach ($queue in $queues) {
    $ttl = if ($queue.arguments.'x-message-ttl') { "$($queue.arguments.'x-message-ttl' / 1000)s" } else { "none" }
    $dlx = if ($queue.arguments.'x-dead-letter-exchange') { $queue.arguments.'x-dead-letter-exchange' } else { "none" }
    $dlxKey = if ($queue.arguments.'x-dead-letter-routing-key') { $queue.arguments.'x-dead-letter-routing-key' } else { "none" }
    
    Write-Host ""
    Write-Host "  Queue: $($queue.name)" -ForegroundColor White
    Write-Host "    Durable: $($queue.durable)" -ForegroundColor Green
    Write-Host "    Messages: $($queue.messages) (ready: $($queue.messages_ready), unacked: $($queue.messages_unacknowledged))" -ForegroundColor $(if ($queue.messages -gt 0) { "Yellow" } else { "Green" })
    Write-Host "    TTL: $ttl" -ForegroundColor Magenta
    Write-Host "    DLX: $dlx" -ForegroundColor Magenta
    Write-Host "    DLX Key: $dlxKey" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "BINDINGS" -ForegroundColor Yellow
Write-Host "-" * 100 -ForegroundColor Gray

$bindings = Invoke-RestMethod -Uri "http://${RABBITMQ_HOST}/api/bindings/%2F" -Headers $headers
$mailingBindings = $bindings | Where-Object { $_.source -eq 'mailings' }

foreach ($binding in $mailingBindings) {
    Write-Host ""
    Write-Host "  $($binding.source) -> $($binding.destination) (key: $($binding.routing_key))" -ForegroundColor White
}

Write-Host ""
Write-Host ""
Write-Host "Topology verification complete!" -ForegroundColor Green
Write-Host "Access RabbitMQ Management UI: http://${RABBITMQ_HOST}" -ForegroundColor Cyan
Write-Host ""
