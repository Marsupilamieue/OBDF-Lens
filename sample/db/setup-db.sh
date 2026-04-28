#!/bin/bash
# ============================================================
# Setup database bansos untuk OBDF Lens manual testing
# Usage: ./setup-db.sh [user] [host] [port]
#   Default: user=postgres, host=localhost, port=5432
# ============================================================

DB_USER=${1:-postgres}
DB_HOST=${2:-localhost}
DB_PORT=${3:-5432}
DB_NAME="bansos"

echo "🔧 Setting up database '$DB_NAME' on $DB_HOST:$DB_PORT as user '$DB_USER'..."

# Buat database kalau belum ada
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;"

# Jalankan schema + dummy data
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname "$0")/setup.sql"

echo ""
echo "✅ Done! Database '$DB_NAME' siap."
echo ""
echo "📋 Tambahkan setting berikut ke VSCode (settings.json):"
echo ""
echo '  "obdf-lens.connections": {'
echo "    \"bansos_db\": {"
echo "      \"host\": \"$DB_HOST\","
echo "      \"port\": $DB_PORT,"
echo "      \"database\": \"$DB_NAME\","
echo "      \"user\": \"$DB_USER\","
echo "      \"password\": \"YOUR_PASSWORD\""
echo "    }"
echo "  }"
