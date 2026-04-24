import requests
import pandas as pd
import json
import sys
import re
import os
from datetime import datetime, timedelta

# === 从 GitHub Secrets 安全读取配置 ===
APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID") 

# 重要：在 GitHub 环境中使用相对路径
OUTPUT_DIR = "public/data"
LOOKBACK_DAYS = 15

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    params = {"appkey": APP_KEY, "appsecret": APP_SECRET}
    res = requests.get(url, params=params, timeout=30)
    data = res.json()
    if "access_token" not in data:
        raise RuntimeError(f"获取 access_token 失败: {json.dumps(data, ensure_ascii=False)}")
    return data["access_token"]

def get_all_sheets(token: str):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    headers = {"x-acs-dingtalk-access-token": token}
    params = {"operatorId": OPERATOR_ID}
    res = requests.get(url, headers=headers, params=params, timeout=30)
    data = res.json()
    
    # 兼容处理返回格式
    if "sheets" in data: return data["sheets"]
    if "value" in data: return data["value"]
    if "data" in data and isinstance(data["data"], dict):
        return data["data"].get("sheets", data["data"].get("value", []))
    return []

def list_records(token: str, sheet_id: str):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{sheet_id}/records/list"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    page_token = None
    all_rows = []
    while True:
        body = {"operatorId": OPERATOR_ID, "maxResults": 500}
        if page_token: body["pageToken"] = page_token
        res = requests.post(url, headers=headers, json=body, timeout=30)
        data = res.json()
        
        # 兼容处理 records 字段
        records = []
        if "records" in data: records = data["records"]
        elif "value" in data: records = data["value"]
        elif "data" in data and isinstance(data["data"], dict):
            records = data["data"].get("records", data["data"].get("value", []))
        
        all_rows.extend(records)
        next_page_token = data.get("nextPageToken") or (data.get("data", {}).get("nextPageToken") if isinstance(data.get("data"), dict) else None)
        if not next_page_token: break
        page_token = next_page_token

    rows = [r["fields"] if isinstance(r, dict) and "fields" in r else r for r in all_rows]
    return pd.DataFrame(rows)

def parse_sheet_name(name: str):
    m = re.match(r"^(\d{8})(分配记录|课程记录|通话记录|订单记录)$", str(name).strip())
    if not m: return None, None
    dt = datetime.strptime(m.group(1), "%Y%m%d").date()
    return dt, m.group(2)

def main():
    print(f"🚀 GitHub 同步启动 | 时间: {datetime.now()}")
    if not os.path.exists(OUTPUT_DIR): 
        os.makedirs(OUTPUT_DIR)
        print(f"创建目录: {OUTPUT_DIR}")
    
    token = get_token()
    sheets = get_all_sheets(token)
    
    sheet_map = {s.get("name") or s.get("sheetName"): s.get("id") or s.get("sheetId") for s in sheets if (s.get("name") or s.get("sheetName"))}

    today = datetime.now().date()
    start_date = today - timedelta(days=LOOKBACK_DAYS - 1)
    picked = {"分配记录": [], "课程记录": [], "通话记录": [], "订单记录": []}

    for name, sid in sheet_map.items():
        dt, kind = parse_sheet_name(name)
        if dt and kind and start_date <= dt <= today:
            picked[kind].append((dt, name, sid))

    mapping = {
        "分配记录": "fact_leads.csv",
        "课程记录": "fact_trials.csv",
        "通话记录": "fact_calls.csv",
        "订单记录": "fact_orders.csv"
    }

    for kind, filename in mapping.items():
        items = sorted(picked[kind], key=lambda x: x[0])
        if not items:
            print(f"⚠️ 找不到最近 {LOOKBACK_DAYS} 天的 {kind}")
            continue
        
        dfs = []
        for _, sname, sid in items:
            print(f"📥 正在拉取: {sname}")
            df = list_records(token, sid)
            if not df.empty:
                df["_source_sheet_name"] = sname
                dfs.append(df)
        
        if dfs:
            res_df = pd.concat(dfs, ignore_index=True)
            res_df = res_df.drop_duplicates()
            # 关键：加入物理同步时间，确保文件一定会发生变动被 Git 检测到
            res_df["_last_sync"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            save_path = os.path.join(OUTPUT_DIR, filename)
            res_df.to_csv(save_path, index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 落地成功，行数: {len(res_df)}")

    # 同时写一个时间戳文件作为双重保险
    with open(os.path.join(OUTPUT_DIR, "last_sync.txt"), "w") as f:
        f.write(f"Updated at: {datetime.now()}")

if __name__ == "__main__":
    main()
