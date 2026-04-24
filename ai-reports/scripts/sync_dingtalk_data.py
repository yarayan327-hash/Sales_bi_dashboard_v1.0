import requests
import pandas as pd
import os
import re
from datetime import datetime, timedelta

# === 配置区 ===
APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
OUTPUT_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"
# 初次运行建议设置回溯 30-60 天以补全历史
LOOKBACK_DAYS = 60 

def get_token():
    url = f"https://oapi.dingtalk.com/gettoken?appkey={APP_KEY}&appsecret={APP_SECRET}"
    return requests.get(url).json().get("access_token")

def clean_amount(val):
    if pd.isna(val): return 0.0
    s = str(val).replace(',', '').replace('SAR', '').strip()
    res = re.search(r"(\d+\.?\d*)", s)
    return float(res.group(1)) if res else 0.0

def format_dt(val):
    if pd.isna(val) or str(val).strip() == "": return ""
    try: return pd.to_datetime(val).strftime('%Y-%m-%d %H:%M:%S')
    except: return str(val)

def sync_leads(token):
    path = os.path.join(OUTPUT_DIR, "fact_leads.csv")
    # 1. 加载历史数据用于对比改派
    old_df = pd.read_csv(path) if os.path.exists(path) else pd.DataFrame()
    
    # 2. 模拟抓取新数据 (此处对接你现有的钉钉 API 抓取逻辑)
    # new_data = fetch_from_dingtalk(token, days=LOOKBACK_DAYS) 
    # 暂用占位符，实际运行时请确保 fetch 逻辑正常
    new_df = pd.DataFrame() # 假设这是抓回来的新 DataFrame

    if not new_df.empty:
        # 核心：改派标注逻辑
        def mark_reassignment(row):
            if old_df.empty: return "New"
            prev = old_df[old_df['user_id'] == row['user_id']]
            if prev.empty: return "New"
            last_sales = prev.iloc[-1]['sales_id']
            if str(last_sales) != str(row['sales_id']):
                # 如果原销售 ID 像公海（比如 ID 为 0 或特定值），标注为公海捞取
                return "CC Transfer" if last_sales and last_sales != 0 else "Public Sea"
            return "Stable"

        new_df['reassignment_type'] = new_df.apply(mark_reassignment, axis=1)
        
        # 合并并去重
        final_df = pd.concat([old_df, new_df]).drop_duplicates(subset=['user_id', 'assigned_time'], keep='last')
        final_df.to_csv(path, index=False, encoding='utf-8-sig')
        print("✅ 线索表更新并完成改派标注")

def sync_trials(token):
    # 体验课逻辑：按 ID 去重，保留最新状态 (on -> end)
    path = os.path.join(OUTPUT_DIR, "fact_trials.csv")
    old_df = pd.read_csv(path) if os.path.exists(path) else pd.DataFrame()
    
    # 抓取逻辑...
    new_df = pd.DataFrame() 
    
    final_df = pd.concat([old_df, new_df]).drop_duplicates(subset=['id'], keep='last')
    final_df.to_csv(path, index=False, encoding='utf-8-sig')
    print("✅ 体验课状态已同步更新")

# ... 订单和通话记录逻辑同理，按 order_id / (user_id+time) 去重
