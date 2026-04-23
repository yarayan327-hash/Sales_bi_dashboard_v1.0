#!/usr/bin/env bash
set -e

REPO_ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
AI_REPORTS_DIR="$REPO_ROOT/ai-reports"

echo "=== 1. 抓取钉钉原始数据 ==="
python3 "$AI_REPORTS_DIR/scripts/sync_dingtalk_data.py"

echo "=== 2. 数据清洗 (兼容看板) ==="
python3 "$AI_REPORTS_DIR/scripts/fix_data_format.py"

echo "=== 3. 提交并强制推送 GitHub ==="
cd "$REPO_ROOT"
git config user.name "Sales-BI-Bot"
git config user.email "bot@sales-bi.local"
# 使用 git add . 确保包含所有修改过的 CSV 和新脚本
git add .
git commit -m "Fix: Data Format & Sync $(date +%F)" || echo "No changes"
git push origin main

echo "=== 4. 生成 AI 日报 ==="
cd "$AI_REPORTS_DIR"
npm run generate:report
npm run generate:daily-text

echo "=== 5. 推送钉钉消息 ==="
python3 "$AI_REPORTS_DIR/scripts/dingtalk_push.py"

echo "✅ 3.0 全链路修复版执行完毕！"
