-- Verificação das tabelas criadas pelo Outbox Pattern

-- 1. Verificar se a tabela mailings existe e está vazia
SELECT 'mailings' as table_name, COUNT(*) as count FROM mailings
UNION ALL
-- 2. Verificar se a tabela outbox_messages existe e está vazia
SELECT 'outbox_messages' as table_name, COUNT(*) as count FROM outbox_messages
UNION ALL
-- 3. Verificar se a tabela outbox_dead_letters existe e está vazia
SELECT 'outbox_dead_letters' as table_name, COUNT(*) as count FROM outbox_dead_letters;

-- 4. Verificar estrutura da tabela mailings
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'mailings'
ORDER BY ordinal_position;

-- 5. Verificar estrutura da tabela outbox_messages
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'outbox_messages'
ORDER BY ordinal_position;

-- 6. Verificar índices criados
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('mailings', 'outbox_messages', 'outbox_dead_letters')
ORDER BY tablename, indexname;

-- 7. Verificar constraints e foreign keys
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name IN ('mailings', 'outbox_messages', 'outbox_dead_letters')
ORDER BY tc.table_name, tc.constraint_type;
