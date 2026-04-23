import requests
import pandas as pd
import json
import sys
import re
from datetime import datetime, timedelta

APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = "xKxPxUUt9Ugxrwiia3Gq8PwiEiE"

OUTPUT_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

# 建议先设 15 天，避免你几天没更新时漏数
LOOKBACK_DAYS = 15

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    params = {
        "appkey": APP_KEY,
        "appsecret": APP_SECRET
    }
    res = requests.get(url, params=params, timeout=30)
    data = res.json()
    if "access_token" not in data:
        raise RuntimeError(f"获取 access_token 失败: {json.dumps(data, ensure_ascii=False)}")
    return data["access_token"]

def get_all_sheets(token: str):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    headers = {
        "x-acs-dingtalk-access-token": token
    }
    params = {
        "operatorId": OPERATOR_ID
    }

    res = requests.get(url, headers=headers, params=params, timeout=30)
    data = res.json()

    print("===== DEBUG SHEETS =====")
    print("status_code:", res.status_code)
    print(json.dumps(data, ensure_ascii=False, indent=2)[:5000])

    if "sheets" in data:
        return data["sheets"]
    if "items" in data:
        return data["items"]
    if "value" in data:
        return data["value"]
    if "data" in data and isinstance(data["data"], dict):
        if "sheets" in data["data"]:
            return data["data"]["sheets"]
        if "items" in data["data"]:
            return data["data"]["items"]
        if "value" in data["data"]:
            return data["data"]["value"]

    raise RuntimeError("未找到 sheets/items/value，请检查 DEBUG SHEETS 输出")

def list_records(token: str, sheet_id_or_name: str):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{sheet_id_or_name}/records/list"
    headers = {
        "x-acs-dingtalk-access-token": token,
        "Content-Type": "application/json"
    }

    page_token = None
    all_rows = []

    while True:
        body = {
            "operatorId": OPERATOR_ID,
            "maxResults": 100
        }
        if page_token:
            body["pageToken"] = page_token

        res = requests.post(url, headers=headers, json=body, timeout=30)
        data = res.json()

        print(f"===== DEBUG RECORDS {sheet_id_or_name} =====")
        print("status_code:", res.status_code)
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])

        if "records" in data:
            records = data["records"]
            next_page_token = data.get("nextPageToken")
        elif "value" in data:
            records = data["value"]
            next_page_token = data.get("nextPageToken")
        elif "data" in data and isinstance(data["data"], dict):
            records = data["data"].get("records", data["data"].get("value", []))
            next_page_token = data["data"].get("nextPageToken")
        else:
            raise RuntimeError(f"{sheet_id_or_name} 未取到 records，请检查 DEBUG RECORDS 输出")

        all_rows.extend(records)

        if not next_page_token:
            break

        page_token = next_page_token

    rows = []
    for r in all_rows:
        if isinstance(r, dict) and "fields" in r:
            rows.append(r["fields"])
        else:
            rows.append(r)

    return pd.DataFrame(rows)

def parse_sheet_name(name: str):
    m = re.match(r"^(\d{8})(分配记录|课程记录|通话记录|订单记录)$", str(name).strip())
    if not m:
        return None, None
    dt = datetime.strptime(m.group(1), "%Y%m%d").date()
    kind = m.group(2)
    return dt, kind

def pick_sheet_groups(sheet_map: dict):
    today = datetime.now().date()
    start_date = today - timedelta(days=LOOKBACK_DAYS - 1)

    picked = {
        "分配记录": [],
        "课程记录": [],
        "通话记录": [],
        "订单记录": [],
    }

    for name, sid in sheet_map.items():
        dt, kind = parse_sheet_name(name)
        if not dt or not kind:
            continue
        if start_date <= dt <= today:
            picked[kind].append((dt, name, sid))

    for kind in picked:
        picked[kind] = sorted(picked[kind], key=lambda x: x[0])

    print("===== DEBUG PICKED SHEETS =====")
    print(json.dumps({
        k: [{"date": str(x[0]), "name": x[1], "id": x[2]} for x in v]
        for k, v in picked.items()
    }, ensure_ascii=False, indent=2))

    return picked

