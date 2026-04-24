import requests
import pandas as pd
import os

# === 新机器人凭证 ===
CLIENT_ID = "ding9spfsdj89ke2cwjy"
CLIENT_SECRET = "HgWahlpcK4XAIjbvmkSgfqDSeuGY2KGB_MhxQKEwYl-cPnQxjkP9fsQWETbB3nMC"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

ID_CONFIG = {
    "fact_leads.csv": {"ids": ["PTUH2yg", "5ELvTmo", "UeIZhSp", "K2lDNYr"], "keys": ["user_id", "assigned_time"], "map": {'stu_id':'user_id', 'new_admin_id':'sales_id', 'add_time':'assigned_time'}},
    "fact_orders.csv": {"ids": ["LffMIpG", "fhBcaQC"], "keys": ["order_id"], "map": {'order_no':'order_id', 'amount':'paid_amount', 'pay_time':'order_time'}},
    "fact_trials.csv": {"ids": ["3hg61RU", "pVTLMMr", "BoEJ2cc"], "keys": ["id"], "map": {'status':'class_status','id':'id'}}
}

def get_access_token():
    url = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
    payload = {"appKey": CLIENT_ID, "appSecret": CLIENT_SECRET}
    try:
        res = requests.post(url, json=payload).json()
        return res.get("accessToken")
    except: return None

def fetch_records(token, table_id):
    url = f"https://api.dingtalk.com/v1.0/bitable/apps/{BASE_ID}/tables/{table_id}/records"
    # 移除 impersonate，纯靠机器人自己的权限
    headers = {"x-acs-dingtalk-access-token": token}
    try:
        res = requests.get(url, headers=headers, params={"maxResults": 200}, timeout=10).json()
        return pd.DataFrame([r.get('fields', {}) for r in res.get('list', [])])
    except:
        return pd.DataFrame()

if __name__ == "__main__":
    print("🚀 启动机器人原生权限同步...")
    token = get_access_token()
    if not token: exit()

    for fname, cfg in ID_CONFIG.items():
        frames = []
        for tid in cfg["ids"]:
            df = fetch_records(token, tid)
            if not df.empty:
                df.rename(columns=cfg["map"], inplace=True)
                frames.append(df)
        
        if frames:
            path = os.path.join(DATA_DIR, fname)
            old_df = pd.read_csv(path) if os.path.exists(path) else pd.DataFrame()
            new_df = pd.concat(frames)
            
            # 格式化与合并
            final_df = pd.concat([old_df, new_df]).drop_duplicates(subset=cfg["keys"], keep='last')
            final_df.to_csv(path, index=False, encoding='utf-8-sig')
            print(f"✅ {fname} 同步成功！")
        else:
            print(f"❌ {fname} 抓取失败。请务必确认已在多维表「高级权限」中手动添加了机器人应用。")
