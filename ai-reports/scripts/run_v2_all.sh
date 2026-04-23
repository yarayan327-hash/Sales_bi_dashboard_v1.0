#!/usr/bin/env bash
set -e

REPO_ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
AI_REPORTS_DIR="$REPO_ROOT/ai-reports"

echo "=== 1. 强力同步钉钉表格数据 ==="
python3 "$AI_REPORTS_DIR/scripts/sync_dingtalk_data.py"

echo "=== 2. 检查数据文件大小 (防止为0) ==="
ls -lh "$REPO_ROOT/public/data/fact_orders.csv"

echo "=== 3. 运行 AI 引擎生成报告 ==="
cd "$AI_REPORTS_DIR"
# 注意：这里我们不运行 git reset，保护本地新抓的数据
npm run generate:report
npm run generate:daily-text

echo "=== 4. 触发钉钉 3.0 推送 ==="
python3 "$AI_REPORTS_DIR/scripts/dingtalk_push.py"

echo "=== 5. 最后同步到 GitHub 备份 ==="
cd "$REPO_ROOT"
git add .
git commit -m "Complete Update $(date +%F)" || true
git push origin main || true
