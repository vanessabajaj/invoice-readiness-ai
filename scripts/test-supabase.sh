#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_root"

cleanup() {
  npx --yes supabase@latest stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

npx --yes supabase@latest start \
  --exclude edge-runtime,imgproxy,logflare,mailpit,realtime,storage-api,studio,vector
npx --yes supabase@latest db reset
docker exec -i supabase_db_invoice-readiness-ai \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/tests/rls.sql
