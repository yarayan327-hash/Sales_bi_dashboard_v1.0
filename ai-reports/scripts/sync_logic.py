import requests
import pandas as pd
import json
import sys
import re
import os
from datetime import datetime, timedelta

APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID") 
OUTPUT_DIR = "public/data"

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    res = requests.get(url, params={"appkey": APP_KEY, "appsecret": APP_SECRET}).json()
    return res.get("access_token")

def list_records(token, sid):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{sid}/records/list"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    all_rows = []
    page_token = None
    while True:
        res = requests.post(url, headers=headers, json={"operatorId": OPERATOR_ID, "maxResults": 500, "pageToken": page_token}).json()
        data = res.get("data", res)
        records = data.get("records", data.get("value", []))
        for r in records:
            all_rows.append(r.get("fields", r))
        page_token = data.get("nextPageToken")
        if not page_token: break
    return pd.DataFrame(all_rows)

def main():
    token = get_token()
    # 获取子表清单
    sheets = requests.get(f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets", 
                          headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json().get("sheets", [])

    mapping = {"分配记录": "fact_leads.csv", "课程记录": "fact_trials.csv", "通话记录": "fact_calls.csv", "订单记录": "fact_orders.csv"}
    
    for keyword, filename in mapping.items():
        targets = [s for s in sheets if keyword in s.get('name', '')]
        if not targets: continue
        
        dfs = []
        for s in targets:
            df = list_records(token, s['id'])
            if not df.empty: dfs.append(df)
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True)
            # --- 关键修复：确保列名对齐，不要让旧的测试列干扰 ---
            if filename == "fact_leads.csv":
                # 强制映射中文到英文，如果没抓到，这里就会报错，我们要的就是报错，而不是默认给两行假数
                final_df = final_df.rename(columns={"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"})
                final_df = final_df[["user_id", "assigned_time", "manager_name", "status"]]
            
            save_path = os.path.join(OUTPUT_DIR, filename)
            final_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 真正写入了 {len(final_df)} 行")

    # 写一个戳，证明这是新跑的
    with open(f"{OUTPUT_DIR}/last_sync.txt", "w") as f:
        f.write(str(datetime.now()))

if __name__ == "__main__":
    main()
