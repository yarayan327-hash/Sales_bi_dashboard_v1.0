import pandas as pd
from pathlib import Path
import re

ROOT = Path("/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0")
AI = ROOT / "public/data/may_recording_ai_analysis.csv"
TRIALS = ROOT / "public/data/fact_trials.csv"
ORDERS = ROOT / "public/data/fact_orders.csv"
AGENTS = ROOT / "public/data/dim_agents.csv"
OUT = ROOT / "public/data/may_sales_management_table.csv"

def clean_id(x):
    s = str(x).strip().replace(".0", "")
    m = re.search(r"\((\d+)\)", s)
    return m.group(1) if m else s

def parse_dt(x):
    return pd.to_datetime(str(x).replace("/", "-"), errors="coerce")

def parse_trial_dt(x):
    m = re.search(r"(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})", str(x))
    return pd.to_datetime(m.group(1), errors="coerce") if m else pd.NaT

def mode_or_last(s):
    vals = [str(v).strip() for v in s if str(v).strip()]
    if not vals:
        return ""
    vc = pd.Series(vals).value_counts()
    return vc.index[0]

ai = pd.read_csv(AI, dtype=str).fillna("")
trials = pd.read_csv(TRIALS, dtype=str).fillna("")
orders = pd.read_csv(ORDERS, dtype=str).fillna("")
agents = pd.read_csv(AGENTS, dtype=str).fillna("")

# Compatible columns: older rule-based table may not have all AI fields
for col in [
    "attendance_intent",
    "purchase_intent",
    "lead_quality",
    "followup_issue",
    "course_feedback",
    "fraud_risk",
    "next_action",
    "summary_ar",
]:
    if col not in ai.columns:
        ai[col] = ""

for df in [ai, trials, orders]:
    df["user_id"] = df["user_id"].map(clean_id)

agents["sales_key"] = agents["sales_name"].astype(str).str.strip().str.lower()
group_map = dict(zip(agents["sales_key"], agents["sales_group"]))

time_col = "outbound_time" if "outbound_time" in ai.columns else "call_time"
ai["call_dt"] = ai[time_col].map(parse_dt)
ai["sales_key"] = ai["sales_name"].astype(str).str.strip().str.lower()
ai["sales_group_fixed"] = ai["sales_key"].map(group_map).fillna(ai.get("sales_group", ""))

analysis_min = ai["call_dt"].min()
analysis_max = ai["call_dt"].max()

trials["trial_dt"] = trials["class_start_ksa"].map(parse_trial_dt)
trials_win = trials[
    trials["trial_dt"].notna()
    & (trials["trial_dt"] >= analysis_min - pd.Timedelta(days=7))
    & (trials["trial_dt"] <= analysis_max + pd.Timedelta(days=1))
].copy()

trial_latest = (
    trials_win.sort_values("trial_dt")
    .drop_duplicates("user_id", keep="last")
    [["user_id", "class_start_ksa", "class_status"]]
)

orders["order_dt"] = orders["processed_time"].map(parse_dt)
orders["paid_amount_num"] = pd.to_numeric(
    orders["paid_amount"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
    errors="coerce"
).fillna(0)

orders_win = orders[
    orders["order_dt"].notna()
    & (orders["order_dt"] >= analysis_min)
    & (orders["order_dt"] <= analysis_max + pd.Timedelta(days=1))
].copy()

order_user = orders_win.groupby("user_id", as_index=False).agg(
    paid_amount=("paid_amount_num", "sum"),
    processed_time=("processed_time", "max"),
    order_count=("user_id", "count"),
)
order_user["has_order"] = "yes"

agg = ai.sort_values("call_dt").groupby("user_id", as_index=False).agg(
    sales_name=("sales_name", "last"),
    sales_group=("sales_group_fixed", "last"),
    first_call_time=(time_col, "min"),
    last_call_time=(time_col, "max"),
    call_count=("user_id", "count"),
    connected_call_count=("call_status", lambda x: (x.astype(str) == "双方接通").sum()),
    lead_quality=("lead_quality", mode_or_last),
    attendance_intent=("attendance_intent", mode_or_last),
    purchase_intent=("purchase_intent", mode_or_last),
    followup_issue=("followup_issue", mode_or_last),
    course_feedback=("course_feedback", mode_or_last),
    fraud_risk=("fraud_risk", mode_or_last),
    next_action=("next_action", mode_or_last),
    summary_ar=("summary_ar", lambda x: " | ".join([str(v) for v in x.tail(2) if str(v).strip()])[:1500]),
)

df = agg.merge(trial_latest, on="user_id", how="left")
df = df.merge(order_user, on="user_id", how="left")

df["has_order"] = df["has_order"].fillna("no")
df["paid_amount"] = df["paid_amount"].fillna(0)
df["order_count"] = df["order_count"].fillna(0)

def manager_action(r):
    if str(r.get("fraud_risk","")) not in ["", "normal", "unknown", "nan"]:
        return "check_call_fraud"
    if r.get("followup_issue") == "not_followed_after_trial":
        return "urgent_followup"
    if r.get("purchase_intent") in ["high", "medium"] and r.get("has_order") != "yes":
        return "close_deal"
    if r.get("course_feedback") not in ["", "unknown", "nan"]:
        return "review_course_issue"
    if r.get("lead_quality") == "no_trial_or_not_aware":
        return "check_lead_quality"
    return "normal_followup"

df["manager_action"] = df.apply(manager_action, axis=1)

def priority(r):
    if r["manager_action"] in ["check_call_fraud", "urgent_followup", "close_deal"]:
        return "P0"
    if r["manager_action"] in ["review_course_issue", "check_lead_quality"]:
        return "P1"
    return "P2"

df["priority"] = df.apply(priority, axis=1)

cols = [
    "user_id","sales_group","sales_name",
    "first_call_time","last_call_time","call_count","connected_call_count",
    "class_start_ksa","class_status",
    "processed_time","paid_amount","order_count","has_order",
    "lead_quality","attendance_intent","purchase_intent",
    "followup_issue","course_feedback","fraud_risk","next_action",
    "manager_action","priority","summary_ar"
]

df = df[cols].sort_values(["priority","call_count"], ascending=[True,False])
df.to_csv(OUT, index=False)

print("DONE")
print("output:", OUT)
print("rows:", len(df))
print("analysis window:", analysis_min, "~", analysis_max)
print(df["priority"].value_counts().to_string())
print(df["manager_action"].value_counts().to_string())
