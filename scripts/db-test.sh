#!/usr/bin/env bash
# SQL smoke test against the LOCAL Supabase stack.
# db reset -> run supabase/tests/02_smoke_test.sql -> check output -> db reset.
# Never runs 00_supabase_stub.sql (that file is for plain Postgres only).
set -uo pipefail
cd "$(dirname "$0")/.."

SUPABASE="node_modules/.bin/supabase"
PROJECT_ID=$(grep -E '^project_id' supabase/config.toml | sed -E 's/.*"(.*)".*/\1/')
CONTAINER="supabase_db_${PROJECT_ID}"

reset_db() {
  "$SUPABASE" db reset >/dev/null 2>&1 || { echo "db reset failed"; exit 1; }
}

run_psql() {
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker exec -i "$CONTAINER" psql -U postgres -d postgres
  else
    echo "Database container $CONTAINER is not running. Run pnpm db:start." >&2
    exit 1
  fi
}

echo "Resetting local database..."
reset_db
OUT=$(run_psql < supabase/tests/02_smoke_test.sql 2>&1)
echo "$OUT"

FAILED=0
expect() {
  if ! grep -qxF "$1" <<<"$OUT"; then
    echo "MISSING: $1"
    FAILED=1
  fi
}

expect "ROLES|Ahmed:bd, Sara:bd, Zain:founder"
expect "ENSURE|1"
expect "ENSURE_AGAIN|0"
expect "TZ|America/Chicago"
expect "LEAD1|clinic1.com|80|new"
expect "LEAD2|clinic2.com|30"
expect "TASKS|Add 3 dental leads|3|3|done"
expect "BD_FEED_ROWS|0"
expect "ACT1|t"
expect "STATUS_AFTER_OUTREACH|contacted|Send follow-up|t"
expect "ACT2|t"
expect "STATUS_AFTER_REPLY|replied"
expect "ACT_CHANNEL|LinkedIn"
expect "STATUS_AFTER_OPP|qualified"
expect "OPP|won|t"
expect "LEAD_STATUS_WON|customer"
expect "STAGE_EVENTS|->qualified qualified>meeting_done meeting_done>proposal_sent proposal_sent>won"
expect "LEADS_AFTER_BD_DELETE|3"
expect "SCOREBOARD_BD_ROWS|1|3|3500.00|1|1"
expect "SARA_SEES_LEADS|0"
expect "FOUNDER_SEES_LEADS|3"
expect "FEED|10"
expect "OPP_FOLLOWED|t"
expect "OWNER_EVENTS|2"
expect "SCOREBOARD_FOUNDER|Zain leads=0 out=0 rep=0 mtg=0 done=0 prop=0 won=0 mrr=0 comp=- flag=0 | Ahmed leads=3 out=1 rep=1 mtg=1 done=1 prop=1 won=3500.00 mrr=300.00 comp=47 flag=1 | Sara leads=0 out=0 rep=0 mtg=0 done=0 prop=0 won=0 mrr=0 comp=- flag=0"
expect "BY_NICHE|AI SaaS:0/0 Dental:3/3500.00 Law:0/0 Agency Partnerships:0/0"
expect "BY_CAMPAIGN_ROWS|0"
# metrics_daily in the smoke test ends at the database's UTC current_date but reads Asia/Karachi days,
# so between 19:00 and 24:00 UTC today's leads fall on "tomorrow" in Karachi and the sum is 0.
KARACHI_DAY=$(node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date()))")
if [ "$KARACHI_DAY" = "$(date -u +%F)" ]; then expect "DAILY|21|3"; else expect "DAILY|21|0"; fi
expect "PIPELINE|qualified:1/2000.00/400.00 meeting_done:0/0/0.00 proposal_sent:0/0/0.00 negotiation:0/0/0.00 won:1/3500.00/0.00 lost:0/0/0.00"
expect "MRR|300.00"
expect "Warm reply"
expect "DEACT_AT|t"
expect "DEACTIVATED_SARA_SEES|0"
expect "FIX_DONE|1"
expect "BD_SCOREBOARD_ONLY_SELF|1"
expect "BD_DAILY_ONLY_SELF|1"

ERRORS=$(grep -c '^ERROR:' <<<"$OUT")
if [ "$ERRORS" -ne 11 ]; then
  echo "Expected 11 ERROR lines (SHOULD_FAIL checks), got $ERRORS"
  FAILED=1
fi

echo "Resetting local database..."
reset_db

if [ "$FAILED" -ne 0 ]; then
  echo "db:test FAILED"
  exit 1
fi
echo "db:test passed: all checks present, 11 expected errors."