def load_and_concat(token: str, picked_items):
    dfs = []
    for _, sheet_name, sheet_id in picked_items:
        print(f"--- loading {sheet_name} ({sheet_id}) ---")
        df = list_records(token, sheet_id)
        if not df.empty:
            df["_source_sheet_name"] = sheet_name
            dfs.append(df)

    if not dfs:
        return pd.DataFrame()

    return pd.concat(dfs, ignore_index=True)

def dedupe_leads(df):
    if df.empty:
        return df

    id_col = None
    for c in ["学员ID", "user_id", "stu_id"]:
        if c in df.columns:
            id_col = c
            break

    time_col = None
    for c in ["分配时间", "assigned_time", "最新分配日期", "分配日期"]:
        if c in df.columns:
            time_col = c
            break

    if not id_col:
        raise RuntimeError(f"leads 缺少主键列，现有列: {list(df.columns)}")

    if time_col:
        df[time_col] = pd.to_datetime(df[time_col], errors="coerce")
        df = df.sort_values(time_col)

    return df.drop_duplicates(subset=[id_col], keep="last")

def dedupe_trials(df):
    if df.empty:
        return df
    return df.drop_duplicates()

def dedupe_calls(df):
    if df.empty:
        return df

    def norm(v):
        return str(v if v is not None else "").strip()

    def build_key(row):
        uid = norm(row.get("学员ID", row.get("user_id", "")))
        connect_time = norm(row.get("双方接听时间", row.get("connect_time_sec", "")))
        outbound_time = norm(row.get("外呼时间", row.get("outbound_time", "")))
        seat_id = norm(row.get("坐席号", row.get("seat_id", "")))
        call_status = norm(row.get("接听状态", row.get("call_status", "")))

        if uid and connect_time:
            return f"{uid}__{connect_time}"

        return f"{uid}__{outbound_time}__{seat_id}__{call_status}"

    df = df.copy()
    df["_dedupe_key"] = df.apply(build_key, axis=1)
    df = df.drop_duplicates(subset=["_dedupe_key"])
    return df.drop(columns=["_dedupe_key"])

def dedupe_orders(df):
    if df.empty:
        return df

    order_col = None
    for c in ["订单号", "order_id", "订单id"]:
        if c in df.columns:
            order_col = c
            break

    if not order_col:
        raise RuntimeError(f"orders 缺少订单号列，现有列: {list(df.columns)}")

    return df.drop_duplicates(subset=[order_col])

def transform_trials(df):
    if df.empty:
        return df
    if "实际上课教材" in df.columns:
        df = df.drop(columns=["实际上课教材"])
    return df

def main():
    print("🚀 Start DingTalk notable sync")
    token = get_token()

    sheets = get_all_sheets(token)

    sheet_map = {}
    for s in sheets:
        if not isinstance(s, dict):
            continue
        sid = s.get("id") or s.get("sheetId") or s.get("sheet_id")
        sname = s.get("name") or s.get("sheetName") or s.get("sheet_name")
        if sid and sname:
            sheet_map[sname] = sid

    print("===== DEBUG SHEET MAP =====")
    print(json.dumps(sheet_map, ensure_ascii=False, indent=2))

    picked = pick_sheet_groups(sheet_map)

    for kind in ["分配记录", "课程记录", "通话记录", "订单记录"]:
        if not picked[kind]:
            raise RuntimeError(f"在最近 {LOOKBACK_DAYS} 天内未找到 {kind}")

    leads = load_and_concat(token, picked["分配记录"])
    trials = load_and_concat(token, picked["课程记录"])
    calls = load_and_concat(token, picked["通话记录"])
    orders = load_and_concat(token, picked["订单记录"])

    leads = dedupe_leads(leads)
    trials = dedupe_trials(trials)
    trials = transform_trials(trials)
    calls = dedupe_calls(calls)
    orders = dedupe_orders(orders)

    leads.to_csv(f"{OUTPUT_DIR}/fact_leads.csv", index=False)
    trials.to_csv(f"{OUTPUT_DIR}/fact_trials.csv", index=False)
    calls.to_csv(f"{OUTPUT_DIR}/fact_calls.csv", index=False)
    orders.to_csv(f"{OUTPUT_DIR}/fact_orders.csv", index=False)

    print("===== DEBUG FINAL SHAPES =====")
    print({
        "leads": leads.shape,
        "trials": trials.shape,
        "calls": calls.shape,
        "orders": orders.shape,
    })

    print("✅ Sync done")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", str(e))
        sys.exit(1)
