import requests
import pandas as pd
import os
from datetime import datetime

# === 配置获取 (确保 GitHub Secrets 已配置) ===
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")
DATA_DIR = "public/data"

# === 字段映射器 (钉钉中文 -> 看板英文) ===
FIELD_MAPS = {
    "fact_leads.csv": {"mapping": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"}, "keyword": "分配记录"},
    "fact_orders.csv": {"mapping": {"订单号": "order_id", "学员ID": "user_id", "实付金额": "amount", "付款时间": "order_time"}, "keyword": "订单记录"},
    "fact_trials.csv": {"mapping": {"学员ID": "user_id", "上课时间": "trial_time", "课程名称": "course_name", "是否出勤": "is_attended"}, "keyword": "课程记录"},
    "fact_calls.csv": {"mapping": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec", "通话状态": "call_status"}, "keyword": "通话记录"}
}

def get_token():
    print("🔑 正在尝试从钉钉获取 Access Token...")
    url = "https://oapi.dingtalk.com/gettoken"
    res = requests.get(url, params={"appkey": APP_KEY, "appsecret": APP_SECRET}).json()
    token = res.get("access_token")
    if token: print("✅ Token 获取成功")
    else: print(f"❌ Token 获取失败: {res}")
    return token

def fetch_records(token, tid, tname):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{tid}/records/list"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    all_rows = []
    page_token = None
    print(f"   ⏳ 正在拉取子表数据: {tname}...")
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
        print(f"   📥 成功拿到 {len(all_rows)} 行数据")
        return pd.DataFrame(all_rows)
    except Exception as e:
        print(f"   ❌ 拉取失败: {e}")
        return pd.DataFrame()

def main():
    token = get_token()
    if not token: return
    if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

    # 获取所有 Sheet
    print("📡 正在获取多维表子表清单...")
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    sheets_res = requests.get(url, headers={"x-acs-dingtalk-access-token": token}, params={"operatorId": OPERATOR_ID}).json()
    sheets = sheets_res.get("sheets", sheets_res.get("value", []))
    print(f"🕵️ 钉钉返回了 {len(sheets)} 张子表")

    for filename, config in FIELD_MAPS.items():
        keyword = config["keyword"]
        target_sheets = [s for s in sheets if keyword in str(s.get('name'))]
        print(f"\n📂 任务 [{filename}] | 关键字: {keyword} | 发现 {len(target_sheets)} 张匹配表")
        
        dfs = []
        for s in target_sheets:
            df = fetch_records(token, s['id'], s['name'])
            if not df.empty:
                # 统一清理列名空格
                df.columns = [str(c).strip() for c in df.columns]
                # 映射列名
                m = config["mapping"]
                valid_cols = [c for c in m.keys() if c in df.columns]
                dfs.append(df[valid_cols].rename(columns=m))
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True, sort=False)
            final_df['sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            final_df.to_csv(os.path.join(DATA_DIR, filename), index=False, encoding='utf-8-sig')
            print(f"⭐ 最终确认: {filename} 已保存，总计 {len(final_df)} 行数据写入磁盘")
        else:
            print(f"⚠️ 警告: {filename} 没有拿到任何数据，将保留旧文件")

if __name__ == "__main__":
    main()
