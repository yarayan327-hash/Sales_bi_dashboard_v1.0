import requests
import pandas as pd
import os
from datetime import datetime

# === 配置 (GitHub Secrets) ===
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")
DATA_DIR = "public/data"

# === 字段映射表 (钉钉中文 -> 看板英文) ===
FIELD_MAPS = {
    "fact_leads.csv": {
        "target_cols": ["user_id", "assigned_time", "manager_name", "status"],
        "mapping": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"}
    },
    "fact_calls.csv": {
        "target_cols": ["user_id", "outbound_time", "connect_time_sec", "call_status"],
        "mapping": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec", "通话状态": "call_status"}
    },
    "fact_trials.csv": {
        "target_cols": ["user_id", "trial_time", "course_name", "is_attended"],
        "mapping": {"学员ID": "user_id", "上课时间": "trial_time", "课程名称": "course_name", "是否出勤": "is_attended"}
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
    if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    sheets = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json().get("sheets", [])

    tasks = {"fact_leads.csv": "分配记录", "fact_orders.csv": "订单记录", "fact_trials.csv": "课程记录", "fact_calls.csv": "通话记录"}

    for filename, keyword in tasks.items():
        target_sheets = [s for s in sheets if keyword in str(s.get('name'))]
        dfs = []
        conf = FIELD_MAPS[filename]
        for s in target_sheets:
            df = fetch_records(token, s['id'])
            if df.empty: continue
            df.columns = [str(c).strip() for c in df.columns]
            # 仅保留并映射需要的列
            valid_cols = [c for c in conf['mapping'].keys() if c in df.columns]
            if valid_cols:
                dfs.append(df[valid_cols].rename(columns=conf['mapping']))
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            # 补全缺失列
            for col in conf['target_cols']:
                if col not in final_df.columns: final_df[col] = ""
            final_df = final_df[conf['target_cols']].copy()
            # 强制添加同步时间戳，确保 Git 每次都能检测到变化
            final_df['sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            final_df.to_csv(os.path.join(DATA_DIR, filename), index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 更新成功")

if __name__ == "__main__":
    main()
