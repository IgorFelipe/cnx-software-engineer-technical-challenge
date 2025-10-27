#!/bin/sh
set -e

echo "🚀 Starting Email Mailing API..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until nc -z postgres 5432; do
  echo "   Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Additional wait to ensure database is fully initialized
sleep 3

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Migrations completed!"

# Generate Prisma Client (in case of schema changes)
echo "🔧 Generating Prisma Client..."
npx prisma generate

echo "✅ Prisma Client generated!"

# Start the application
echo "🎯 Starting application..."
exec node dist/index.js
