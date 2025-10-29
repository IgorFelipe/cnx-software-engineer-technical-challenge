# =====================================================================
# RUN ALL TESTS
# Executa todos os testes de crash recovery em sequencia
# =====================================================================

param(
    [string]$ApiUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"

# Setup logging
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "test-suite-$timestamp.log"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $logMessage = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $Message -ForegroundColor $Color
    $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "" "White"
Write-Log "====================================================================" "Cyan"
Write-Log " ALL TEST SUITE" "Cyan"
Write-Log "====================================================================" "Cyan"
Write-Log "" "White"
Write-Log "Starting test suite at $(Get-Date -Format 'HH:mm:ss')" "Gray"
Write-Log "Log file: $logFile" "Gray"
Write-Log "" "White"

# Change to tests directory
$testsDir = Join-Path $PSScriptRoot "tests"
Push-Location $testsDir

# Clean up previous test artifacts
Remove-Item -Path ".\mailing-id.txt" -ErrorAction SilentlyContinue
Remove-Item -Path ".\progress-before.txt" -ErrorAction SilentlyContinue
Remove-Item -Path ".\progress-after.txt" -ErrorAction SilentlyContinue
Remove-Item -Path ".\recovery-detected.txt" -ErrorAction SilentlyContinue

# Test counters
$script:passed = 0
$script:failed = 0
$script:warnings = 0

# Run tests in sequence
$tests = @(
    "01-health-check.ps1",
    "02-create-mailing.ps1",
    "03-wait-processing.ps1",
    "04-crash-worker.ps1",
    "05-verify-recovery.ps1",
    "06-monitor-completion.ps1",
    "07-list-sent-emails.ps1"
)

foreach ($test in $tests) {
    Write-Log "Running $test..." "Gray"
    
    # Pass log file path and mailing ID to child tests
    $env:TEST_LOG_FILE = $logFile
    if (Test-Path ".\mailing-id.txt") {
        $env:MAILING_ID = Get-Content ".\mailing-id.txt"
    }
    
    $output = & powershell -ExecutionPolicy Bypass -File $test -ApiUrl $ApiUrl 2>&1
    $exitCode = $LASTEXITCODE
    
    # Show output and log it
    $output | ForEach-Object { 
        Write-Host $_
        "[$(Get-Date -Format 'HH:mm:ss')] $_" | Out-File -FilePath $logFile -Append -Encoding UTF8
    }
    
    if ($exitCode -eq 0) {
        $script:passed++
    } else {
        $script:failed++
        Write-Log "Test failed with exit code $exitCode" "Red"
    }
}

# Read results
$mailingId = if (Test-Path ".\mailing-id.txt") { Get-Content ".\mailing-id.txt" } else { "N/A" }
$progressBefore = if (Test-Path ".\progress-before.txt") { Get-Content ".\progress-before.txt" } else { "N/A" }
$progressAfter = if (Test-Path ".\progress-after.txt") { Get-Content ".\progress-after.txt" } else { "N/A" }
$recoveryDetected = if (Test-Path ".\recovery-detected.txt") { Get-Content ".\recovery-detected.txt" } else { "N/A" }

# Display summary
Write-Log "" "White"
Write-Log "====================================================================" "Cyan"
Write-Log " TEST SUITE SUMMARY" "Cyan"
Write-Log "====================================================================" "Cyan"
Write-Log "" "White"
Write-Log "Tests Passed -> $script:passed" "Green"
if ($script:failed -gt 0) {
    Write-Log "Tests Failed -> $script:failed" "Red"
}
Write-Log "" "White"
Write-Log "Mailing ID -> $mailingId" "Gray"

if ($progressBefore -ne "N/A" -and $progressBefore -match '(\d+)\|(\d+)\|(\w+)') {
    $beforeProc = $matches[1]
    $beforeTotal = $matches[2]
    $beforeStatus = $matches[3]
    Write-Log "Before Crash -> $beforeProc of $beforeTotal [$beforeStatus]" "Gray"
}

if ($progressAfter -ne "N/A" -and $progressAfter -match '(\d+)\|(\d+)\|(\w+)') {
    $afterProc = $matches[1]
    $afterTotal = $matches[2]
    $afterStatus = $matches[3]
    Write-Log "After Recovery -> $afterProc of $afterTotal [$afterStatus]" "Gray"
}

Write-Log "Recovery Detected -> $recoveryDetected" "Gray"
Write-Log "" "White"

# Final result
if ($script:failed -eq 0) {
    if ($progressAfter -match 'COMPLETED') {
        Write-Log "====================================================================" "Green"
        Write-Log " ALL TESTS PASSED - CRASH RECOVERY WORKING!" "Green"
        Write-Log "====================================================================" "Green"
        Pop-Location
        exit 0
    } else {
        Write-Log "====================================================================" "Yellow"
        Write-Log " TESTS PASSED BUT PROCESSING INCOMPLETE" "Yellow"
        Write-Log "====================================================================" "Yellow"
        Pop-Location
        exit 0
    }
} else {
    Write-Log "====================================================================" "Red"
    Write-Log " SOME TESTS FAILED" "Red"
    Write-Log "====================================================================" "Red"
    Pop-Location
    exit 1
}
