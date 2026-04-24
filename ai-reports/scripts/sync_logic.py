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
OPERATOR_ID = os.getenv("DING_OPERATOR_ID") # 这里就是你说的 UnionID/UserID

# GitHub 环境下的输出目录
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
    
    # 兼容各种返回格式
    keys = ["sheets", "items", "value"]
    for k in keys:
        if k in data: return data[k]
    if "data" in data and isinstance(data["data"], dict):
        for k in keys:
            if k in data["data"]: return data["data"][k]
    raise RuntimeError("未找到 sheets 数据，请检查权限或配置")

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
        if "records" in data: records = data["records"]
        elif "value" in data: records = data["value"]
        elif "data" in data and isinstance(data["data"], dict):
            records = data["data"].get("records", data["data"].get("value", []))
        else: records = []
        
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
    print(f"🚀 开始同步 | 环境: GitHub Actions | 时间: {datetime.now()}")
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    
    token = get_token()
    sheets = get_all_sheets(token)
    
    sheet_map = {}
    for s in sheets:
        sid = s.get("id") or s.get("sheetId") or s.get("sheet_id")
        sname = s.get("name") or s.get("sheetName") or s.get("sheet_name")
        if sid and sname: sheet_map[sname] = sid

    # 日期回溯筛选
    today = datetime.now().date()
    start_date = today - timedelta(days=LOOKBACK_DAYS - 1)
    picked = {"分配记录": [], "课程记录": [], "通话记录": [], "订单记录": []}

    for name, sid in sheet_map.items():
        dt, kind = parse_sheet_name(name)
        if dt and kind and start_date <= dt <= today:
            picked[kind].append((dt, name, sid))

    # 执行抓取与保存
    for kind, filename in [("分配记录", "fact_leads.csv"), ("课程记录", "fact_trials.csv"), 
                          ("通话记录", "fact_calls.csv"), ("订单记录", "fact_orders.csv")]:
        items = sorted(picked[kind], key=lambda x: x[0])
        if not items:
            print(f"⚠️ 警告: 最近 {LOOKBACK_DAYS} 天未找到 {kind}")
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
            # 这里可以保留你之前的去重逻辑(dedupe_leads等)，为了演示先直接去重
            res_df = res_df.drop_duplicates()
            res_df.to_csv(f"{OUTPUT_DIR}/{filename}", index=False, encoding='utf-8-sig')
            print(f"✅ {filename} 保存成功: {res_df.shape}")

if __name__ == "__main__":
    main()
