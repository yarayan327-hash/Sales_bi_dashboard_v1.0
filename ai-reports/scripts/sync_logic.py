import requests
import pandas as pd
import re
import os
from datetime import datetime, timedelta

APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID") 
OUTPUT_DIR = "public/data"
LOOKBACK_DAYS = 15

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    res = requests.get(url, params={"appkey": APP_KEY, "appsecret": APP_SECRET}, timeout=30).json()
    return res.get("access_token")

def list_records(token, sid):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{sid}/records/list"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    all_rows = []
    page_token = None
    while True:
        body = {"operatorId": OPERATOR_ID, "maxResults": 500}
        if page_token: body["pageToken"] = page_token
        res = requests.post(url, headers=headers, json=body, timeout=30).json()
        data = res.get("data", res)
        records = data.get("records", data.get("value", []))
        for r in records:
            all_rows.append(r.get("fields", r) if isinstance(r, dict) and "fields" in r else r)
        page_token = data.get("nextPageToken")
        if not page_token: break
    return pd.DataFrame(all_rows)

def main():
    print(f"🚀 开始精准抓取最近 {LOOKBACK_DAYS} 天数据...")
    token = get_token()

    sheets_res = requests.get(f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets", 
                              headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json()
    sheets = sheets_res.get("sheets", sheets_res.get("data", {}).get("sheets", sheets_res.get("value", [])))

    # 还原阿里云的日期过滤逻辑
    today = datetime.now().date()
    start_date = today - timedelta(days=LOOKBACK_DAYS - 1)
    
    tasks = {
        "分配记录": {"file": "fact_leads.csv", "cols": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"}},
        "课程记录": {"file": "fact_trials.csv", "cols": {"学员ID": "user_id", "上课时间": "trial_time", "是否出勤": "is_attended"}},
        "通话记录": {"file": "fact_calls.csv", "cols": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec"}},
        "订单记录": {"file": "fact_orders.csv", "cols": {"订单号": "order_id", "学员ID": "user_id", "实付金额": "amount"}}
    }

    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)

    for keyword, cfg in tasks.items():
        # 严格匹配表名，例如：20260424通话记录
        targets = []
        for s in sheets:
            name = str(s.get('name', '')).strip()
            m = re.match(r"^(\d{8})(分配记录|课程记录|通话记录|订单记录)$", name)
            if m and m.group(2) == keyword:
                dt = datetime.strptime(m.group(1), "%Y%m%d").date()
                if start_date <= dt <= today:
                    targets.append(s)
        
        dfs = []
        for s in targets:
            print(f"📥 正在拉取: {s.get('name')}")
            df = list_records(token, s['id'])
            if not df.empty: dfs.append(df)
        
        if dfs:
            full_df = pd.concat(dfs, ignore_index=True)
            
            # 【关键修复】：强行去除所有列名的前后空格，防止因为一个空格导致全盘皆空
            full_df.columns = [str(c).strip() for c in full_df.columns]
            print(f"🔍 {keyword} 实际拉到的列名: {list(full_df.columns)}")
            
            # 映射列名并筛选
            full_df = full_df.rename(columns=cfg["cols"])
            keep = [c for c in cfg["cols"].values() if c in full_df.columns]
            final = full_df[keep].drop_duplicates()
        else:
            final = pd.DataFrame(columns=list(cfg["cols"].values()))
            
        final.to_csv(os.path.join(OUTPUT_DIR, cfg["file"]), index=False, encoding='utf-8-sig')
        print(f"📊 {cfg['file']} 写入完成，最终行数: {len(final)}")

    with open(f"{OUTPUT_DIR}/last_sync.txt", "w") as f:
        f.write(f"Updated: {datetime.now()}")

if __name__ == "__main__":
    main()
