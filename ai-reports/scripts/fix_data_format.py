import pandas as pd
import os
import re

DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

def clean_value(val):
    if pd.isna(val): return val
    s_val = str(val)
    # 匹配类似 3150.00(SAR) 中的数字部分
    if "(" in s_val and ")" in s_val:
        match = re.search(r"(\d+\.?\d*)", s_val)
        if match:
            return match.group(1)
    return val

def fix():
    # 修复所有 CSV
    for filename in ["fact_orders.csv", "fact_calls.csv", "fact_leads.csv", "fact_trials.csv"]:
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path): continue
        
        df = pd.read_csv(path)
        
        # 1. 修正通用列名映射
        rename_map = {
            'sales_name_raw': 'sales_name',
            '学员ID': 'user_id',
            '订单金额': 'paid_amount'
        }
        df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)
        
        # 2. 全局清洗所有带 (XXX) 的单元格
        for col in df.columns:
            df[col] = df[col].apply(clean_value)
            
        # 3. 针对通话状态的特殊修复
        if 'call_status' in df.columns:
            df['call_status'] = df['call_status'].replace({'双方接通': 'connected', '客户未接听': 'no_answer'})
            
        df.to_csv(path, index=False)
        print(f"✅ {filename} fixed.")

if __name__ == "__main__":
    fix()
