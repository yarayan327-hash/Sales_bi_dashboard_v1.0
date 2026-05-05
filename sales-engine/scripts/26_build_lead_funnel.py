import re
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public/data"

LEADS = DATA / "fact_lead_source.csv"
TRIALS = DATA / "fact_trials.csv"
ORDERS = DATA / "fact_orders.csv"

OUT_SUMMARY = DATA / "lead_source_funnel_summary.csv"
OUT_DETAIL = DATA / "lead_source_funnel_detail.csv"
OUT_JSON = DATA / "lead_source_funnel_summary.json"

KSA_TZ = timezone(timedelta(hours=3))
NOW = datetime.now(KSA_TZ)
MONTH = NOW.strftime("%Y-%m")


def read_csv(path):
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str).fillna("")


def parse_dt(s):
    if isinstance(s, pd.Series):
        x = s.astype(str).str.extract(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)", expand=False)
        return pd.to_datetime(x, errors="coerce")
    m = re.search(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)", str(s or ""))
    return pd.to_datetime(m.group(1), errors="coerce") if m else pd.NaT


def clean_user_id(s):
    return str(s).strip().replace(".0", "")


def money_to_float(x):
    if pd.isna(x):
        return 0.0
    m = re.search(r"-?\d+(?:\.\d+)?", str(x).replace(",", ""))
    return float(m.group(0)) if m else 0.0


def normalize_source(row):
    source = str(row.get("source", "")).strip().upper()
    source_code = str(row.get("source_code", "")).strip()

    if source == "REF" or source_code == "2":
        return "REF"

    reg = row.get("register_time_dt")
    disp = row.get("dispatch_time_dt")

    if pd.notna(reg) and pd.notna(disp):
        diff_days = (disp - reg).total_seconds() / 86400
        if 0 <= diff_days <= 3:
            return "MKT"

    return "Public Pool"


def is_success_order(status):
    s = str(status).strip().lower()
    return s in {"已成功", "succeeded", "success", "paid", "completed"}


