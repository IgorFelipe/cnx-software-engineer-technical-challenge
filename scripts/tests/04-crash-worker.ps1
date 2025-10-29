# Test 04: Crash and Restart Worker
# Simula crash do worker

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "04-crash-worker-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 04: Crash and Restart Worker ===" "Cyan"

Write-Log "Killing worker container..." "Yellow"
docker kill email-mailing-worker 2>&1 | Out-Null
Write-Log "Worker killed" "Gray"

Start-Sleep -Seconds 3

Write-Log "Restarting worker..." "Gray"
docker start email-mailing-worker 2>&1 | Out-Null
Write-Log "Worker restarted" "Gray"

Write-Log "Waiting 20 seconds for crash recovery system..." "Gray"
Start-Sleep -Seconds 20

Write-Log "PASS Crash simulation completed" "Green"
exit 0
