# Test upload script
$filePath = "d:\Igor\Repos\cnx-software-engineer-technical-challenge\api\test\fixtures\test-outbox.csv"
$url = "http://localhost:3000/mailings"

$fileContent = Get-Content $filePath -Raw
$boundary = [System.Guid]::NewGuid().ToString()

$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test-outbox.csv`"",
    "Content-Type: text/csv",
    "",
    $fileContent,
    "--$boundary--"
)

$body = $bodyLines -join "`r`n"

try {
    $response = Invoke-WebRequest -Uri $url -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body $body
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "❌ Error!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Response: $($_.ErrorDetails.Message)"
}
