# Test 01: Health Check
# Verifica se API e containers estao saudaveis

param([string]$ApiUrl = "http://localhost:3000")

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = if ($env:TEST_LOG_FILE) { $env:TEST_LOG_FILE } else { Join-Path $logDir "01-health-check-$timestamp.log" }

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "`n=== TEST 01: Health Check ===" "Cyan"

# Check API
Write-Log "Checking API health..." "Gray"
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 10
    if ($health.status -eq "ok") {
        Write-Log "PASS API is healthy" "Green"
    } else {
        Write-Log "FAIL API health check failed" "Red"
        exit 1
    }
} catch {
    Write-Log "FAIL API not responding" "Red"
    exit 1
}

# Check Docker containers
Write-Log "Checking Docker containers..." "Gray"
$api = docker ps --filter "name=email-mailing-api" --format "{{.Status}}" | Select-String "Up"
$worker = docker ps --filter "name=email-mailing-worker" --format "{{.Status}}" | Select-String "Up"
$db = docker ps --filter "name=email-mailing-db" --format "{{.Status}}" | Select-String "Up"
$rabbit = docker ps --filter "name=email-mailing-rabbitmq" --format "{{.Status}}" | Select-String "Up"

if ($api -and $worker -and $db -and $rabbit) {
    Write-Log "PASS All containers are running" "Green"
    exit 0
} else {
    Write-Log "FAIL Some containers are not running" "Red"
    exit 1
}
