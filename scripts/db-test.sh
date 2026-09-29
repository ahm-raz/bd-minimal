#!/usr/bin/env bash
# SQL tests against the LOCAL Supabase stack.
# db reset -> 02_smoke_test.sql -> check; db reset -> 03 -> check; db reset -> 04 -> check; db reset.
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

# ---------- 03: social media module (docs/09 section 7) ----------
echo "Resetting local database for the social test..."
reset_db
OUT=$(run_psql < supabase/tests/03_social_test.sql 2>&1)
echo "$OUT"

expect "ROLES|Ahmed:bd, Hina:social, Zain:founder"
expect "PILLARS|6"
expect "HINA_ROLE|social"
expect "HINA_SEES_LEADS|0"
expect "HINA_SEES_OPPS|0"
expect "HINA_SEES_ACCOUNTS|1"
expect "SLOTS_NOV|2"
expect "SLOTS_NOV_AGAIN|0"
# 9:00 AM New York: EDT (UTC-4) before 1 Nov 2026, EST (UTC-5) after; back to EDT on 14 Mar 2027.
expect "DST_NOV|2026-10-31 13:00 2026-11-02 14:00"
expect "SLOT_TITLE|BlueBugs LinkedIn page post, Open topic|planned|t|2026-10-30 13:00"
expect "SLOTS_MAR_BY_HINA|2"
expect "DST_MAR|2027-03-13 14:00 2027-03-15 13:00"
expect "HINA_SEES_SCHEDULES|1"
expect "BD_SEES_POSTS|0"
expect "P1|planned|America/New_York|t"
expect "REQUEST_CHANGES|changes_requested|1"
expect "EDIT_AFTER_APPROVAL|in_review|1"
expect "TASK_BEFORE|open"
expect "P1_POSTED|posted|t"
expect "TASK_AFTER|done|1"
expect "HISTORY|->planned planned>drafting drafting>in_review in_review>changes_requested changes_requested>in_review in_review>approved approved>in_review in_review>approved approved>posted"
expect "HINA_FEED_ROWS|0"
# M11 added post_assigned (the founder gave P1 to Hina) and post_comment (a plain comment).
expect "FEED_P1|changes_requested:1 post_approved:2 post_assigned:1 post_comment:1 post_published:1 post_submitted:3"
expect "FEED_TEXT|submitted 'How AI intake cuts missed calls' for review"
expect "TASK_FEED|1"
expect "MARK1|1"
expect "MARK2|0"
expect "P2|missed"
expect "MISSED_FEED|1"
expect "P2_LATE|posted"
expect "IDEA_SCHEDULED|planned|t"
expect "SOCIAL|2|2|1|1|0|0.5000|1|t"
expect "SOCIAL_BY_ACCOUNT|BlueBugs LinkedIn page|2|2"
expect "SCOREBOARD_NAMES|Ahmed,Zain"
expect "DAILY_NO_SMM|0"
expect "HINA_SOCIAL_ROWS|1"
expect "BD_SOCIAL_ROWS|0"
expect "STOPPED|cancelled|4"
# posted per day, by the UTC day the posts went out (both today, unless the test straddles midnight UTC)
expect "SOCIAL_DAILY_POSTED|2"

SOCIAL_ERRORS=$(grep -c '^ERROR:' <<<"$OUT")
if [ "$SOCIAL_ERRORS" -ne 18 ]; then
  echo "Expected 18 ERROR lines in the social test (SHOULD_FAIL checks), got $SOCIAL_ERRORS"
  FAILED=1
fi

# ---------- 04: meetings, notifications, Google connections (docs/10 section 5) ----------
echo "Resetting local database for the meetings and notifications test..."
reset_db
OUT=$(run_psql < supabase/tests/04_meetings_notifications_test.sql 2>&1)
echo "$OUT"

expect "BOOK|t"
expect "MEETING|Meeting with Sarah Mitchell (Smile Dental)|scheduled|off|t|{30,10}"
expect "NEXT|Meeting with Sarah Mitchell|t"
expect "ACT|1"
expect "AHMED_OWN_NOTIFS|0"
expect "SARA_SEES|0"
expect "HINA_SEES|0"
expect "FOUNDER_KINDS|meeting_booked,meeting_rescheduled"
expect "UNDO|scheduled|t"
expect "FOUNDER_KINDS_2|meeting_booked,meeting_rescheduled"
expect "AHMED_KINDS|meeting_cancelled,task_assigned"
expect "AHMED_TITLE|Zain cancelled the meeting with Smile Dental: Clinic closed that day"
expect "AHMED_UNREAD|0"
expect "VISIBLE_TO_AHMED|2"
expect "DEDUPE|0"
expect "SAVE_CONN|1"
expect "CONN|ahmed@gmail.com|active"
expect "MY_TOKEN|v1:iv:tag:ct"
expect "PENDING_AFTER_CONNECT|pending"
expect "TEAM_STATUS_BD|0"
expect "SARA_TOKEN|0"
expect "SARA_CONN|0"
expect "TEAM_STATUS|1"
expect "MEETING_OWNER|t|t"
expect "CLEANUP|t|evt1"
expect "REASSIGN_TO|Ahmed,Sara"
expect "SARA_MUTED_TASKS|0"
expect "TITLE_REASSIGN|Zain reassigned lead Smile Dental"
expect "HINA_KINDS|post_assigned,post_comment"
expect "HINA_LINK|/content?post=60000000-0000-0000-0000-000000000001"
expect "PRUNE|0"

M11_ERRORS=$(grep -c '^ERROR:' <<<"$OUT")
if [ "$M11_ERRORS" -ne 8 ]; then
  echo "Expected 8 ERROR lines in the meetings and notifications test (SHOULD_FAIL checks), got $M11_ERRORS"
  FAILED=1
fi

echo "Resetting local database..."
reset_db

if [ "$FAILED" -ne 0 ]; then
  echo "db:test FAILED"
  exit 1
fi
echo "db:test passed: all checks present, 11 + 18 + 8 expected errors."
