#!/usr/bin/env bash
set -e

REPO_ROOT="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
AI_REPORTS_DIR="$REPO_ROOT/ai-reports"

echo "=== Step 1: sync repo ==="
cd "$REPO_ROOT"
git fetch origin main
git reset --hard origin/main

echo "=== Step 2: show latest order rows ==="
tail -n 5 "$REPO_ROOT/public/data/fact_orders.csv" || true

echo "=== Step 3: install deps if needed ==="
cd "$AI_REPORTS_DIR"
npm install

echo "=== Step 4: generate reports ==="
npm run generate:report
npm run generate:daily-text
npm run generate:action
npm run generate:weekly
npm run validate:latest

echo "=== Step 5: done ==="
echo "Latest outputs:"
find output/latest -maxdepth 1 -type f | sort
