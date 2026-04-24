import requests
import pandas as pd
import re
import os
import json
import traceback
from datetime import datetime, timedelta

APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")

OUTPUT_DIR = "public/data"
# 【修改1】不再往前找15天，只针对昨天（1天前）的数据
TARGET_DAYS_AGO = 1 
DEBUG_LOG = os.path.join(OUTPUT_DIR, "sync_debug.log")


def log(msg):
    print(msg)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(DEBUG_LOG, "a", encoding="utf-8") as f:
        f.write(str(msg) + "\n")


def pretty(obj, limit=4000):
    try:
        return json.dumps(obj, ensure_ascii=False, indent=2)[:limit]
    except Exception:
        return str(obj)[:limit]


def check_env():
    missing = []
    for k, v in {
        "DING_APP_KEY": APP_KEY,
        "DING_APP_SECRET": APP_SECRET,
        "DING_OPERATOR_ID": OPERATOR_ID,
    }.items():
        if not v:
            missing.append(k)

    if missing:
        raise RuntimeError(f"Missing GitHub Secrets / env vars: {missing}")


def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    resp = requests.get(
        url,
        params={"appkey": APP_KEY, "appsecret": APP_SECRET},
        timeout=30,
    )
    res = resp.json()

    log("===== TOKEN RESPONSE =====")
    log(pretty(res))

    token = res.get("access_token")
    if not token:
        raise RuntimeError(f"Failed to get access_token: {res}")

    return token


def get_sheets(token):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets"
    headers = {"x-acs-dingtalk-access-token": token}
    params = {"operatorId": OPERATOR_ID}

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    res = resp.json()

    log("===== SHEETS RESPONSE =====")
    log(f"status_code={resp.status_code}")
    log(pretty(res))

    if resp.status_code >= 400:
        raise RuntimeError(f"get_sheets failed: {res}")

    sheets = (
        res.get("value")
        or res.get("sheets")
        or res.get("items")
        or res.get("data", {}).get("value")
        or res.get("data", {}).get("sheets")
        or res.get("data", {}).get("items")
        or []
    )

    if not sheets:
        raise RuntimeError(f"No sheets found. Raw response: {res}")

    return sheets


def list_records(token, sid, sheet_name):
    url = f"https://api.dingtalk.com/v1.0/notable/bases/{BASE_ID}/sheets/{sid}/records/list"
    headers = {
        "x-acs-dingtalk-access-token": token,
        "Content-Type": "application/json",
    }

    all_rows = []
    page_token = None
    page = 1

    while True:
        body = {
            "operatorId": OPERATOR_ID,
            "maxResults": 100,  # 【修改2】解决刚才的报错，每次只拉100条
        }
        if page_token:
            body["pageToken"] = page_token

        resp = requests.post(url, headers=headers, json=body, timeout=30)
        res = resp.json()

        log(f"===== RECORDS RESPONSE: {sheet_name} page={page} =====")
        log(f"status_code={resp.status_code}")
        # 日志限制长度，防止日志文件撑爆
        log(pretty(res, limit=1000)) 

        if resp.status_code >= 400:
            raise RuntimeError(f"list_records failed for {sheet_name}: {res}")

        data = res.get("data", res)
        records = (
            data.get("records")
            or data.get("value")
            or data.get("items")
            or []
        )

        for r in records:
            if isinstance(r, dict) and "fields" in r:
                all_rows.append(r["fields"])
            elif isinstance(r, dict):
                all_rows.append(r)
            else:
                all_rows.append({"_raw": r})

        page_token = (
            data.get("nextPageToken")
            or data.get("nextToken")
            or data.get("pageToken")
        )

        if not page_token:
            break

        page += 1

    df = pd.DataFrame(all_rows)
    log(f"Loaded {sheet_name}: rows={len(df)}")
    return df


def normalize_columns(df):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def parse_sheet_name(name):
    name = str(name).strip()
    m = re.match(r"^(\d{8})(分配记录|课程记录|通话记录|订单记录)$", name)
    if not m:
        return None, None

    dt = datetime.strptime(m.group(1), "%Y%m%d").date()
    kind = m.group(2)
    return dt, kind


def pick_targets(sheets, keyword):
    today = datetime.now().date()
    # 【修改3】精准定位昨天的日期
    target_date = today - timedelta(days=TARGET_DAYS_AGO)

    targets = []

    for s in sheets:
        name = str(s.get("name", "")).strip()
        sid = s.get("id") or s.get("sheetId") or s.get("sheet_id")

        dt, kind = parse_sheet_name(name)

        # 严格只抓取名字等于昨天的表格
        if dt and kind == keyword and dt == target_date:
            targets.append({
                "date": dt,
                "name": name,
                "id": sid,
            })

    targets = sorted(targets, key=lambda x: x["date"])

    log(f"===== TARGETS {keyword} =====")
    log(pretty(targets))

    return targets


