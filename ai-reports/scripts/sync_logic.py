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
LOOKBACK_DAYS = 15
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
            "maxResults": 100,
        }
        if page_token:
            body["pageToken"] = page_token

        resp = requests.post(url, headers=headers, json=body, timeout=30)
        res = resp.json()

        log(f"===== RECORDS RESPONSE: {sheet_name} page={page} =====")
        log(f"status_code={resp.status_code}")
        log(pretty(res, limit=2500))

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
    log(f"Loaded {sheet_name}: rows={len(df)}, cols={list(df.columns)}")
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
    start_date = today - timedelta(days=LOOKBACK_DAYS - 1)

    targets = []

    for s in sheets:
        name = str(s.get("name", "")).strip()
        sid = s.get("id") or s.get("sheetId") or s.get("sheet_id")

        dt, kind = parse_sheet_name(name)

        if dt and kind == keyword and start_date <= dt <= today:
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

    log(f"===== RAW COLUMNS {keyword} =====")
    log(list(full_df.columns))

    if keyword == "课程记录" and "实际上课教材" in full_df.columns:
        full_df = full_df.drop(columns=["实际上课教材"])

    full_df = full_df.rename(columns=cfg["cols"])

    keep = [c for c in cfg["cols"].values() if c in full_df.columns]

    log(f"===== MAPPED KEEP COLUMNS {keyword} =====")
    log(keep)

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

    if not targets:
        log(f"No target sheets found for {keyword}")
        final = pd.DataFrame(columns=list(cfg["cols"].values()))
    else:
        dfs = []
        for t in targets:
            sid = t.get("id")
            name = t.get("name")

            if not sid:
                log(f"Skip sheet without id: {t}")
                continue

            df = list_records(token, sid, name)

            if not df.empty:
                df["_source_sheet"] = name
                df["_source_date"] = str(t.get("date"))

            dfs.append(df)

        full_df = safe_concat(dfs)
        final = apply_mapping(full_df, cfg, keyword)

    output_path = os.path.join(OUTPUT_DIR, cfg["output"])
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    final.to_csv(output_path, index=False, encoding="utf-8-sig")

    log(f"Saved {keyword} -> {output_path}, rows={len(final)}")
    return output_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(DEBUG_LOG, "w", encoding="utf-8") as f:
        f.write(f"Sync started at {datetime.now()}\n")

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
