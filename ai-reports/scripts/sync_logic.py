import requests
import pandas as pd
import re
import os
import json
import traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

APP_KEY = os.getenv("DING_APP_KEY")
APP_SECRET = os.getenv("DING_APP_SECRET")
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = os.getenv("DING_OPERATOR_ID")

OUTPUT_DIR = "public/data"
DEBUG_LOG = os.path.join(OUTPUT_DIR, "sync_debug.log")
MAX_RESULTS = 100
SYNC_TZ = os.getenv("SYNC_TZ", "Asia/Riyadh")


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


def get_target_date():
    return datetime.now(ZoneInfo(SYNC_TZ)).date() - timedelta(days=1)


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
            "maxResults": MAX_RESULTS,
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


def pick_target_sheet(sheets, keyword):
    target_date = get_target_date()
    matched = []

    for s in sheets:
        name = str(s.get("name", "")).strip()
        sid = s.get("id") or s.get("sheetId") or s.get("sheet_id")

        dt, kind = parse_sheet_name(name)

        if dt == target_date and kind == keyword:
            matched.append({
                "date": dt,
                "name": name,
                "id": sid,
            })

    log(f"===== TARGET SHEET {keyword} / {target_date} =====")
    log(pretty(matched))

    return matched


def to_clean_str(value):
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalize_user_id(value):
    text = to_clean_str(value)

    if not text:
        return ""

    m = re.search(r"\((\d+)\)", text)
    if m:
        return m.group(1)

    m = re.search(r"\d+", text)
    if m:
        return m.group(0)

    return text


def read_existing_csv(file_name, columns):
    path = os.path.join(OUTPUT_DIR, file_name)

    if not os.path.exists(path):
        return pd.DataFrame(columns=columns)

    try:
        df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
    except Exception:
        df = pd.read_csv(path, dtype=str)

    df = normalize_columns(df)

    for col in columns:
        if col not in df.columns:
            df[col] = ""

    return df[columns].fillna("").astype(str)


def save_csv(df, file_name):
    path = os.path.join(OUTPUT_DIR, file_name)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    log(f"Saved -> {path}, rows={len(df)}, cols={list(df.columns)}")
    return path


