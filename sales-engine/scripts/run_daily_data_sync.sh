#!/usr/bin/env bash
set -uo pipefail

ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
cd "$ROOT"

mkdir -p sales-engine/logs public/data

LOG="sales-engine/logs/daily_data_sync_$(date +%F).log"

{
  echo "========== DAILY DATA SYNC START =========="
  date
  echo "ROOT=$ROOT"

  if [ -f sales-engine/.env.runtime ]; then
    set -a
    source sales-engine/.env.runtime
    set +a
  fi

  TODAY_KSA=$(TZ=Asia/Riyadh date +%F)
  START_TRIAL=$(TZ=Asia/Riyadh date -d "$TODAY_KSA -3 days" +%F)
  END_TRIAL=$(TZ=Asia/Riyadh date -d "$TODAY_KSA +3 days" +%F)

  echo "===== 1. Sync ACAdmin trials: $START_TRIAL to $END_TRIAL ====="
  TRIAL_START_DATE="$START_TRIAL" \
  TRIAL_END_DATE="$END_TRIAL" \
  HEADLESS=1 \
  node sales-engine/scripts/21_scrape_trials_acadmin.cjs
  TRIAL_EXIT=$?
  echo "TRIAL_EXIT=$TRIAL_EXIT"

  echo "===== 2. Merge manual orders ====="
  python3 sales-engine/scripts/25_merge_manual_orders.py
  ORDER_EXIT=$?
  echo "ORDER_EXIT=$ORDER_EXIT"

  echo "===== 3. CRM orders direct sync placeholder ====="
  if [ -f sales-engine/scripts/22_scrape_orders_crm.cjs ]; then
    HEADLESS=1 node sales-engine/scripts/22_scrape_orders_crm.cjs
    CRM_ORDER_EXIT=$?
  else
    echo "WARNING: sales-engine/scripts/22_scrape_orders_crm.cjs not ready"
    CRM_ORDER_EXIT=2
  fi
  echo "CRM_ORDER_EXIT=$CRM_ORDER_EXIT"

  echo "===== 4. CRM calls direct sync placeholder ====="
  if [ -f sales-engine/scripts/23_scrape_calls_crm.cjs ]; then
    HEADLESS=1 node sales-engine/scripts/23_scrape_calls_crm.cjs
    CRM_CALL_EXIT=$?
  else
    echo "WARNING: sales-engine/scripts/23_scrape_calls_crm.cjs not ready"
    CRM_CALL_EXIT=2
  fi
  echo "CRM_CALL_EXIT=$CRM_CALL_EXIT"

  echo "===== 5. CRM lead source direct sync placeholder ====="
  if [ -f sales-engine/scripts/24_scrape_lead_source_crm.cjs ]; then
    HEADLESS=1 node sales-engine/scripts/24_scrape_lead_source_crm.cjs
    CRM_LEAD_SOURCE_EXIT=$?
  else
    echo "WARNING: sales-engine/scripts/24_scrape_lead_source_crm.cjs not ready"
    CRM_LEAD_SOURCE_EXIT=2
  fi
  echo "CRM_LEAD_SOURCE_EXIT=$CRM_LEAD_SOURCE_EXIT"

  echo "===== 6. Generate daily metrics ====="
  cd "$ROOT/ai-reports"
  npx tsx scripts/generateDailyMetrics.ts "$TODAY_KSA"
  METRICS_EXIT=$?
  echo "METRICS_EXIT=$METRICS_EXIT"

  echo "===== 7. Generate lead lifecycle ====="
  npx tsx scripts/buildLeadLifecycle.ts
  LIFECYCLE_EXIT=$?
  echo "LIFECYCLE_EXIT=$LIFECYCLE_EXIT"

  echo "===== 8. Generate daily report text ====="
  npx tsx scripts/generateDailyReportText.ts "$TODAY_KSA"
  REPORT_EXIT=$?
  echo "REPORT_EXIT=$REPORT_EXIT"

  cd "$ROOT"

  echo "===== 9. Validate freshness ====="
  python3 sales-engine/scripts/26_validate_data_freshness.py
  VALIDATE_EXIT=$?
  echo "VALIDATE_EXIT=$VALIDATE_EXIT"

  echo "===== 10. Notify result ====="
  python3 sales-engine/scripts/27_notify_data_sync.py || true

  echo "===== 11. Commit and push ====="
  git add \
    public/data/fact_trials.csv \
    public/data/fact_orders.csv \
    public/data/manual_orders.csv \
    public/data/data_sync_health.json \
    public/data/lead_lifecycle_latest.csv \
    sales-engine/data/input/trials_acadmin_latest.csv \
    ai-reports/output/latest || true

  git commit -m "chore: daily data sync ${TODAY_KSA}" || true
  git push origin main || true

  echo "========== DAILY DATA SYNC DONE =========="
  date
} 2>&1 | tee -a "$LOG"

python3 sales-engine/scripts/26_build_lead_funnel.py
