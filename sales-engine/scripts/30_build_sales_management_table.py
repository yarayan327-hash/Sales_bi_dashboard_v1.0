import re
import pandas as pd
from pathlib import Path

ROOT = Path("/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0")

FACT_CALLS = ROOT / "public/data/fact_calls.csv"
AI_ANALYSIS = ROOT / "public/data/may_recording_ai_analysis.csv"
FACT_TRIALS = ROOT / "public/data/fact_trials.csv"
FACT_ORDERS = ROOT / "public/data/fact_orders.csv"
DIM_AGENTS = ROOT / "public/data/dim_agents.csv"

OUT_MAIN = ROOT / "public/data/may_sales_management_table.csv"
OUT_P0 = ROOT / "public/data/may_sales_p0_followup_list.csv"

# Current analysis window: May recording analysis table.
# Behavior layer uses full fact_calls, but only users covered by AI analysis are output.
ANALYSIS_MONTH = "2026-05"


def clean_id(x):
    s = str(x).strip().replace(".0", "")
    m = re.search(r"\((\d+)\)", s)
    if m:
        return m.group(1)
    m = re.search(r"\b(\d{5,})\b", s)
    return m.group(1) if m else s


def parse_dt(x):
    return pd.to_datetime(str(x).replace("/", "-"), errors="coerce")


def parse_trial_start(x):
    m = re.search(r"(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})", str(x))
    return pd.to_datetime(m.group(1), errors="coerce") if m else pd.NaT


def parse_trial_end(x):
    s = str(x)
    m = re.search(r"(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})", s)
    if not m:
        return pd.NaT

    date, start_t, end_t = m.groups()
    start_dt = pd.to_datetime(f"{date} {start_t}", errors="coerce")
    end_dt = pd.to_datetime(f"{date} {end_t}", errors="coerce")

    if pd.notna(start_dt) and pd.notna(end_dt) and end_dt < start_dt:
        end_dt = end_dt + pd.Timedelta(days=1)

    return end_dt


def safe_num(x):
    return pd.to_numeric(x, errors="coerce").fillna(0)


def mode_or_last(s):
    vals = [str(v).strip() for v in s if str(v).strip()]
    if not vals:
        return ""
    vc = pd.Series(vals).value_counts()
    return vc.index[0] if len(vc) else vals[-1]


def first_non_empty(s):
    for v in s:
        v = str(v).strip()
        if v:
            return v
    return ""


def last_non_empty(s):
    vals = [str(v).strip() for v in s if str(v).strip()]
    return vals[-1] if vals else ""


def normalize_call_status(x):
    return str(x or "").strip()


def is_connected_status(x):
    return normalize_call_status(x) == "双方接通"


def manager_action(row):
    if row.get("has_order") == "yes":
        return "ordered_review"

    if row.get("post_trial_followup_behavior") == "not_followed_after_trial":
        return "urgent_followup"

    if row.get("post_trial_followup_behavior") == "followed_after_trial_not_connected":
        return "retry_followup"

    if row.get("purchase_intent") in ["high", "medium"]:
        return "close_deal"

    if row.get("lead_quality") == "no_trial_or_not_aware":
        return "check_lead_quality"

    if str(row.get("fraud_risk", "")) not in ["", "normal", "unknown", "nan"]:
        return "check_call_fraud"

    if row.get("course_feedback") not in ["", "unknown", "nan"]:
        return "review_course_issue"

    if row.get("post_trial_followup_behavior") == "followed_after_trial_connected":
        return "review_followup_quality"

    return "normal_followup"


def priority(row):
    if row["manager_action"] in ["urgent_followup", "check_call_fraud", "close_deal"]:
        return "P0"

    if row["manager_action"] in [
        "retry_followup",
        "review_followup_quality",
        "review_course_issue",
        "check_lead_quality",
        "ordered_review",
    ]:
        return "P1"

    return "P2"


print("loading...")