def load_sales_map_from_sheets(token, sheets):
    target = None

    for s in sheets:
        name = str(s.get("name", "")).strip()
        if name == "销售id对应名字表":
            target = {
                "name": name,
                "id": s.get("id") or s.get("sheetId") or s.get("sheet_id"),
            }
            break

    if not target or not target["id"]:
        log("No sales map sheet found.")
        return pd.DataFrame(columns=["sales_id", "sales_group", "sales_name"])

    df = list_records(token, target["id"], target["name"])

    if df.empty:
        return pd.DataFrame(columns=["sales_id", "sales_group", "sales_name"])

    df = normalize_columns(df)

    rename_map = {
        "sales_id": "sales_id",
        "sales_group": "sales_group",
        "sales_name": "sales_name",
        "销售ID": "sales_id",
        "销售id": "sales_id",
        "销售组": "sales_group",
        "销售名称": "sales_name",
        "销售姓名": "sales_name",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    for col in ["sales_id", "sales_group", "sales_name"]:
        if col not in df.columns:
            df[col] = ""

    df = df[["sales_id", "sales_group", "sales_name"]].copy()
    df["sales_id"] = df["sales_id"].apply(to_clean_str)
    df["sales_group"] = df["sales_group"].apply(to_clean_str)
    df["sales_name"] = df["sales_name"].apply(to_clean_str)

    return df.drop_duplicates(subset=["sales_id"], keep="last")


def add_sales_name(df, sales_map, id_col="sales_id"):
    if df.empty or sales_map.empty or id_col not in df.columns:
        return df

    df = df.copy()
    df[id_col] = df[id_col].apply(to_clean_str)

    sm = sales_map.copy()
    sm["sales_id"] = sm["sales_id"].apply(to_clean_str)

    df = df.merge(
        sm,
        left_on=id_col,
        right_on="sales_id",
        how="left",
        suffixes=("", "_map"),
    )

    if "sales_id_map" in df.columns:
        df = df.drop(columns=["sales_id_map"])

    return df


def dedup_by_latest(df, subset, time_col=None):
    if df.empty:
        return df

    df = df.copy()

    for col in subset:
        if col not in df.columns:
            df[col] = ""

    if time_col and time_col in df.columns:
        df["_dedup_dt"] = pd.to_datetime(df[time_col], errors="coerce")
        df = df.sort_values("_dedup_dt", ascending=True, na_position="first")
        df = df.drop_duplicates(subset=subset, keep="last")
        df = df.drop(columns=["_dedup_dt"], errors="ignore")
    else:
        df = df.drop_duplicates(subset=subset, keep="last")

    return df


def transform_leads(full_df, sales_map):
    final_cols = FINAL_COLS["分配记录"]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "stu_id": "user_id",
        "学员ID": "user_id",
        "学生id": "user_id",
        "用户ID": "user_id",
        "new_admin_id": "sales_id",
        "销售ID": "sales_id",
        "负责人": "sales_id",
        "admin_id": "sales_id",
        "add_time": "assigned_time",
        "分配时间": "assigned_time",
        "desc": "lead_source",
        "线索来源": "lead_source",
        "线索状态": "lead_source",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    for col in ["user_id", "sales_id", "assigned_time", "lead_source"]:
        if col not in df.columns:
            df[col] = ""

    df["user_id"] = df["user_id"].apply(normalize_user_id)
    df["sales_id"] = df["sales_id"].apply(to_clean_str)
    df["assigned_time"] = df["assigned_time"].apply(to_clean_str)
    df["lead_source"] = df["lead_source"].apply(to_clean_str)

    df = add_sales_name(df, sales_map, id_col="sales_id")

    for col in ["sales_name", "sales_group"]:
        if col not in df.columns:
            df[col] = ""

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    return df[final_cols].fillna("").astype(str)


def final_dedup_leads(df):
    final_cols = FINAL_COLS["分配记录"]

    if df.empty:
        return pd.DataFrame(columns=final_cols)

    df = df.copy()

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    df = df[final_cols].fillna("").astype(str)

    df["user_id"] = df["user_id"].apply(normalize_user_id)
    df["assigned_time"] = df["assigned_time"].apply(to_clean_str)
    df["_assigned_dt"] = pd.to_datetime(df["assigned_time"], errors="coerce")

    df = df.sort_values(
        by=["user_id", "_assigned_dt"],
        ascending=[True, True],
        na_position="first",
    )

    df["reassign_sequence"] = df.groupby("user_id", dropna=False).cumcount() + 1

    stat = (
        df.groupby("user_id", dropna=False)
        .agg(
            assign_count=("user_id", "size"),
            first_assigned_time=("_assigned_dt", "min"),
            latest_assigned_time=("_assigned_dt", "max"),
        )
        .reset_index()
    )

    stat["is_reassigned"] = stat["assign_count"] > 1

    base_cols = [
        c for c in df.columns
        if c not in [
            "assign_count",
            "is_reassigned",
            "first_assigned_time",
            "latest_assigned_time",
            "_assigned_dt",
        ]
    ]

    latest = df[base_cols].drop_duplicates(subset=["user_id"], keep="last")
    latest = latest.merge(stat, on="user_id", how="left")

    latest["first_assigned_time"] = latest["first_assigned_time"].astype(str).replace("NaT", "")
    latest["latest_assigned_time"] = latest["latest_assigned_time"].astype(str).replace("NaT", "")
    latest["is_reassigned"] = latest["is_reassigned"].map({True: "TRUE", False: "FALSE"})

    for col in final_cols:
        if col not in latest.columns:
            latest[col] = ""

    return latest[final_cols].fillna("").astype(str)


def transform_trials(full_df, sales_map):
    final_cols = FINAL_COLS["课程记录"]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "ID": "id",
        "id": "id",
        "课程名称": "course_name",
        "上课时间（北京）": "start_time_bj",
        "上课时间（沙特）": "class_start_ksa",
        "预约类型": "booking_type",
        "课程类型": "course_type",
        "老师名称": "teacher_name",
        "老师id": "teacher_id",
        "学生名称": "student_name",
        "学生id": "user_id",
        "51talk预约id": "booking_id_51",
        "merithubId": "merithub_id",
        "课程状态": "class_status",
        "预约上课教材": "textbook",
        "约课时间": "booked_at",
        "销售ID": "agent_id",
        "上课时长": "duration_minutes",
        "是否成交": "is_ordered",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    if "实际上课教材" in df.columns:
        df = df.drop(columns=["实际上课教材"])

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    df["id"] = df["id"].apply(to_clean_str)
    df["user_id"] = df["user_id"].apply(normalize_user_id)
    df["agent_id"] = df["agent_id"].apply(to_clean_str)

    return df[final_cols].fillna("").astype(str)


def transform_orders(full_df):
    final_cols = FINAL_COLS["订单记录"]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "订单号": "order_id",
        "用户": "user_name",
        "学员ID": "user_id",
        "业绩归属销售": "sales_name_raw",
        "业绩归属销售组": "sales_group",
        "总金额(套餐定价币种)": "original_price",
        "定价币种支付金额": "paid_amount",
        "套餐内容": "package_name",
        "订单时间": "order_time",
        "支付方式": "payment_method",
        "支付币种": "pay_currency",
        "优惠金额(支付币种优惠金额)": "discount_amount",
        "订单状态": "order_status",
        "处理时间": "processed_time",
        "搜索词": "search_keyword",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    df["order_id"] = df["order_id"].apply(to_clean_str)
    df["user_id"] = df["user_id"].apply(normalize_user_id)

    return df[final_cols].fillna("").astype(str)


def split_call_user(value):
    text = to_clean_str(value)
    m = re.match(r"^(.*?)\s*\((\d+)\)", text)

    if m:
        return m.group(1).strip(), m.group(2).strip()

    uid = normalize_user_id(text)
    return text, uid


def parse_duration_to_sec(value):
    text = to_clean_str(value)

    if not text:
        return ""

    m = re.search(r"(\d{1,2}):(\d{2}):(\d{2})", text)
    if not m:
        return text

    h, mi, s = map(int, m.groups())
    return str(h * 3600 + mi * 60 + s)


def transform_calls(full_df):
    final_cols = FINAL_COLS["通话记录"]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "客户": "customer_raw",
        "客户信息": "customer_raw",
        "用户": "customer_raw",
        "学员": "customer_raw",
        "坐席": "sales_name",
        "销售": "sales_name",
        "坐席工号": "seat_id",
        "外呼时间": "outbound_time",
        "通话时间": "outbound_time",
        "拨打时间": "outbound_time",
        "接通时长": "connect_time_sec",
        "通话时长": "call_duration_sec",
        "振铃时长": "ring_duration_sec",
        "接通状态": "call_status",
        "通话状态": "call_status",
        "录音": "recording_url",
        "录音链接": "recording_url",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    if "customer_raw" in df.columns:
        parsed = df["customer_raw"].apply(split_call_user)
        df["user_id"] = parsed.apply(lambda x: x[1])

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    df["user_id"] = df["user_id"].apply(normalize_user_id)
    df["outbound_time"] = df["outbound_time"].apply(to_clean_str)

    for col in ["connect_time_sec", "call_duration_sec", "ring_duration_sec"]:
        df[col] = df[col].apply(parse_duration_to_sec)

    return df[final_cols].fillna("").astype(str)


OUTPUT_FILES = {
    "分配记录": "fact_leads.csv",
    "课程记录": "fact_trials.csv",
    "订单记录": "fact_orders.csv",
    "通话记录": "fact_calls.csv",
}


FINAL_COLS = {
    "分配记录": [
        "user_id",
        "sales_id",
        "sales_name",
        "sales_group",
        "assigned_time",
        "lead_source",
        "assign_count",
        "is_reassigned",
        "first_assigned_time",
        "latest_assigned_time",
        "reassign_sequence",
    ],
    "课程记录": [
        "id",
        "course_name",
        "start_time_bj",
        "class_start_ksa",
        "booking_type",
        "course_type",
        "teacher_name",
        "teacher_id",
        "student_name",
        "user_id",
        "booking_id_51",
        "merithub_id",
        "class_status",
        "textbook",
        "booked_at",
        "agent_id",
        "duration_minutes",
        "is_ordered",
    ],
    "订单记录": [
        "order_id",
        "user_name",
        "user_id",
        "sales_name_raw",
        "sales_group",
        "original_price",
        "paid_amount",
        "package_name",
        "order_time",
        "payment_method",
        "pay_currency",
        "discount_amount",
        "order_status",
        "processed_time",
        "search_keyword",
    ],
    "通话记录": [
        "user_id",
        "sales_name",
        "seat_id",
        "outbound_time",
        "connect_time_sec",
        "call_duration_sec",
        "ring_duration_sec",
        "call_status",
        "recording_url",
    ],
}


def apply_final_dedup(keyword, df):
    if df.empty:
        return df

    df = df.copy()

    if keyword == "分配记录":
        return final_dedup_leads(df)

    if keyword == "订单记录":
        return dedup_by_latest(df, subset=["order_id"], time_col="order_time")

    if keyword == "通话记录":
        return dedup_by_latest(df, subset=["user_id", "outbound_time"], time_col="outbound_time")

    if keyword == "课程记录":
        return dedup_by_latest(df, subset=["id"], time_col="booked_at")

    return df


def merge_existing_and_new(keyword, new_df):
    file_name = OUTPUT_FILES[keyword]
    final_cols = FINAL_COLS[keyword]

    old_df = read_existing_csv(file_name, final_cols)

    if new_df.empty and old_df.empty:
        return pd.DataFrame(columns=final_cols)

    combined = pd.concat([old_df, new_df], ignore_index=True)

    for col in final_cols:
        if col not in combined.columns:
            combined[col] = ""

    combined = combined[final_cols].fillna("").astype(str)

    final = apply_final_dedup(keyword, combined)

    for col in final_cols:
        if col not in final.columns:
            final[col] = ""

    return final[final_cols].fillna("").astype(str)


def sync_one(token, sheets, keyword, sales_map):
    log(f"\n\n========== START SYNC {keyword} ==========")

    targets = pick_target_sheet(sheets, keyword)

    if not targets:
        log(f"No T-1 target sheet found for {keyword}. Keep existing CSV unchanged.")
        existing = read_existing_csv(OUTPUT_FILES[keyword], FINAL_COLS[keyword])
        save_csv(existing, OUTPUT_FILES[keyword])
        return os.path.join(OUTPUT_DIR, OUTPUT_FILES[keyword])

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

    valid_dfs = [df for df in dfs if df is not None and not df.empty]
    full_df = pd.concat(valid_dfs, ignore_index=True) if valid_dfs else pd.DataFrame()

    if keyword == "分配记录":
        new_df = transform_leads(full_df, sales_map)
    elif keyword == "课程记录":
        new_df = transform_trials(full_df, sales_map)
    elif keyword == "订单记录":
        new_df = transform_orders(full_df)
    elif keyword == "通话记录":
        new_df = transform_calls(full_df)
    else:
        raise RuntimeError(f"Unknown keyword: {keyword}")

    final = merge_existing_and_new(keyword, new_df)

    output_path = save_csv(final, OUTPUT_FILES[keyword])
    return output_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(DEBUG_LOG, "w", encoding="utf-8") as f:
        f.write(f"Sync started at {datetime.now(ZoneInfo(SYNC_TZ))}\n")
        f.write(f"SYNC_TZ={SYNC_TZ}\n")
        f.write(f"TARGET_DATE={get_target_date()}\n")

    check_env()

    token = get_token()
    sheets = get_sheets(token)

    sales_map = load_sales_map_from_sheets(token, sheets)

    outputs = []

    for keyword in ["分配记录", "课程记录", "订单记录", "通话记录"]:
        output = sync_one(token, sheets, keyword, sales_map)
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
