import requests
import pandas as pd
import os
from datetime import datetime

# === 安全配置 (从 GitHub Secrets 读取) ===
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")
DATA_DIR = "public/data"

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    try:
        res = requests.get(url, params={"appkey": APP_KEY, "appsecret": APP_SECRET}, timeout=20).json()
        return res.get("access_token")
    except Exception as e:
        print(f"❌ 获取 Token 失败: {e}")
        return None

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
    except Exception as e:
        print(f"   ⚠️ 读取表 {tid} 异常: {e}")
        return pd.DataFrame()

def main():
    print(f"🚀 同步开始 | 当前时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

    token = get_token()
    if not token: return

    # 获取所有 Sheet 清单
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
        # 匹配包含关键字的表
        target_sheets = [s for s in sheets if keyword in str(s.get('name'))]
        print(f"📡 任务 [{keyword}]: 发现 {len(target_sheets)} 张表")
        
        dfs = []
        for s in target_sheets:
            tid = s.get('id')
            tname = s.get('name')
            df = fetch_records(token, tid)
            if not df.empty:
                print(f"   📥 已提取: {tname} ({len(df)} 行)")
                dfs.append(df)
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            
            # --- 核心改进：添加强制更新时间戳，确保 Git 每次都能检测到文件内容发生了变化 ---
            final_df['github_sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            save_path = os.path.join(DATA_DIR, filename)
            final_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 写入完成 | 共 {len(final_df)} 行")
        else:
            print(f"⚠️ {filename} 未找到有效数据")

if __name__ == "__main__":
    main()
