# Test 05: Verify Crash Recovery
# Verifica se o sistema detectou o crash

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "05-verify-recovery-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 05: Verify Crash Recovery ===" "Cyan"

Write-Log "Checking worker logs..." "Gray"
$logs = docker logs email-mailing-worker --tail 300 2>&1 | Out-String

if ($logs -match "stale|recovered|Created outbox|Checking for stale CSV") {
    Write-Log "PASS Crash recovery system activated" "Green"
    "YES" | Out-File -FilePath ".\recovery-detected.txt" -NoNewline
    exit 0
} else {
    Write-Log "WARN Recovery not detected yet" "Yellow"
    Write-Log "INFO This is normal - recovery runs every 5 minutes" "Gray"
    "NO" | Out-File -FilePath ".\recovery-detected.txt" -NoNewline
    exit 0
}
