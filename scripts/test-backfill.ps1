# Test Backfill Script
# Creates a test mailing without outbox message to demonstrate backfill functionality

Write-Host "Testing Backfill Functionality" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test mailing WITHOUT outbox message (simulating old system or failure scenario)
Write-Host "Step 1: Creating test mailing without outbox..." -ForegroundColor Yellow

$createMailingQuery = @"
INSERT INTO mailings (id, filename, storage_url, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'test-backfill.csv',
  '/app/storage/mailings/test-backfill.csv',
  'PENDING',
  NOW(),
  NOW()
)
RETURNING id, filename, status;
"@

$result = docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "$createMailingQuery"
Write-Host $result
Write-Host ""

# Step 2: Verify mailing exists without outbox
Write-Host "2  Verifying mailing without outbox..." -ForegroundColor Yellow

$verifyQuery = @"
SELECT m.id, m.filename, m.status, 
       (SELECT COUNT(*) FROM outbox_messages o WHERE o.mailing_id = m.id) as outbox_count
FROM mailings m
WHERE m.filename = 'test-backfill.csv'
ORDER BY m.created_at DESC
LIMIT 1;
"@

docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "$verifyQuery"
Write-Host ""

# Step 3: Run backfill in dry-run mode
Write-Host "3  Running backfill (dry-run)..." -ForegroundColor Yellow
cd ..\api
npm run backfill:dry-run
Write-Host ""

# Step 4: Run actual backfill
Write-Host "4  Running actual backfill..." -ForegroundColor Yellow
npm run backfill:outbox
Write-Host ""

# Step 5: Verify outbox was created
Write-Host "5  Verifying outbox message was created..." -ForegroundColor Yellow

$verifyOutboxQuery = @"
SELECT m.id, m.filename, m.status, 
       (SELECT COUNT(*) FROM outbox_messages o WHERE o.mailing_id = m.id) as outbox_count,
       o.id as outbox_id, o.published, o.target_queue
FROM mailings m
LEFT JOIN outbox_messages o ON o.mailing_id = m.id
WHERE m.filename = 'test-backfill.csv'
ORDER BY m.created_at DESC
LIMIT 1;
"@

docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "$verifyOutboxQuery"
Write-Host ""

# Step 6: Check unpublished outbox count
Write-Host "6  Checking unpublished outbox messages..." -ForegroundColor Yellow

$unpublishedQuery = "SELECT COUNT(*) as unpublished_count FROM outbox_messages WHERE published = false;"
docker exec -it email-mailing-db psql -U postgres -d email_mailing -c "$unpublishedQuery"
Write-Host ""

Write-Host " Test complete!" -ForegroundColor Green
Write-Host ""
Write-Host " What should happen next:" -ForegroundColor Cyan
Write-Host "   1. Outbox publisher will pick up the unpublished message"
Write-Host "   2. Message will be published to RabbitMQ (mailing.jobs.process queue)"
Write-Host "   3. Worker consumer will process the job"
Write-Host ""
Write-Host "Monitor with:" -ForegroundColor Cyan
Write-Host "   docker logs email-mailing-api --tail 50 --follow" -ForegroundColor Gray

