import requests
import pandas as pd
import os

# === 机器人凭证 ===
APP_KEY = "ding9spfsdj89ke2cwjy"
APP_SECRET = "HgWahlpcK4XAIjbvmkSgfqDSeuGY2KGB_MhxQKEwYl-cPnQxjkP9fsQWETbB3nMC"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

# 定义物理 ID
TASKS = {
    "fact_leads.csv": ["K2lDNYr", "PTUH2yg", "5ELvTmo"],
    "fact_orders.csv": ["LffMIpG", "fhBcaQC"],
    "fact_trials.csv": ["3hg61RU", "pVTLMMr"]
}

def get_access_token():
    # 使用新版 OAuth2 接口，这是 Bitable v1.0 必须的
    url = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
    res = requests.post(url, json={"appKey": APP_KEY, "appSecret": APP_SECRET}).json()
    return res.get("accessToken")

def fetch_bitable_records(token, tid):
    # 使用标准 Bitable 路径
    url = f"https://api.dingtalk.com/v1.0/bitable/apps/{BASE_ID}/tables/{tid}/records"
    headers = {"x-acs-dingtalk-access-token": token}
    # 不带 Version 声明，避免 400 错误
    try:
        print(f"📡 正在通过 Bitable 协议尝试 ID: {tid}...", end="")
        res = requests.get(url, headers=headers, params={"maxResults": 500}).json()
        
        # 这里的节点是 list
        records = res.get("list", [])
        if not records:
            # 兼容性重试：有些表在 result 节点下
            records = res.get("result", {}).get("list", [])
            
        print(f" 成功! 抓取到 {len(records)} 条")
        return [r.get("fields", r) for r in records]
    except Exception as e:
        print(f" 失败: {e}")
        return []

if __name__ == "__main__":
    token = get_access_token()
    if not token:
        print("❌ 无法获取 AccessToken"); exit()

    for filename, ids in TASKS.items():
        all_data = []
        for tid in ids:
            rows = fetch_bitable_records(token, tid)
            all_data.extend(rows)
        
        if all_data:
            df = pd.DataFrame(all_data)
            path = os.path.join(DATA_DIR, filename)
            df.to_csv(path, index=False, encoding='utf-8-sig')
            print(f"✅ 数据拉齐: {filename} ({len(df)} 行)")
        else:
            print(f"❌ {filename} 依然为空，请手动检查表格高级权限是否已添加该机器人。")
