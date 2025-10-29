#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Reset the entire application to ground zero
.DESCRIPTION
    This script will:
    1. Stop all Docker containers
    2. Remove all Docker volumes (PostgreSQL and RabbitMQ data)
    3. Clean up storage directory
    4. Reset the application to a clean state
.EXAMPLE
    .\reset-application.ps1
.EXAMPLE
    .\reset-application.ps1 -SkipConfirmation
#>

param(
    [switch]$SkipConfirmation
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warn($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Err($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

function Write-Step($step, $message) {
    Write-Host "`n[$step] $message" -ForegroundColor Magenta
}

# Main script
Write-Host "`n=========================================================" -ForegroundColor Red
Write-Host "         APPLICATION RESET - POINT ZERO                  " -ForegroundColor Red
Write-Host "=========================================================`n" -ForegroundColor Red

Write-Warn "This script will:"
Write-Host "  - Stop all Docker containers (API, Worker, PostgreSQL, RabbitMQ)"
Write-Host "  - Remove all Docker volumes (ALL DATA WILL BE LOST)"
Write-Host "  - Clean up storage directory"
Write-Host "  - Reset RabbitMQ queues and exchanges"
Write-Host ""

if (-not $SkipConfirmation) {
    $confirmation = Read-Host "Are you sure you want to proceed? Type 'YES' to confirm"
    if ($confirmation -ne "YES") {
        Write-Warn "Operation cancelled by user"
        exit 0
    }
}

Write-Host ""

# Step 1: Stop all containers
Write-Step "1/7" "Stopping all Docker containers..."
try {
    docker-compose -f docker-compose.yml down 2>&1 | Out-Null
    Write-Success "All containers stopped"
} catch {
    Write-Warn "Error stopping containers (they might not be running): $_"
}

# Step 2: Remove containers
Write-Step "2/7" "Removing containers..."
try {
    $containers = docker ps -a --filter "name=email-mailing" --format "{{.Names}}" 2>$null
    if ($containers) {
        foreach ($container in $containers) {
            Write-Info "Removing container: $container"
            docker rm -f $container 2>&1 | Out-Null
        }
        Write-Success "Containers removed"
    } else {
        Write-Info "No containers to remove"
    }
} catch {
    Write-Warn "Error removing containers: $_"
}

# Step 3: Remove Docker volumes
Write-Step "3/7" "Removing Docker volumes..."
try {
    $volumes = @(
        "cnx-software-engineer-technical-challenge_postgres_data",
        "cnx-software-engineer-technical-challenge_rabbitmq_data",
        "cnx-software-engineer-technical-challenge_mailing_storage"
    )
    
    foreach ($volume in $volumes) {
        $exists = docker volume ls --format "{{.Name}}" | Select-String -Pattern "^$volume$"
        if ($exists) {
            Write-Info "Removing volume: $volume"
            docker volume rm -f $volume 2>&1 | Out-Null
            Write-Success "Volume removed: $volume"
        } else {
            Write-Info "Volume not found: $volume"
        }
    }
} catch {
    Write-Warn "Error removing volumes: $_"
}

# Step 4: Clean up storage directory
Write-Step "4/7" "Cleaning up storage directory..."
try {
    $scriptDir = Split-Path -Parent $PSScriptRoot
    $storagePath = Join-Path $scriptDir "api\storage"
    if (Test-Path $storagePath) {
        Write-Info "Removing storage directory: $storagePath"
        Remove-Item -Path $storagePath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Storage directory cleaned"
    } else {
        Write-Info "Storage directory doesn't exist"
    }
} catch {
    Write-Warn "Error cleaning storage directory: $_"
}

# Step 5: Remove any leftover files
Write-Step "5/7" "Cleaning up temporary files..."
try {
    $scriptDir = Split-Path -Parent $PSScriptRoot
    $apiPath = Join-Path $scriptDir "api"
    $tempFiles = @(
        (Join-Path $apiPath "*.log"),
        (Join-Path $apiPath "*.tmp")
    )
    
    foreach ($pattern in $tempFiles) {
        $files = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
        if ($files) {
            foreach ($file in $files) {
                Write-Info "Removing: $($file.Name)"
                Remove-Item -Path $file.FullName -Force
            }
        }
    }
    Write-Success "Temporary files cleaned"
} catch {
    Write-Warn "Error cleaning temporary files: $_"
}

# Step 6: Remove node_modules (optional but helps with a clean start)
Write-Step "6/7" "Checking node_modules..."
try {
    $scriptDir = Split-Path -Parent $PSScriptRoot
    $nodeModulesPath = Join-Path $scriptDir "api\node_modules"
    if (Test-Path $nodeModulesPath) {
        Write-Warn "node_modules exists. Consider removing it for a completely clean start."
        Write-Info "To remove node_modules manually, run: Remove-Item -Path '$nodeModulesPath' -Recurse -Force"
    } else {
        Write-Info "node_modules not found (already clean)"
    }
} catch {
    Write-Warn "Error checking node_modules: $_"
}

# Step 7: Prune Docker system (optional)
Write-Step "7/7" "Docker system cleanup..."
try {
    Write-Info "Pruning unused Docker resources..."
    docker system prune -f --volumes 2>&1 | Out-Null
    Write-Success "Docker system cleaned"
} catch {
    Write-Warn "Error pruning Docker system: $_"
}

# Summary
Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "              APPLICATION RESET COMPLETE                 " -ForegroundColor Green
Write-Host "=========================================================`n" -ForegroundColor Green

Write-Success "All data has been wiped clean!"
Write-Info ""
Write-Info "Next steps to start fresh:"
Write-Info "  1. Start the services:"
Write-Info "     docker-compose up -d"
Write-Info ""
Write-Info "  2. The database will be automatically initialized"
Write-Info "     (Prisma migrations will run on container start)"
Write-Info ""
Write-Info "  3. Verify everything is running:"
Write-Info "     docker-compose ps"
Write-Info ""
Write-Info "  4. Check logs if needed:"
Write-Info "     docker-compose logs -f"
Write-Info ""

Write-Host "=========================================================`n" -ForegroundColor Gray