calls = pd.read_csv(FACT_CALLS, dtype=str).fillna("")
ai = pd.read_csv(AI_ANALYSIS, dtype=str).fillna("")
trials = pd.read_csv(FACT_TRIALS, dtype=str).fillna("")
orders = pd.read_csv(FACT_ORDERS, dtype=str).fillna("")
agents = pd.read_csv(DIM_AGENTS, dtype=str).fillna("")

for df in [calls, ai, trials, orders]:
    if "user_id" in df.columns:
        df["user_id"] = df["user_id"].map(clean_id)

# compatible AI columns
for col in [
    "lead_quality",
    "attendance_intent",
    "purchase_intent",
    "followup_issue",
    "course_feedback",
    "fraud_risk",
    "next_action",
    "summary_ar",
    "main_objection",
    "payment_blocker",
    "call_stage",
]:
    if col not in ai.columns:
        ai[col] = ""

agents["sales_key"] = agents["sales_name"].astype(str).str.strip().str.lower()
group_map = dict(zip(agents["sales_key"], agents["sales_group"]))

# ---------- AI semantic layer ----------
print("building semantic layer...")

ai_time_col = "outbound_time" if "outbound_time" in ai.columns else "call_time"
ai["ai_call_dt"] = ai[ai_time_col].map(parse_dt)
ai["sales_key"] = ai["sales_name"].astype(str).str.strip().str.lower()
ai["sales_group_ai"] = ai["sales_key"].map(group_map).fillna(ai.get("sales_group", ""))

analysis_min = ai["ai_call_dt"].min()
analysis_max = ai["ai_call_dt"].max()

semantic = ai.sort_values("ai_call_dt").groupby("user_id", as_index=False).agg(
    sales_name=("sales_name", last_non_empty),
    sales_group=("sales_group_ai", last_non_empty),
    ai_first_call_time=(ai_time_col, "min"),
    ai_last_call_time=(ai_time_col, "max"),
    ai_recording_call_count=("user_id", "count"),
    ai_connected_recording_count=("call_status", lambda x: int((x.astype(str).str.strip() == "双方接通").sum())),
    lead_quality=("lead_quality", mode_or_last),
    attendance_intent=("attendance_intent", mode_or_last),
    purchase_intent=("purchase_intent", mode_or_last),
    ai_followup_issue=("followup_issue", mode_or_last),
    course_feedback=("course_feedback", mode_or_last),
    fraud_risk=("fraud_risk", mode_or_last),
    next_action=("next_action", mode_or_last),
    call_stage=("call_stage", mode_or_last),
    main_objection=("main_objection", mode_or_last),
    payment_blocker=("payment_blocker", mode_or_last),
    summary_ar=("summary_ar", lambda x: " | ".join([str(v) for v in x.tail(2) if str(v).strip()])[:1500]),
)

# ---------- Trial layer ----------
print("building trial layer...")

trials["trial_start_ksa_dt"] = trials["class_start_ksa"].map(parse_trial_start)
trials["trial_end_ksa_dt"] = trials["class_start_ksa"].map(parse_trial_end)

# Avoid old trial pollution. Use trials around analysis window.
trials_win = trials[
    trials["trial_start_ksa_dt"].notna()
    & (trials["trial_start_ksa_dt"] >= analysis_min - pd.Timedelta(days=7))
    & (trials["trial_start_ksa_dt"] <= analysis_max + pd.Timedelta(days=2))
].copy()

trial_latest = (
    trials_win.sort_values("trial_start_ksa_dt")
    .drop_duplicates("user_id", keep="last")
    [[
        "user_id",
        "class_start_ksa",
        "class_status",
        "trial_start_ksa_dt",
        "trial_end_ksa_dt",
    ]]
)

# ---------- Order layer ----------
print("building order layer...")

orders["order_dt"] = orders["processed_time"].map(parse_dt)
orders["paid_amount_num"] = pd.to_numeric(
    orders.get("paid_amount", "0").astype(str).str.replace(r"[^0-9.]", "", regex=True),
    errors="coerce",
).fillna(0)

orders_win = orders[
    orders["order_dt"].notna()
    & (orders["order_dt"] >= analysis_min - pd.Timedelta(days=1))
    & (orders["order_dt"] <= analysis_max + pd.Timedelta(days=2))
].copy()

