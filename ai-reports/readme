cat << 'EOF' > /home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/README.md
# 📊 销售 BI 数据自动化同步系统 (Sales_bi_dashboard_v1.0)

本项目用于自动抓取钉钉多维表格数据，并生成 BI 看板所需的结构化数据。

## 📡 数据同步核心指南 (Notable 协议)

### 1. 抓取路径 (关键)
针对本项目的多维表，常规 `bitable` API 会报 `InvalidVersion` 错误。必须使用 **Notable (知识库表格)** 路径：
- **Sheet 列表**: `https://api.dingtalk.com/v1.0/notable/bases/{base_id}/sheets`
- **数据列表**: `https://api.dingtalk.com/v1.0/notable/bases/{base_id}/sheets/{sheet_id}/records/list`

### 2. 身份认证
- **机器人应用**: `ding9spfsdj89ke2cwjy`
- **穿透标识**: 必须在 Header 中携带 `x-acs-dingtalk-impersonate-id` (使用管理员 `UnionID`)。
- **手动授权**: 必须在钉钉多维表「高级权限」中添加机器人为管理者。

## 📂 项目结构
- `ai-reports/scripts/sync_and_align_v3.py`: 核心同步脚本。
- `public/data/`: 存放同步后的 `fact_leads.csv`, `fact_orders.csv`, `fact_trials.csv` 等。

## 🚀 快速运维
若需手动同步数据：
\`\`\`bash
python3 ai-reports/scripts/sync_and_align_v3.py
\`\`\`
EOF
