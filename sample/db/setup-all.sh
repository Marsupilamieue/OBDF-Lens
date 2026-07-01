#!/bin/bash
# ============================================================
# OBDF Lens - Setup Semua Database (Multi-Source)
# Menjalankan setup untuk 4 database sekaligus:
#   1. bansos      — data program bantuan sosial
#   2. dukcapil    — data kependudukan Dukcapil
#   3. dtks        — Data Terpadu Kesejahteraan Sosial
#   4. bpjs_kes    — data BPJS Kesehatan
# ============================================================

PG_USER=${1:-postgres}
PG_HOST=${2:-localhost}
PG_PORT=${3:-5432}

DIR="$(dirname "$0")"

# Warna output
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

create_db_if_not_exists() {
  local dbname=$1
  echo -e "${YELLOW}→ Cek/buat database '$dbname'...${NC}"
  psql -h $PG_HOST -p $PG_PORT -U $PG_USER -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$dbname'" | grep -q 1 || \
    psql -h $PG_HOST -p $PG_PORT -U $PG_USER -c "CREATE DATABASE $dbname;"
}

run_sql() {
  local dbname=$1
  local sqlfile=$2
  echo -e "${YELLOW}→ Menjalankan $sqlfile ke database '$dbname'...${NC}"
  psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $dbname -f "$sqlfile"
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $dbname — selesai${NC}"
  else
    echo -e "${RED}✗ $dbname — gagal! Periksa output di atas.${NC}"
    exit 1
  fi
}

echo ""
echo "============================================================"
echo " OBDF Lens — Setup Multi-Database"
echo " Host: $PG_HOST:$PG_PORT  |  User: $PG_USER"
echo "============================================================"
echo ""

# 1. bansos
create_db_if_not_exists "bansos"
run_sql "bansos" "$DIR/setup.sql"

# 2. dukcapil
create_db_if_not_exists "dukcapil"
run_sql "dukcapil" "$DIR/setup-dukcapil.sql"

# 3. dtks
create_db_if_not_exists "dtks"
run_sql "dtks" "$DIR/setup-dtks.sql"

# 4. bpjs_kes
create_db_if_not_exists "bpjs_kes"
run_sql "bpjs_kes" "$DIR/setup-bpjs.sql"

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} Semua database berhasil dibuat!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Tambahkan setting berikut ke VSCode (settings.json):"
echo ""
cat << EOF
  "obdf-lens.connections": {
    "bansos_db": {
      "host": "$PG_HOST",
      "port": $PG_PORT,
      "database": "bansos",
      "user": "$PG_USER",
      "password": "YOUR_PASSWORD"
    },
    "dukcapil_db": {
      "host": "$PG_HOST",
      "port": $PG_PORT,
      "database": "dukcapil",
      "user": "$PG_USER",
      "password": "YOUR_PASSWORD"
    },
    "dtks_db": {
      "host": "$PG_HOST",
      "port": $PG_PORT,
      "database": "dtks",
      "user": "$PG_USER",
      "password": "YOUR_PASSWORD"
    },
    "bpjs_db": {
      "host": "$PG_HOST",
      "port": $PG_PORT,
      "database": "bpjs_kes",
      "user": "$PG_USER",
      "password": "YOUR_PASSWORD"
    }
  }
EOF
echo ""
