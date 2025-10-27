# Test email validation upload
$csvFile = "api\test\fixtures\test-validation.csv"

Write-Host "Testing email validation..." -ForegroundColor Cyan

# Upload CSV file
$uploadResponse = Invoke-WebRequest `
    -Uri "http://localhost:3000/mailing" `
    -Method POST `
    -Form @{
        file = Get-Item $csvFile
    } | ConvertFrom-Json

Write-Host "Upload Response:" -ForegroundColor Green
$uploadResponse | ConvertTo-Json -Depth 5

$mailingId = $uploadResponse.mailingId

# Wait for processing
Write-Host "Waiting for processing..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check mailing status
$statusResponse = Invoke-WebRequest `
    -Uri "http://localhost:3000/mailing/$mailingId" `
    -Method GET | ConvertFrom-Json

Write-Host "Mailing Status:" -ForegroundColor Cyan
$statusResponse | ConvertTo-Json -Depth 5

Write-Host "Summary:" -ForegroundColor Magenta
$processedCount = $statusResponse.progress.processedRows
$invalidCount = if ($statusResponse.stats.INVALID) { $statusResponse.stats.INVALID } else { 0 }
$pendingCount = if ($statusResponse.stats.PENDING) { $statusResponse.stats.PENDING } else { 0 }

Write-Host "Total processed: $processedCount" -ForegroundColor White
Write-Host "Invalid: $invalidCount" -ForegroundColor Red
Write-Host "Valid: $pendingCount" -ForegroundColor Green
