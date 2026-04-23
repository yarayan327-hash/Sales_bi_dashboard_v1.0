#!/usr/bin/env bash
set -Eeuo pipefail

# =========================
# Sales Engine Unified Runner
# =========================

REPO_ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
AI_REPORTS_DIR="$REPO_ROOT/ai-reports"
DATA_DIR="$REPO_ROOT/public/data"
LATEST_DIR="$AI_REPORTS_DIR/output/latest"

BRANCH="main"

# 可选参数：daily / weekly / monthly / all
MODE="${1:-all}"
# 可选参数：指定报告日期
REPORT_DATE="${2:-}"

echo "========================================"
echo "🦞 Sales Engine Unified Runner Started"
echo "Mode : $MODE"
echo "Report Date: ${REPORT_DATE:-'(default)'}"
echo "Repo Root : $REPO_ROOT"
echo "========================================"

fail() {
 echo ""
 echo "❌ ERROR: $1"
 exit 1
}

run_cmd() {
 echo ""
 echo "▶ $*"
 "$@"
}

require_file() {
 local f="$1"
 [[ -f "$f" ]] || fail "Required file not found: $f"
}

git_sync() {
 echo ""
 echo "=== Step 1: Sync GitHub latest main ==="
 cd "$REPO_ROOT"

 run_cmd git fetch origin "$BRANCH"
 run_cmd git checkout "$BRANCH"
 run_cmd git reset --hard "origin/$BRANCH"

 echo ""
 echo "Latest commit:"
 run_cmd git log -1 --oneline
}

check_csvs() {
 echo ""
 echo "=== Step 2: Check required CSV files ==="
 require_file "$DATA_DIR/fact_leads.csv"
 require_file "$DATA_DIR/fact_trials.csv"
 require_file "$DATA_DIR/fact_orders.csv"
 require_file "$DATA_DIR/dim_agents.csv"
 require_file "$DATA_DIR/dim_targets.csv"
 echo "✅ Required CSV files exist"
}

npm_prepare() {
 echo ""
 echo "=== Step 3: Prepare npm dependencies ==="
 cd "$AI_REPORTS_DIR"
 require_file "$AI_REPORTS_DIR/package.json"
 run_cmd npm install
}

run_daily() {
 echo ""
 echo "=== Step 4A: Generate Daily Reports ==="
 cd "$AI_REPORTS_DIR"
 if [[ -n "$REPORT_DATE" ]]; then
  run_cmd npm run generate:report -- "$REPORT_DATE"
 else
  run_cmd npm run generate:report
 fi
 run_cmd npm run generate:daily-text -- "$REPORT_DATE"
 run_cmd npm run generate:action -- "$REPORT_DATE"
}

run_weekly() {
 echo ""
 echo "=== Step 4B: Generate Weekly Report ==="
 cd "$AI_REPORTS_DIR"
 if [[ -n "$REPORT_DATE" ]]; then
  run_cmd npm run generate:weekly -- "$REPORT_DATE"
 else
  run_cmd npm run generate:weekly
 fi
}

run_monthly() {
 echo ""
 echo "=== Step 4C: Generate Monthly Report ==="
 cd "$AI_REPORTS_DIR"
 if [[ -n "$REPORT_DATE" ]]; then
  run_cmd npm run generate:monthly -- "$REPORT_DATE"
 else
  run_cmd npm run generate:monthly
 fi
}

run_validate() {
 echo ""
 echo "=== Step 5: Validate latest outputs ==="
 cd "$AI_REPORTS_DIR"
 run_cmd npm run validate:latest -- "$REPORT_DATE"
}

check_outputs() {
 echo ""
 echo "=== Step 6: Check output/latest ==="
 mkdir -p "$LATEST_DIR"

 echo ""
 echo "Files in output/latest:"
 find "$LATEST_DIR" -maxdepth 1 -type f -name "*.json" -o -name "*.txt" | sort

 echo ""
 echo "Key files preview:"

 [[ -f "$LATEST_DIR/monthly_report.txt" ]] && {
  echo "--- monthly_report.txt (first 30 lines) ---"
  head -n 30 "$LATEST_DIR/monthly_report.txt"
 }

 [[ -f "$LATEST_DIR/monthly_payload.json" ]] && {
  echo ""
  echo "--- monthly_payload.json (summary) ---"
  cat "$LATEST_DIR/monthly_payload.json" | jq '{orders: .overall.orders, gmv: .overall.gmv}'
 }
}

main() {
 git_sync
 check_csvs
 npm_prepare

 case "$MODE" in
  daily)
   run_daily
   ;;
  weekly)
   run_weekly
   ;;
  monthly)
   run_monthly
   ;;
  all)
   run_daily
   run_weekly
   run_monthly
   ;;
  *)
   fail "Unsupported mode: $MODE (use daily / weekly / monthly / all)"
   ;;
 esac

 run_validate
 check_outputs

 echo ""
 echo "========================================"
 echo "✅ Sales Engine Unified Runner Completed"
 echo "Mode : $MODE"
 echo "Report Date: ${REPORT_DATE:-'(default)'}"
 echo "========================================"
}

main "$@"
