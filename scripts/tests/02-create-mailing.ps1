# Test 02: Create Mailing
# Cria um mailing de teste

param([string]$ApiUrl = "http://localhost:3000")

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "02-create-mailing-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 02: Create Mailing ===" "Cyan"

$csvPath = "..\..\api\test\fixtures\mailing_list_small.csv"

if (-not (Test-Path $csvPath)) {
    Write-Log "FAIL CSV not found" "Red"
    Write-Log "Tried path: $csvPath" "Red"
    exit 1
}

Write-Log "Uploading mailing CSV..." "Gray"

$boundary = [System.Guid]::NewGuid().ToString()
$fileBytes = [System.IO.File]::ReadAllBytes($csvPath)
$LF = "`r`n"
$uniqueFilename = "test-$(Get-Date -Format 'yyyyMMddHHmmss').csv"

$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"$uniqueFilename`"",
    "Content-Type: text/csv$LF",
    [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes),
    "--$boundary--$LF"
) -join $LF

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/mailings" `
        -Method Post `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Body $bodyLines `
        -TimeoutSec 30
    
    $mailingId = $response.mailingId
    
    # Save mailing ID for other tests
    $mailingId | Out-File -FilePath ".\mailing-id.txt" -NoNewline
    
    Write-Log "PASS Mailing created with ID $mailingId" "Green"
    exit 0
} catch {
    Write-Log "FAIL Failed to create mailing" "Red"
    Write-Log "Error: $_" "Red"
    exit 1
}
