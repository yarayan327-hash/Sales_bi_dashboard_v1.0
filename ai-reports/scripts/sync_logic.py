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

# === 字段映射器 (将钉钉中文映射为看板英文) ===
FIELD_MAPS = {
    "fact_leads.csv": {
        "学员ID": "user_id",
        "分配时间": "assigned_time",
        "负责人": "manager_name",
        "线索状态": "status"
    },
    "fact_calls.csv": {
        "学员ID": "user_id",
        "外呼时间": "outbound_time",
        "通话时长(秒)": "connect_time_sec",
        "通话状态": "call_status"
    },
    "fact_trials.csv": {
        "学员ID": "user_id",
        "上课时间": "trial_time",
        "课程名称": "course_name",
        "是否出勤": "is_attended"
    },
    "fact_orders.csv": {
        "订单号": "order_id",
        "学员ID": "user_id",
        "实付金额": "amount",
        "付款时间": "order_time"
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
    
    res = requests.get(f"https://api.github.com/repos/yarayan327-hash/Sales_bi_dashboard_v1.0/contents/public/data", headers={}).json() # 占位
    
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    sheets = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json().get("sheets", [])

    tasks = {
        "fact_leads.csv": "分配记录",
        "fact_orders.csv": "订单记录",
        "fact_trials.csv": "课程记录",
        "fact_calls.csv": "通话记录"
    }

    for filename, keyword in tasks.items():
        target_ids = [s['id'] for s in sheets if keyword in str(s.get('name'))]
        dfs = []
        for tid in target_ids:
            df = fetch_records(token, tid)
            if not df.empty: dfs.append(df)
        
        if dfs:
            raw_df = pd.concat(dfs, ignore_index=True, sort=False)
            
            # 1. 自动重命名列 (映射中文到英文)
            mapper = FIELD_MAPS.get(filename, {})
            # 只保留映射表中存在的列，并重命名
            final_df = raw_df[list(mapper.keys())].rename(columns=mapper)
            
            # 2. 强制添加同步时间戳 (确保 Git 推送)
            final_df['last_sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # 3. 落地保存
            save_path = os.path.join(DATA_DIR, filename)
            final_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 映射完成，写入 {len(final_df)} 行")

if __name__ == "__main__":
    main()
