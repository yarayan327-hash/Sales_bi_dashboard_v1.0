#!/bin/bash
PROJECT_DIR="/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0"
cd $PROJECT_DIR

echo "1. --- 执行 Python 同步 ---"
python3 ai-reports/scripts/sync_and_align_v3.py

echo "2. --- 准备 Git 推送 ---"
# 强制添加 CSV 文件
git add public/data/*.csv

# 检查是否有文件改动
if git diff --cached --quiet; then
    echo "🤷 数据无变化，无需推送。"
else
    echo "🔄 检测到数据更新，正在提交..."
    git commit -m "data: 自动拉齐钉钉数据 $(date '+%Y-%m-%d %H:%M:%S')"
    
    # 尝试推送
    git push origin main
    if [ $? -eq 0 ]; then
        echo "✅ GitHub 同步成功！"
    else
        echo "❌ 推送失败！可能是权限问题（Private 仓库需要配置 SSH 或 PAT）。"
    fi
fi
