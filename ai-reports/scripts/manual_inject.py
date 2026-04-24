import pandas as pd
import os

DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

# 模拟 2026-04-24 的真实数据结构
fake_leads = [
    {"user_id": "9999001", "assigned_time": "2026-04-24 10:00:00", "manager_name": "人工注入测试", "status": "待跟进"},
    {"user_id": "9999002", "assigned_time": "2026-04-24 11:30:00", "manager_name": "人工注入测试", "status": "已成交"}
]

df = pd.DataFrame(fake_leads)
path = os.path.join(DATA_DIR, "fact_leads.csv")
df.to_csv(path, index=False, encoding='utf-8-sig')
print(f"💉 测试数据已手动注入: {path}")
