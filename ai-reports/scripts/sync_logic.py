import requests
import pandas as pd
import os
from datetime import datetime

# === 配置获取 (GitHub Secrets) ===
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
        print(f"   ⚠️ 读取表 {tid} 出错: {e}")
        return pd.DataFrame()

def main():
    print(f"🚀 启动同步程序 | 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        print(f"📂 创建目录: {DATA_DIR}")

    token = get_token()
    if not token: return

    # 获取所有子表清单
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
        # 匹配包含关键字的所有子表
        target_ids = [s for s in sheets if keyword in str(s.get('name'))]
        print(f"📡 任务 [{keyword}]: 发现 {len(target_ids)} 张相关子表")
        
        dfs = []
        for s_info in target_ids:
            tid = s_info.get('id')
            tname = s_info.get('name')
            df = fetch_records(token, tid)
            if not df.empty:
                print(f"   📥 已加载: {tname} ({len(df)} 行)")
                dfs.append(df)
        
        if dfs:
            # 合并所有子表数据
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            
            # --- 核心改进：添加同步时间戳，强制 Git 识别变更 ---
            final_df['sync_update_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # 保存文件
            save_path = os.path.join(DATA_DIR, filename)
            final_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 物理更新成功 | 总行数: {len(final_df)}")
        else:
            print(f"⚠️ {filename} 未获取到任何有效数据，跳过更新。")

if __name__ == "__main__":
    main()
