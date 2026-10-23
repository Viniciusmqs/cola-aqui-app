#!/usr/bin/env bash
# Recria um banco local com as migrações reais + demo e roda os testes SQL.
# Uso: PGHOST=/tmp/pg PGPORT=5433 supabase/tests/local/run.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists cola_test" -c "create database cola_test" >/dev/null
run() { sed 's/create extension if not exists pg_cron;//' "$1" | $P -d cola_test 2>&1 | grep -vE "^(NOTICE| unschedule| schedule|-+|\(.*rows?\)| +[0-9]+|)$" || true; }
run supabase/tests/local/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/seed.sql
run supabase/demo.sql
for t in supabase/tests/*.sql; do echo "== $t"; $P -d cola_test -f "$t" 2>&1 | grep -vE "^NOTICE" || true; done
