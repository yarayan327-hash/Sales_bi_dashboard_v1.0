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
        body = {"operatorId": OPERATOR_ID, "maxResults": 500, "pageToken": page_token}
        res = requests.post(url, headers=headers, json=body).json()
        data = res.get("data", res)
        records = data.get("records", data.get("value", []))
        for r in records:
            # 兼容处理字段结构
            all_rows.append(r.get("fields", r) if isinstance(r, dict) else r)
        page_token = data.get("nextPageToken")
        if not page_token: break
    return pd.DataFrame(all_rows)

def main():
    print(f"🚀 开始同步真实数据...")
    token = get_token()
    if not token: raise Exception("获取Token失败")

    # 获取所有子表
    sheets_res = requests.get(f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets", 
                              headers={"x-acs-dingtalk-access-token": token}, 
                              params={"operatorId": OPERATOR_ID}).json()
    sheets = sheets_res.get("sheets", sheets_res.get("value", []))

    # 任务配置：关键词 -> 输出文件名 -> 字段映射
    tasks = {
        "分配记录": {"file": "fact_leads.csv", "map": {"学员ID": "user_id", "分配时间": "assigned_time", "负责人": "manager_name", "线索状态": "status"}},
        "课程记录": {"file": "fact_trials.csv", "map": {"学员ID": "user_id", "上课时间": "trial_time", "是否出勤": "is_attended"}},
        "通话记录": {"file": "fact_calls.csv", "map": {"学员ID": "user_id", "外呼时间": "outbound_time", "通话时长(秒)": "connect_time_sec"}},
        "订单记录": {"file": "fact_orders.csv", "map": {"订单号": "order_id", "学员ID": "user_id", "实付金额": "amount"}}
    }

    for keyword, config in tasks.items():
        targets = [s for s in sheets if keyword in s.get('name', '')]
        if not targets: continue
        
        dfs = []
        for s in targets:
            df = list_records(token, s['id'])
            if not df.empty: dfs.append(df)
        
        if dfs:
            final_df = pd.concat(dfs, ignore_index=True)
            # 强制映射字段，不存在的列会被忽略
            final_df = final_df.rename(columns=config["map"])
            # 只保留看板需要的列
            keep_cols = [c for c in config["map"].values() if c in final_df.columns]
            final_df = final_df[keep_cols]
            
            final_df.to_csv(os.path.join(OUTPUT_DIR, config["file"]), index=False, encoding='utf-8-sig')
            print(f"✅ {config['file']} 真正写入了 {len(final_df)} 行真实数据")

    with open(f"{OUTPUT_DIR}/last_sync.txt", "w") as f:
        f.write(f"Sync Success: {datetime.now()}")

if __name__ == "__main__":
    main()
