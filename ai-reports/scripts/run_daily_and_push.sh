#!/usr/bin/env bash
set -euo pipefail

git config --global user.name "Sales-AI-Bot" || true
git config --global user.email "sales-ai@automation.local" || true

REPO_ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
AI_REPORTS_DIR="$REPO_ROOT/ai-reports"
LOG_DIR="$AI_REPORTS_DIR/logs"

mkdir -p "$LOG_DIR"

export TZ="Asia/Riyadh"

REPORT_DATE="$(date -d 'yesterday' +%F)"
LOG_FILE="$LOG_DIR/daily_${REPORT_DATE}.log"

{
  echo "========================================"
  echo "🚀 Daily automation started"
  echo "Run time   : $(date '+%F %T %Z')"
  echo "Report date: $REPORT_DATE"
  echo "========================================"

  cd "$AI_REPORTS_DIR"

  # 1. 生成日报
  bash scripts/run_sales_engine.sh daily "$REPORT_DATE"

  # 2. 回到仓库根目录
  cd "$REPO_ROOT"

  # 3. 提交日报输出
  git add \
    ai-reports/output/latest/action_payload.json \
    ai-reports/output/latest/daily_metrics.json \
    ai-reports/output/latest/daily_report.txt \
    ai-reports/output/latest/daily_report_cn.txt \
    ai-reports/output/latest/daily_report_en.txt \
    ai-reports/output/latest/group_mentions.json \
    ai-reports/output/latest/mtd_gap.json \
    ai-reports/output/latest/postclass_unfollowed.json \
    ai-reports/output/latest/preclass_unfollowed.json \
    ai-reports/output/latest/report_payload.json \
    ai-reports/output/latest/sales_followup.json \
    ai-reports/output/latest/sales_todo.json \
    ai-reports/output/latest/team_pk.json \
    ai-reports/output/latest/unreached_leads.json \
    ai-reports/output/latest/validation_result.json \
    ai-reports/output/action_payload_"$REPORT_DATE".json \
    ai-reports/output/daily_metrics_"$REPORT_DATE".json \
    ai-reports/output/group_mentions_"$REPORT_DATE".json \
    ai-reports/output/mtd_gap_"$REPORT_DATE".json \
    ai-reports/output/postclass_unfollowed_"$REPORT_DATE".json \
    ai-reports/output/preclass_unfollowed_"$REPORT_DATE".json \
    ai-reports/output/report_payload_"$REPORT_DATE".json \
    ai-reports/output/sales_followup_"$REPORT_DATE".json \
    ai-reports/output/sales_todo_"$REPORT_DATE".json \
    ai-reports/output/team_pk_"$REPORT_DATE".json \
    ai-reports/output/unreached_leads_"$REPORT_DATE".json \
    2>/dev/null || true

  # 4. 如果有变化就 commit + push
  if git diff --cached --quiet; then
    echo "No output changes to commit."
  else
    git commit -m "Auto daily report update: $REPORT_DATE"
    git push origin main
    python3 /home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/scripts/dingtalk_push.py
    echo "✅ Daily output pushed to GitHub"
  fi

  echo "========================================"
  echo "✅ Daily automation completed"
  echo "========================================"

} >> "$LOG_FILE" 2>&1
