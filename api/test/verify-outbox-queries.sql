-- Manual verification queries for Outbox Pattern implementation

-- 1. Check unpublished outbox messages
SELECT 
    id,
    mailing_id,
    target_queue,
    attempts,
    published,
    created_at,
    payload->>'mailingId' as payload_mailing_id,
    payload->>'filename' as payload_filename
FROM outbox_messages 
WHERE published = false
ORDER BY created_at DESC;

-- 2. Check mailings with PENDING/QUEUED status
SELECT 
    id,
    filename,
    storage_url,
    status,
    total_lines,
    processed_lines,
    attempts,
    created_at
FROM mailings
WHERE status IN ('PENDING', 'QUEUED')
ORDER BY created_at DESC;

-- 3. Check relationship - mailings with their outbox messages
SELECT 
    m.id as mailing_id,
    m.filename,
    m.status as mailing_status,
    o.id as outbox_id,
    o.published as outbox_published,
    o.target_queue,
    o.created_at as outbox_created_at
FROM mailings m
LEFT JOIN outbox_messages o ON m.id = o.mailing_id
WHERE m.status IN ('PENDING', 'QUEUED')
ORDER BY m.created_at DESC;

-- 4. Statistics
SELECT 
    'Total Mailings' as metric,
    COUNT(*) as count
FROM mailings
UNION ALL
SELECT 
    'Total Outbox Messages',
    COUNT(*)
FROM outbox_messages
UNION ALL
SELECT 
    'Unpublished Messages',
    COUNT(*)
FROM outbox_messages
WHERE published = false
UNION ALL
SELECT 
    'Published Messages',
    COUNT(*)
FROM outbox_messages
WHERE published = true;

-- 5. Check for orphaned mailings (without outbox messages)
SELECT 
    m.id,
    m.filename,
    m.status,
    m.created_at,
    COUNT(o.id) as outbox_message_count
FROM mailings m
LEFT JOIN outbox_messages o ON m.id = o.mailing_id
GROUP BY m.id, m.filename, m.status, m.created_at
HAVING COUNT(o.id) = 0;