order_user = orders_win.groupby("user_id", as_index=False).agg(
    paid_amount=("paid_amount_num", "sum"),
    processed_time=("processed_time", "max"),
    order_count=("user_id", "count"),
)
order_user["has_order"] = "yes"

# ---------- Behavior layer from FULL fact_calls ----------
print("building behavior layer from full fact_calls...")

calls["call_bj_dt"] = calls["outbound_time"].map(parse_dt)
calls["call_ksa_dt"] = calls["call_bj_dt"] - pd.Timedelta(hours=5)
calls["is_connected"] = calls["call_status"].map(is_connected_status)

# Keep calls within wider useful window.
calls_win = calls[
    calls["call_bj_dt"].notna()
    & (calls["call_ksa_dt"] >= analysis_min - pd.Timedelta(days=7))
    & (calls["call_ksa_dt"] <= analysis_max + pd.Timedelta(days=7))
].copy()

behavior_all = calls_win.groupby("user_id", as_index=False).agg(
    full_first_call_time=("outbound_time", "min"),
    full_last_call_time=("outbound_time", "max"),
    full_call_count=("user_id", "count"),
    full_connected_call_count=("is_connected", "sum"),
)

# ---------- Merge base ----------
print("merging layers...")

df = semantic.merge(trial_latest, on="user_id", how="left")
df = df.merge(order_user, on="user_id", how="left")
df = df.merge(behavior_all, on="user_id", how="left")

df["has_order"] = df["has_order"].fillna("no")
df["paid_amount"] = df["paid_amount"].fillna(0)
df["order_count"] = df["order_count"].fillna(0)
df["full_call_count"] = df["full_call_count"].fillna(0).astype(int)
df["full_connected_call_count"] = df["full_connected_call_count"].fillna(0).astype(int)

# post-trial behavior per user using FULL fact_calls
df["post_trial_call_count"] = 0
df["post_trial_connected_call_count"] = 0
df["first_post_trial_call_bj"] = ""
df["first_post_trial_call_ksa"] = ""
df["first_post_trial_connected_call_bj"] = ""
df["first_post_trial_connected_call_ksa"] = ""
df["minutes_to_first_post_trial_call"] = ""
df["minutes_to_first_post_trial_connected_call"] = ""

for idx, row in df.iterrows():
    uid = row["user_id"]
    end_dt = row["trial_end_ksa_dt"]

    if pd.isna(end_dt):
        continue

    uc = calls_win[
        (calls_win["user_id"] == uid)
        & (calls_win["call_ksa_dt"].notna())
        & (calls_win["call_ksa_dt"] > end_dt)
    ].sort_values("call_ksa_dt")

    if len(uc):
        first = uc.iloc[0]
        df.at[idx, "post_trial_call_count"] = len(uc)
        df.at[idx, "first_post_trial_call_bj"] = str(first["outbound_time"])
        df.at[idx, "first_post_trial_call_ksa"] = str(first["call_ksa_dt"])
        df.at[idx, "minutes_to_first_post_trial_call"] = round((first["call_ksa_dt"] - end_dt).total_seconds() / 60, 1)

    ucc = uc[uc["is_connected"]].sort_values("call_ksa_dt")
    if len(ucc):
        firstc = ucc.iloc[0]
        df.at[idx, "post_trial_connected_call_count"] = len(ucc)
        df.at[idx, "first_post_trial_connected_call_bj"] = str(firstc["outbound_time"])
        df.at[idx, "first_post_trial_connected_call_ksa"] = str(firstc["call_ksa_dt"])
        df.at[idx, "minutes_to_first_post_trial_connected_call"] = round((firstc["call_ksa_dt"] - end_dt).total_seconds() / 60, 1)

df["post_trial_followup_behavior"] = "not_applicable"

df.loc[
    (df["class_status"] == "end")
    & (pd.to_numeric(df["post_trial_connected_call_count"], errors="coerce").fillna(0) > 0),
    "post_trial_followup_behavior",
] = "followed_after_trial_connected"

