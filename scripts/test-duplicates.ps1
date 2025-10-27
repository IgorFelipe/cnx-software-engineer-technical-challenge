$filePath = "api\test\fixtures\test-duplicates.csv"
$uri = "http://localhost:3000/mailing"

$fileBytes = [System.IO.File]::ReadAllBytes($filePath)
$fileContent = [System.Text.Encoding]::UTF8.GetString($fileBytes)

$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test-duplicates.csv`"",
    "Content-Type: text/csv",
    "",
    $fileContent,
    "--$boundary",
    "Content-Disposition: form-data; name=`"hasHeader`"",
    "",
    "true",
    "--$boundary--"
) -join $LF

$response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines
Write-Host "`n=== Upload Response ===" -ForegroundColor Green
$response | ConvertTo-Json

Start-Sleep -Seconds 3

Write-Host "`n=== Checking Progress ===" -ForegroundColor Green
$progress = Invoke-RestMethod -Uri "$uri/$($response.mailingId)" -Method Get
$progress | ConvertTo-Json -Depth 5

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Total Rows: $($progress.totalRows)"
Write-Host "Processed Rows: $($progress.processedRows)"
Write-Host "Duplicates Skipped: $(($progress.totalRows - 1) - $($progress.entryCounts.PENDING))"
Write-Host "Unique Emails: $($progress.entryCounts.PENDING)"