def main():
    leads = read_csv(LEADS)
    trials = read_csv(TRIALS)
    orders = read_csv(ORDERS)

    if leads.empty:
        raise SystemExit("fact_lead_source.csv is empty or missing")

    leads["user_id"] = leads["user_id"].map(clean_user_id)
    leads["register_time_dt"] = parse_dt(leads.get("register_time", ""))
    leads["dispatch_time_dt"] = parse_dt(leads.get("dispatch_time", ""))
    leads["register_month"] = leads["register_time_dt"].dt.strftime("%Y-%m")
    leads["is_register_current_month"] = leads["register_month"] == MONTH
    leads["lead_source_type"] = leads.apply(normalize_source, axis=1)

    # one row per user, keep latest dispatch/register info
    leads = leads.sort_values(
        by=["register_time_dt", "dispatch_time_dt"],
        ascending=[False, False],
        na_position="last",
    ).drop_duplicates(subset=["user_id"], keep="first")

    if not trials.empty:
        trials["user_id"] = trials["user_id"].map(clean_user_id)
        trials["class_start_dt"] = parse_dt(trials.get("class_start_ksa", ""))
        trials["trial_month"] = trials["class_start_dt"].dt.strftime("%Y-%m")
        trials_m = trials[trials["trial_month"] == MONTH].copy()
    else:
        trials_m = pd.DataFrame()

    if not orders.empty:
        orders["user_id"] = orders["user_id"].map(clean_user_id)
        orders["order_time_dt"] = parse_dt(orders.get("order_time", ""))
        orders["order_month"] = orders["order_time_dt"].dt.strftime("%Y-%m")
        orders["paid_amount_num"] = orders.get("paid_amount", "").map(money_to_float)
        orders_m = orders[
            (orders["order_month"] == MONTH)
            & (orders.get("order_status", "").map(is_success_order))
        ].copy()
    else:
        orders_m = pd.DataFrame()

    booked_users = set(trials_m["user_id"]) if not trials_m.empty else set()
    attended_users = set(trials_m[trials_m["class_status"].eq("end")]["user_id"]) if not trials_m.empty else set()

    if not orders_m.empty:
        order_user_set = set(orders_m["user_id"])
        order_user_count = orders_m.groupby("user_id")["order_id"].nunique().to_dict()
        order_amount = orders_m.groupby("user_id")["paid_amount_num"].sum().to_dict()
    else:
        order_user_set = set()
        order_user_count = {}
        order_amount = {}

    leads["has_booking_this_month"] = leads["user_id"].isin(booked_users).astype(int)
    leads["has_attended_this_month"] = leads["user_id"].isin(attended_users).astype(int)
    leads["has_order_this_month"] = leads["user_id"].isin(order_user_set).astype(int)
    leads["order_count_this_month"] = leads["user_id"].map(lambda x: int(order_user_count.get(x, 0)))
    leads["gmv_this_month"] = leads["user_id"].map(lambda x: float(order_amount.get(x, 0.0)))

    detail_cols = [
        "user_id", "student_name", "source", "source_code", "lead_source_type",
        "register_time", "dispatch_time", "sales_name", "sales_group",
        "pay_intention", "last_free_status", "call_status",
        "is_register_current_month",
        "has_booking_this_month", "has_attended_this_month",
        "has_order_this_month", "order_count_this_month", "gmv_this_month",
    ]
    for c in detail_cols:
        if c not in leads.columns:
            leads[c] = ""

    detail = leads[detail_cols].copy()
    detail.to_csv(OUT_DETAIL, index=False)

    rows = []

    current = leads[leads["is_register_current_month"]].copy()
    for source_type in ["MKT", "REF", "Public Pool"]:
        df = current[current["lead_source_type"] == source_type]
        lead_count = df["user_id"].nunique()
        booked = int(df["has_booking_this_month"].sum())
        attended = int(df["has_attended_this_month"].sum())
        order_users = int(df["has_order_this_month"].sum())
        order_count = int(df["order_count_this_month"].sum())
        gmv = float(df["gmv_this_month"].sum())

        rows.append({
            "month": MONTH,
            "segment": source_type,
            "lead_scope": "current_month_registered",
            "leads": lead_count,
            "booked_users": booked,
            "attended_users": attended,
            "order_users": order_users,
            "order_count": order_count,
            "gmv": round(gmv, 2),
            "booking_rate": round(booked / lead_count, 4) if lead_count else 0,
            "attendance_rate": round(attended / booked, 4) if booked else 0,
            "attended_to_order_rate": round(order_users / attended, 4) if attended else 0,
            "lead_to_order_rate": round(order_users / lead_count, 4) if lead_count else 0,
        })

    # Non-current month conversion amount:
    # all successful orders this month minus orders from users registered this month.
    current_month_users = set(current["user_id"])
    if not orders_m.empty:
        non_current_orders = orders_m[~orders_m["user_id"].isin(current_month_users)].copy()
        non_current_order_users = non_current_orders["user_id"].nunique()
        non_current_order_count = non_current_orders["order_id"].nunique() if "order_id" in non_current_orders.columns else len(non_current_orders)
        non_current_gmv = float(non_current_orders["paid_amount_num"].sum())
    else:
        non_current_order_users = 0
        non_current_order_count = 0
        non_current_gmv = 0.0

    rows.append({
        "month": MONTH,
        "segment": "Non-current Month Leads",
        "lead_scope": "not_current_month_registered_but_ordered_this_month",
        "leads": "",
        "booked_users": "",
        "attended_users": "",
        "order_users": non_current_order_users,
        "order_count": non_current_order_count,
        "gmv": round(non_current_gmv, 2),
        "booking_rate": "",
        "attendance_rate": "",
        "attended_to_order_rate": "",
        "lead_to_order_rate": "",
    })

    summary = pd.DataFrame(rows)
    summary.to_csv(OUT_SUMMARY, index=False)

    OUT_JSON.write_text(
        json.dumps(
            {
                "generated_at_ksa": NOW.strftime("%Y-%m-%d %H:%M:%S"),
                "month": MONTH,
                "summary": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    print("✅ lead source funnel generated")
    print("summary:", OUT_SUMMARY)
    print("detail:", OUT_DETAIL)
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