df.loc[
    (df["class_status"] == "end")
    & (pd.to_numeric(df["post_trial_connected_call_count"], errors="coerce").fillna(0) == 0)
    & (pd.to_numeric(df["post_trial_call_count"], errors="coerce").fillna(0) > 0),
    "post_trial_followup_behavior",
] = "followed_after_trial_not_connected"

df.loc[
    (df["class_status"] == "end")
    & (pd.to_numeric(df["post_trial_call_count"], errors="coerce").fillna(0) == 0),
    "post_trial_followup_behavior",
] = "not_followed_after_trial"

# final followup_issue from behavior layer, not AI.
df["followup_issue"] = df["ai_followup_issue"].fillna("")

df.loc[
    df["post_trial_followup_behavior"].eq("followed_after_trial_connected"),
    "followup_issue",
] = "followed_after_trial_connected"

df.loc[
    df["post_trial_followup_behavior"].eq("followed_after_trial_not_connected"),
    "followup_issue",
] = "followed_after_trial_not_connected"

df.loc[
    df["post_trial_followup_behavior"].eq("not_followed_after_trial") & (df["has_order"] != "yes"),
    "followup_issue",
] = "not_followed_after_trial"

# Non-attended / canceled classes should not be labeled as post-trial no-followup.
df.loc[
    df["class_status"].astype(str).str.strip().ne("end")
    & df["followup_issue"].eq("not_followed_after_trial"),
    "followup_issue"
] = "no_post_trial_followup_required"

df["manager_action"] = df.apply(manager_action, axis=1)
df["priority"] = df.apply(priority, axis=1)

cols = [
    "user_id",
    "sales_group",
    "sales_name",

    "ai_first_call_time",
    "ai_last_call_time",
    "ai_recording_call_count",
    "ai_connected_recording_count",

    "full_first_call_time",
    "full_last_call_time",
    "full_call_count",
    "full_connected_call_count",

    "class_start_ksa",
    "class_status",

    "post_trial_call_count",
    "post_trial_connected_call_count",
    "first_post_trial_call_bj",
    "first_post_trial_call_ksa",
    "first_post_trial_connected_call_bj",
    "first_post_trial_connected_call_ksa",
    "minutes_to_first_post_trial_call",
    "minutes_to_first_post_trial_connected_call",

    "processed_time",
    "paid_amount",
    "order_count",
    "has_order",

    "lead_quality",
    "attendance_intent",
    "purchase_intent",
    "call_stage",
    "main_objection",
    "payment_blocker",
    "ai_followup_issue",
    "followup_issue",
    "post_trial_followup_behavior",
    "course_feedback",
    "fraud_risk",
    "next_action",
    "manager_action",
    "priority",
    "summary_ar",
]

for c in cols:
    if c not in df.columns:
        df[c] = ""

df = df[cols].sort_values(["priority", "manager_action", "full_call_count"], ascending=[True, True, False])

OUT_MAIN.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT_MAIN, index=False)

# P0 export
p0 = df[df["priority"] == "P0"].copy()
p0_cols = [
    "user_id",
    "sales_group",
    "sales_name",
    "class_start_ksa",
    "class_status",
    "post_trial_call_count",
    "post_trial_connected_call_count",
    "first_post_trial_call_bj",
    "first_post_trial_connected_call_bj",
    "minutes_to_first_post_trial_connected_call",
    "has_order",
    "lead_quality",
    "purchase_intent",
    "followup_issue",
    "post_trial_followup_behavior",
    "next_action",
    "manager_action",
    "summary_ar",
]
p0[p0_cols].to_csv(OUT_P0, index=False)

print("DONE")
print("output:", OUT_MAIN)
print("p0:", OUT_P0)
print("rows:", len(df))
print("analysis window:", analysis_min, "~", analysis_max)

print("\npriority:")
print(df["priority"].value_counts().to_string())

print("\nmanager_action:")
print(df["manager_action"].value_counts().to_string())

print("\npost_trial_followup_behavior:")
print(df["post_trial_followup_behavior"].value_counts().to_string())

print("\nfollowup_issue:")
print(df["followup_issue"].value_counts().to_string())
