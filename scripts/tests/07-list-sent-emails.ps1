# Test 07: List Sent Emails
# Lists all emails that were processed and sent

Write-Host ""
Write-Host "=== TEST 07: List Sent Emails ===" -ForegroundColor Cyan

# Get the mailing ID from environment variable (set by run-all-tests.ps1)
$mailingId = $env:MAILING_ID

if (-not $mailingId) {
    Write-Host "ERROR No mailing ID provided" -ForegroundColor Red
    exit 1
}

Write-Host "Querying database for mailing: $mailingId"

# Query all entries for this mailing
$query = @"
SELECT 
    email, 
    status, 
    token, 
    external_id, 
    attempts,
    invalid_reason,
    created_at
FROM mailing_entries 
WHERE mailing_id = '$mailingId' 
ORDER BY 
    CASE status 
        WHEN 'SENT' THEN 1 
        WHEN 'FAILED' THEN 2 
        WHEN 'INVALID' THEN 3 
        ELSE 4 
    END,
    created_at;
"@

$result = docker exec email-mailing-db psql -U postgres -d email_mailing -t -A -F'|' -c $query

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR Failed to query database" -ForegroundColor Red
    exit 1
}

# Parse and display results
$entries = $result -split "`n" | Where-Object { $_.Trim() -ne "" }

$sentCount = 0
$failedCount = 0
$invalidCount = 0

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host " EMAIL PROCESSING REPORT" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Group by status
$sentEmails = @()
$failedEmails = @()
$invalidEmails = @()

foreach ($entry in $entries) {
    $fields = $entry -split '\|'
    if ($fields.Count -ge 5) {
        $email = $fields[0]
        $status = $fields[1]
        $token = $fields[2]
        $externalId = $fields[3]
        $attempts = $fields[4]
        $invalidReason = $fields[5]
        
        $entryObj = [PSCustomObject]@{
            Email = $email
            Status = $status
            Token = $token
            ExternalId = $externalId
            Attempts = $attempts
            InvalidReason = $invalidReason
        }
        
        switch ($status) {
            "SENT" { 
                $sentEmails += $entryObj
                $sentCount++ 
            }
            "FAILED" { 
                $failedEmails += $entryObj
                $failedCount++ 
            }
            "INVALID" { 
                $invalidEmails += $entryObj
                $invalidCount++ 
            }
        }
    }
}

# Display SENT emails
if ($sentCount -gt 0) {
    Write-Host "[SENT] EMAILS ($sentCount)" -ForegroundColor Green
    Write-Host ("-" * 80)
    foreach ($entry in $sentEmails) {
        Write-Host ("  * {0,-25} | Token: {1} | MsgID: {2}" -f $entry.Email, $entry.Token.Substring(0, 8), $entry.ExternalId) -ForegroundColor Green
    }
    Write-Host ""
}

# Display FAILED emails
if ($failedCount -gt 0) {
    Write-Host "[FAILED] EMAILS ($failedCount)" -ForegroundColor Red
    Write-Host ("-" * 80)
    foreach ($entry in $failedEmails) {
        $reason = if ($entry.InvalidReason) { $entry.InvalidReason } else { "Unknown" }
        Write-Host ("  * {0,-25} | Token: {1} | Attempts: {2} | Reason: {3}" -f $entry.Email, $entry.Token.Substring(0, 8), $entry.Attempts, $reason) -ForegroundColor Red
    }
    Write-Host ""
}

# Display INVALID emails
if ($invalidCount -gt 0) {
    Write-Host "[INVALID] EMAILS ($invalidCount)" -ForegroundColor Yellow
    Write-Host ("-" * 80)
    foreach ($entry in $invalidEmails) {
        Write-Host ("  * {0,-25} | Reason: {1}" -f $entry.Email, $entry.InvalidReason) -ForegroundColor Yellow
    }
    Write-Host ""
}

# Summary
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host " SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ("  Total Processed: {0}" -f ($sentCount + $failedCount + $invalidCount))
Write-Host ("  [SENT]    Sent:        {0}" -f $sentCount) -ForegroundColor Green
Write-Host ("  [FAILED]  Failed:      {0}" -f $failedCount) -ForegroundColor Red
Write-Host ("  [INVALID] Invalid:     {0}" -f $invalidCount) -ForegroundColor Yellow
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Log to file if LOG_FILE is set
if ($env:LOG_FILE) {
    Add-Content -Path $env:LOG_FILE -Value ""
    Add-Content -Path $env:LOG_FILE -Value "=== EMAIL PROCESSING REPORT ==="
    Add-Content -Path $env:LOG_FILE -Value "Sent: $sentCount"
    Add-Content -Path $env:LOG_FILE -Value "Failed: $failedCount"
    Add-Content -Path $env:LOG_FILE -Value "Invalid: $invalidCount"
    
    if ($sentCount -gt 0) {
        Add-Content -Path $env:LOG_FILE -Value ""
        Add-Content -Path $env:LOG_FILE -Value "SENT EMAILS:"
        foreach ($entry in $sentEmails) {
            Add-Content -Path $env:LOG_FILE -Value "  - $($entry.Email) | Token: $($entry.Token) | MsgID: $($entry.ExternalId)"
        }
    }
    
    if ($failedCount -gt 0) {
        Add-Content -Path $env:LOG_FILE -Value ""
        Add-Content -Path $env:LOG_FILE -Value "FAILED EMAILS:"
        foreach ($entry in $failedEmails) {
            $reason = if ($entry.InvalidReason) { $entry.InvalidReason } else { "Unknown" }
            Add-Content -Path $env:LOG_FILE -Value "  - $($entry.Email) | Token: $($entry.Token) | Attempts: $($entry.Attempts) | Reason: $reason"
        }
    }
    
    if ($invalidCount -gt 0) {
        Add-Content -Path $env:LOG_FILE -Value ""
        Add-Content -Path $env:LOG_FILE -Value "INVALID EMAILS:"
        foreach ($entry in $invalidEmails) {
            Add-Content -Path $env:LOG_FILE -Value "  - $($entry.Email) | Reason: $($entry.InvalidReason)"
        }
    }
}

Write-Host "PASS Email report generated" -ForegroundColor Green
exit 0