def safe_concat(dfs):
    valid = [df for df in dfs if df is not None and not df.empty]
    if not valid:
        return pd.DataFrame()
    return pd.concat(valid, ignore_index=True)


def apply_mapping(full_df, cfg, keyword):
    if full_df.empty:
        return pd.DataFrame(columns=list(cfg["cols"].values()))

    full_df = normalize_columns(full_df)

    if keyword == "课程记录" and "实际上课教材" in full_df.columns:
        full_df = full_df.drop(columns=["实际上课教材"])

    full_df = full_df.rename(columns=cfg["cols"])
    keep = [c for c in cfg["cols"].values() if c in full_df.columns]

    if not keep:
        raise RuntimeError(
            f"No mapped columns kept for {keyword}. "
            f"Raw columns={list(full_df.columns)}, expected_map={cfg['cols']}"
        )

    final = full_df[keep].copy()

    for col in cfg["cols"].values():
        if col not in final.columns:
            final[col] = ""

    final = final[list(cfg["cols"].values())]
    final = final.fillna("").astype(str)

    return final


CONFIGS = {
    "分配记录": {
        "output": "fact_leads.csv",
        "cols": {
            "学员ID": "user_id",
            "分配时间": "assigned_time",
            "负责人": "manager_name",
            "线索状态": "status",
        },
    },
    "课程记录": {
        "output": "fact_trials.csv",
        "cols": {
            "学员ID": "user_id",
            "上课时间": "trial_time",
            "是否出勤": "is_attended",
        },
    },
    "通话记录": {
        "output": "fact_calls.csv",
        "cols": {
            "学员ID": "user_id",
            "外呼时间": "outbound_time",
            "通话时长(秒)": "connect_time_sec",
        },
    },
    "订单记录": {
        "output": "fact_orders.csv",
        "cols": {
            "订单号": "order_id",
            "学员ID": "user_id",
            "实付金额": "amount",
        },
    },
}


def sync_one(token, sheets, keyword, cfg):
    log(f"\n\n========== START SYNC {keyword} ==========")

    targets = pick_targets(sheets, keyword)
    output_path = os.path.join(OUTPUT_DIR, cfg["output"])
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 提取昨天的新数据
    if not targets:
        log(f"No target sheets found for {keyword} yesterday.")
        new_data_df = pd.DataFrame(columns=list(cfg["cols"].values()))
    else:
        dfs = []
        for t in targets:
            sid = t.get("id")
            name = t.get("name")
            if not sid: continue
            
            df = list_records(token, sid, name)
            if not df.empty:
                dfs.append(df)

        full_df = safe_concat(dfs)
        new_data_df = apply_mapping(full_df, cfg, keyword)

    # 【核心：增量合并逻辑】
    if os.path.exists(output_path):
        log(f"Found existing history file: {cfg['output']}, merging data...")
        try:
            # 以字符串格式读取老数据，防止 ID 变为科学计数法
            old_df = pd.read_csv(output_path, dtype=str).fillna("")
            
            if not new_data_df.empty:
                # 拼接老数据和新数据
                final_df = pd.concat([old_df, new_data_df], ignore_index=True)
                # 全列去重（如果某行数据一模一样，只保留一条）
                final_df = final_df.drop_duplicates()
                log(f"Merged: old({len(old_df)}) + new({len(new_data_df)}) -> final({len(final_df)})")
            else:
                log("No new data today, keeping old data.")
                final_df = old_df
        except Exception as e:
            log(f"Failed to read old CSV, replacing with new data. Error: {e}")
            final_df = new_data_df
    else:
        # 如果这是第一次运行，还没有老文件
        final_df = new_data_df

    # 只有当最终有数据时才写入
    if not final_df.empty or not os.path.exists(output_path):
        final_df.to_csv(output_path, index=False, encoding="utf-8-sig")
        log(f"Saved {keyword} -> {output_path}, rows={len(final_df)}")
    
    return output_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(DEBUG_LOG, "w", encoding="utf-8") as f:
        f.write(f"Incremental Sync started at {datetime.now()}\n")

    check_env()

    token = get_token()
    sheets = get_sheets(token)

    outputs = []

    for keyword, cfg in CONFIGS.items():
        output = sync_one(token, sheets, keyword, cfg)
        outputs.append(output)

    log("\n========== SYNC DONE ==========")
    log(pretty(outputs))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("\n========== SYNC FAILED ==========")
        log(str(e))
        log(traceback.format_exc())
        raise
