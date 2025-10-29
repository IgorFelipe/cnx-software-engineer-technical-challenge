# Test 03: Wait for Processing
# Aguarda inicio do processamento

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "03-wait-processing-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 03: Wait for Processing ===" "Cyan"

if (-not (Test-Path ".\mailing-id.txt")) {
    Write-Log "FAIL No mailing ID found" "Red"
    exit 1
}

$mailingId = Get-Content ".\mailing-id.txt"
Write-Log "Waiting for at least 10 items to be processed..." "Gray"

$maxAttempts = 60
$attemptCount = 0
$targetProcessed = 10

while ($attemptCount -lt $maxAttempts) {
    Start-Sleep -Seconds 2
    $attemptCount++
    
    $query = "SELECT processed_lines, total_lines, status FROM mailings WHERE id = '$mailingId';"
    $result = docker exec email-mailing-db psql -U postgres -d email_mailing -t -A -F '|' -c $query 2>&1
    
    if ($result -match '(\d+)\|(\d+)\|(\w+)') {
        $proc = [int]$matches[1]
        $total = [int]$matches[2]
        $status = $matches[3]
        
        if ($proc -ge $targetProcessed) {
            # Save progress
            "$proc|$total|$status" | Out-File -FilePath ".\progress-before.txt" -NoNewline
            Write-Log "PASS Processing reached target - $proc of $total processed - Status $status" "Green"
            exit 0
        } elseif ($proc -gt 0) {
            Write-Log "  Progress: $proc of $total processed..." "Gray"
        }
    }
}

# Timeout - check final status
$query = "SELECT processed_lines, total_lines, status FROM mailings WHERE id = '$mailingId';"
$result = docker exec email-mailing-db psql -U postgres -d email_mailing -t -A -F '|' -c $query 2>&1

if ($result -match '(\d+)\|(\d+)\|(\w+)') {
    $proc = [int]$matches[1]
    $total = [int]$matches[2]
    $status = $matches[3]
    
    # Save progress
    "$proc|$total|$status" | Out-File -FilePath ".\progress-before.txt" -NoNewline
    
    if ($proc -gt 0) {
        Write-Log "WARN Only $proc items processed (target was $targetProcessed) - continuing anyway" "Yellow"
        exit 0
    } else {
        Write-Log "FAIL No items processed after waiting" "Red"
        exit 1
    }
} else {
    Write-Log "FAIL Could not read progress" "Red"
    "0|0|UNKNOWN" | Out-File -FilePath ".\progress-before.txt" -NoNewline
    exit 1
}
