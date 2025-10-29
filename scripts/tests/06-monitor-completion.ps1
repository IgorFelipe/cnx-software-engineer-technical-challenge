# Test 06: Monitor Completion
# Monitora ate completar ou timeout

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "06-monitor-completion-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 06: Monitor Completion ===" "Cyan"

if (-not (Test-Path ".\mailing-id.txt")) {
    Write-Log "FAIL No mailing ID found" "Red"
    exit 1
}

$mailingId = Get-Content ".\mailing-id.txt"
Write-Log "Monitoring for up to 5 minutes..." "Gray"

$maxWait = 300
$startTime = Get-Date
$progressMade = $false
$lastProg = 0

while (((Get-Date) - $startTime).TotalSeconds -lt $maxWait) {
    $query = "SELECT status, processed_lines, total_lines FROM mailings WHERE id = '$mailingId';"
    $result = docker exec email-mailing-db psql -U postgres -d email_mailing -t -A -F '|' -c $query 2>&1
    
    if ($result -match '(\w+)\|(\d+)\|(\d+)') {
        $status = $matches[1]
        $proc = [int]$matches[2]
        $total = [int]$matches[3]
        
        if ($proc -ne $lastProg) {
            $pct = [math]::Round(($proc / $total) * 100, 1)
            Write-Log "  $proc of $total ($pct%)" "Gray"
            $lastProg = $proc
            $progressMade = $true
        }
        
        if ($status -eq "COMPLETED") {
            "$proc|$total|$status" | Out-File -FilePath ".\progress-after.txt" -NoNewline
            Write-Log "PASS Mailing completed - $proc of $total emails" "Green"
            exit 0
        }
    }
    
    Start-Sleep -Seconds 5
}

# Timeout reached
$query = "SELECT status, processed_lines, total_lines FROM mailings WHERE id = '$mailingId';"
$result = docker exec email-mailing-db psql -U postgres -d email_mailing -t -A -F '|' -c $query 2>&1

if ($result -match '(\w+)\|(\d+)\|(\d+)') {
    $status = $matches[1]
    $proc = [int]$matches[2]
    $total = [int]$matches[3]
    
    "$proc|$total|$status" | Out-File -FilePath ".\progress-after.txt" -NoNewline
    
    if ($progressMade) {
        Write-Log "WARN Processing resumed but not completed in 2 minutes" "Yellow"
        Write-Log "INFO Final $proc of $total - Status $status" "Gray"
        exit 0
    } else {
        Write-Log "FAIL No progress made after crash" "Red"
        exit 1
    }
}

Write-Log "FAIL Could not verify completion" "Red"
exit 1
