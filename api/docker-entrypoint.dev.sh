#!/bin/sh
set -e

echo "🚀 Starting Email Mailing API (Development)..."

# Wait for database
echo "⏳ Waiting for database..."
until echo "SELECT 1" | npx prisma db execute --stdin > /dev/null 2>&1; do
  echo "   Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Run migrations
echo "🔄 Running migrations..."
npx prisma migrate deploy

echo "✅ Migrations completed!"

# Start with hot reload
echo "🔥 Starting with hot reload..."
exec npx tsx watch src/index.ts
