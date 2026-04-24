import requests
import pandas as pd
import os

# 配置信息
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")
DATA_DIR = "public/data" # 保持与根目录 public 的连接

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
            res = requests.post(url, headers=headers, json=body, timeout=20).json()
            data = res.get("data", res)
            records = data.get("records", data.get("value", []))
            for r in records:
                all_rows.append(r.get("fields", r) if isinstance(r, dict) else r)
            page_token = data.get("nextPageToken")
            if not page_token: break
        return pd.DataFrame(all_rows)
    except: return pd.DataFrame()

def main():
    if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)
    token = get_token()
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    res = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json()
    sheets = res.get("sheets", res.get("value", []))
    
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
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            final_df.to_csv(os.path.join(DATA_DIR, filename), index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 写入完成")

if __name__ == "__main__":
    main()
