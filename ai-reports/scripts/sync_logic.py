import requests
import pandas as pd
import os
from datetime import datetime

# === 配置 ===
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")
DATA_DIR = "public/data"

# === 增强型字段映射器 (支持多种可能的中文名) ===
FIELD_MAPS = {
    "fact_leads.csv": {
        "target_cols": ["user_id", "assigned_time", "manager_name", "status"],
        "mapping": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status", "线索阶段": "status"}
    },
    "fact_calls.csv": {
        "target_cols": ["user_id", "outbound_time", "connect_time_sec", "call_status"],
        "mapping": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec", "通话时长": "connect_time_sec", "通话状态": "call_status"}
    },
    "fact_trials.csv": {
        "target_cols": ["user_id", "trial_time", "course_name", "is_attended"],
        "mapping": {"学员ID": "user_id", "上课时间": "trial_time", "课程名称": "course_name", "是否出勤": "is_attended", "出勤状态": "is_attended"}
    },
    "fact_orders.csv": {
        "target_cols": ["order_id", "user_id", "amount", "order_time"],
        "mapping": {"订单号": "order_id", "学员ID": "user_id", "实付金额": "amount", "付款时间": "order_time"}
    }
}

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    res = requests.get(url, params={"appkey": APP_KEY, "appsecret": APP_SECRET}).json()
    return res.get("access_token")

def fetch_records(token, tid):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{tid}/records/list"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    all_rows = []
    page_token = None
    try:
        while True:
            body = {"operatorId": OPERATOR_ID, "maxResults": 500}
            if page_token: body["pageToken"] = page_token
            res = requests.post(url, headers=headers, json=body, timeout=30).json()
            data = res.get("data", res)
            records = data.get("records", data.get("value", []))
            for r in records:
                all_rows.append(r.get("fields", r) if isinstance(r, dict) else r)
            page_token = data.get("nextPageToken")
            if not page_token: break
        return pd.DataFrame(all_rows)
    except: return pd.DataFrame()

def main():
    token = get_token()
    if not token: return
    
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    sheets_res = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json()
    sheets = sheets_res.get("sheets", sheets_res.get("value", []))

    tasks = {
        "fact_leads.csv": "分配记录",
        "fact_orders.csv": "订单记录",
        "fact_trials.csv": "课程记录",
        "fact_calls.csv": "通话记录"
    }

    for filename, keyword in tasks.items():
        target_sheets = [s for s in sheets if keyword in str(s.get('name'))]
        print(f"📡 Processing {filename} (Keyword: {keyword}): {len(target_sheets)} tables found")
        
        dfs = []
        conf = FIELD_MAPS[filename]
        
        for s in target_sheets:
            df = fetch_records(token, s['id'])
            if df.empty: continue
            
            # 清理列名空格，防止因为“学员ID ”多了一个空格报错
            df.columns = [str(c).strip() for c in df.columns]
            
            # 自动映射存在的列
            existing_mapping = {k: v for k, v in conf['mapping'].items() if k in df.columns}
            if not existing_mapping:
                print(f"   ⚠️ Skipping {s['name']}: No matching columns found.")
                continue
                
            temp_df = df[list(existing_mapping.keys())].rename(columns=existing_mapping)
            dfs.append(temp_df)
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            # 补齐缺失列（如果某张表缺了一列，设为空）
            for col in conf['target_cols']:
                if col not in final_df.columns:
                    final_df[col] = ""
            
            # 只保留标准列并加时间戳
            final_df = final_df[conf['target_cols']]
            final_df['last_sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            save_path = os.path.join(DATA_DIR, filename)
            final_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} updated with {len(final_df)} rows")

if __name__ == "__main__":
    main()
