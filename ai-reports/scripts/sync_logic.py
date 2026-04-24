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


def parse_dt(value):
    return pd.to_datetime(value, errors="coerce")


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


def transform_leads(full_df, sales_map):
    final_cols = [
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
    ]

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
    df["_assigned_dt"] = parse_dt(df["assigned_time"])

    df = add_sales_name(df, sales_map, id_col="sales_id")

    if "sales_name" not in df.columns:
        df["sales_name"] = ""
    if "sales_group" not in df.columns:
        df["sales_group"] = ""

    df = df.sort_values(
        by=["user_id", "_assigned_dt"],
        ascending=[True, True],
        na_position="last",
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

    latest = df.drop_duplicates(subset=["user_id"], keep="last").copy()
    latest = latest.merge(stat, on="user_id", how="left")

    latest["first_assigned_time"] = latest["first_assigned_time"].astype(str).replace("NaT", "")
    latest["latest_assigned_time"] = latest["latest_assigned_time"].astype(str).replace("NaT", "")
    latest["is_reassigned"] = latest["is_reassigned"].map({True: "TRUE", False: "FALSE"})

    for col in final_cols:
        if col not in latest.columns:
            latest[col] = ""

    return latest[final_cols].fillna("").astype(str)


def transform_trials(full_df, sales_map):
    final_cols = [
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
        "sales_name",
        "sales_group",
        "duration_minutes",
        "is_ordered",
    ]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "ID": "id",
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

    df["user_id"] = df["user_id"].apply(normalize_user_id)
    df["agent_id"] = df["agent_id"].apply(to_clean_str)

    df = add_sales_name(df, sales_map, id_col="agent_id")

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    return df[final_cols].fillna("").astype(str)


def transform_orders(full_df):
    final_cols = [
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
        "discount_type",
        "discount_amount",
        "order_status",
        "processed_time",
        "processed_by",
        "search_keyword",
    ]

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
        "优惠方式": "discount_type",
        "优惠金额(支付币种优惠金额)": "discount_amount",
        "订单状态": "order_status",
        "处理时间": "processed_time",
        "处理人": "processed_by",
        "搜索词": "search_keyword",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

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
        return ""

    h, mi, s = map(int, m.groups())
    return str(h * 3600 + mi * 60 + s)


def transform_calls(full_df):
    final_cols = [
        "user_name",
        "user_id",
        "phone",
        "sales_name",
        "seat_id",
        "channel",
        "outbound_time",
        "call_status",
        "connect_time_sec",
        "call_duration_sec",
        "ring_duration_sec",
        "recording_url",
    ]

    if full_df.empty:
        return pd.DataFrame(columns=final_cols)

    df = normalize_columns(full_df)

    rename_map = {
        "客户": "customer_raw",
        "客户信息": "customer_raw",
        "用户": "customer_raw",
        "学员": "customer_raw",

        "手机号": "phone",
        "手机": "phone",

        "坐席": "seat_id",
        "坐席工号": "seat_id",
        "销售": "sales_name",

        "外呼渠道": "channel",
        "渠道": "channel",

        "外呼时间": "outbound_time",
        "通话时间": "outbound_time",
        "拨打时间": "outbound_time",

        "接通状态": "call_status",
        "通话状态": "call_status",

        "接通时长": "connect_time_sec",
        "通话时长": "call_duration_sec",
        "振铃时长": "ring_duration_sec",

        "录音": "recording_url",
        "录音链接": "recording_url",
        "recording_url": "recording_url",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    if "customer_raw" in df.columns:
        parsed = df["customer_raw"].apply(split_call_user)
        df["user_name"] = parsed.apply(lambda x: x[0])
        df["user_id"] = parsed.apply(lambda x: x[1])

    # 兼容一些导出时直接已有英文列的情况
    if "user_id" in df.columns:
        df["user_id"] = df["user_id"].apply(normalize_user_id)

    for col in final_cols:
        if col not in df.columns:
            df[col] = ""

    # 如果时长字段是 0:00:00，统一转秒；如果已经是数字，保留
    for col in ["connect_time_sec", "call_duration_sec", "ring_duration_sec"]:
        df[col] = df[col].apply(
            lambda x: parse_duration_to_sec(x) if ":" in to_clean_str(x) else to_clean_str(x)
        )

    return df[final_cols].fillna("").astype(str)


TRANSFORMERS = {
    "分配记录": transform_leads,
    "课程记录": transform_trials,
    "订单记录": transform_orders,
    "通话记录": transform_calls,
}


OUTPUT_FILES = {
    "分配记录": "fact_leads.csv",
    "课程记录": "fact_trials.csv",
    "订单记录": "fact_orders.csv",
    "通话记录": "fact_calls.csv",
}


def sync_one(token, sheets, keyword, sales_map):
    log(f"\n\n========== START SYNC {keyword} ==========")

    targets = pick_targets(sheets, keyword)
    dfs = []

    if not targets:
        log(f"No target sheets found for {keyword}")
    else:
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

    if keyword in ["分配记录", "课程记录"]:
        final = TRANSFORMERS[keyword](full_df, sales_map)
    else:
        final = TRANSFORMERS[keyword](full_df)

    output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILES[keyword])
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    final.to_csv(output_path, index=False, encoding="utf-8-sig")

    log(f"Saved {keyword} -> {output_path}, rows={len(final)}")
    log(f"Columns: {list(final.columns)}")

    return output_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(DEBUG_LOG, "w", encoding="utf-8") as f:
        f.write(f"Sync started at {datetime.now()}\n")

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
