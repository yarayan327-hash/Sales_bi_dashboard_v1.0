import requests
import pandas as pd
import os
from datetime import datetime

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
        data = res.json() if hasattr(res, 'json') else res
        
        # 100% 还原阿里云的原版安全解析逻辑
        records = []
        if "records" in data:
            records = data["records"]
        elif "value" in data:
            records = data["value"]
        elif "data" in data and isinstance(data["data"], dict):
            records = data["data"].get("records", data["data"].get("value", []))
            
        for r in records:
            all_rows.append(r.get("fields", r) if isinstance(r, dict) else r)
            
        page_token = data.get("nextPageToken") or (data.get("data", {}).get("nextPageToken") if isinstance(data.get("data"), dict) else None)
        if not page_token: break
    return pd.DataFrame(all_rows)

def main():
    token = get_token()
    
    # 解析 sheets 列表也是同理，还原最稳妥的做法
    sheets_res = requests.get(f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets", 
                              headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json()
    
    sheets = []
    if "sheets" in sheets_res: sheets = sheets_res["sheets"]
    elif "data" in sheets_res and isinstance(sheets_res["data"], dict): sheets = sheets_res["data"].get("sheets", [])

    tasks = {
        "分配记录": {"file": "fact_leads.csv", "cols": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"}},
        "课程记录": {"file": "fact_trials.csv", "cols": {"学员ID": "user_id", "上课时间": "trial_time", "是否出勤": "is_attended"}},
        "通话记录": {"file": "fact_calls.csv", "cols": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec"}},
        "订单记录": {"file": "fact_orders.csv", "cols": {"订单号": "order_id", "学员ID": "user_id", "实付金额": "amount"}}
    }

    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    for keyword, cfg in tasks.items():
        targets = [s for s in sheets if keyword in str(s.get('name'))]
        dfs = [list_records(token, s['id']) for s in targets]
        
        full_df = pd.concat([d for d in dfs if not d.empty], ignore_index=True) if dfs else pd.DataFrame()

        # 无论数据是否为空，强制洗掉中文列名
        if not full_df.empty:
            full_df = full_df.rename(columns=cfg["cols"])
            keep = [c for c in cfg["cols"].values() if c in full_df.columns]
            final = full_df[keep].drop_duplicates()
        else:
            # 如果没抓到数，强制创建一个只有英文表头的空文件，彻底证明旧数据被抹掉了
            final = pd.DataFrame(columns=list(cfg["cols"].values()))
            
        # 强制写入，绝不跳过！
        final.to_csv(os.path.join(OUTPUT_DIR, cfg["file"]), index=False, encoding='utf-8-sig')
        print(f"📊 {cfg['file']} 物理写入成功，行数: {len(final)}")

    with open(f"{OUTPUT_DIR}/last_sync.txt", "w") as f:
        f.write(f"Updated: {datetime.now()}")

if __name__ == "__main__":
    main()
