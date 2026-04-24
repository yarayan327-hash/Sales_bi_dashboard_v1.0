import requests
import pandas as pd
import os

# === 配置区 ===
APP_KEY = "ding9spfsdj89ke2cwjy"
APP_SECRET = "HgWahlpcK4XAIjbvmkSgfqDSeuGY2KGB_MhxQKEwYl-cPnQxjkP9fsQWETbB3nMC"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

TASKS = {
    "fact_leads.csv": ["K2lDNYr", "PTUH2yg", "5ELvTmo"],
    "fact_orders.csv": ["LffMIpG", "fhBcaQC"],
    "fact_trials.csv": ["3hg61RU", "pVTLMMr"],
    "fact_calls.csv": ["XWYaFU0"] 
}

def get_token():
    url = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
    res = requests.post(url, json={"appKey": APP_KEY, "appSecret": APP_SECRET}).json()
    return res.get("accessToken")

def fetch(token, tid):
    url = f"https://api.dingtalk.com/v1.0/bitable/apps/{BASE_ID}/tables/{tid}/records"
    try:
        res = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"maxResults": 1000}).json()
        return [r.get("fields", r) for r in res.get("list", [])]
    except: return []

if __name__ == "__main__":
    token = get_token()
    for filename, ids in TASKS.items():
        all_data = []
        for tid in ids:
            all_data.extend(fetch(token, tid))
        
        path = os.path.join(DATA_DIR, filename)
        if all_data:
            pd.DataFrame(all_data).to_csv(path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 同步成功: {len(all_data)} 行")
        else:
            print(f"⚠️ {filename} 抓取到 0 条，请检查钉钉权限。")
