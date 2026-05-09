import pandas as pd
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

INPUT = ROOT / "sales-engine/data/input/may_recording_analysis_pool.csv"
OUT = ROOT / "public/data/may_recording_ai_analysis.csv"

df = pd.read_csv(INPUT, dtype=str).fillna("")

def duration_sec(x):
    s = str(x)
    m = re.search(r'(\d+):(\d+):(\d+)', s)
    if not m:
        return 0
    return int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3))

def classify(row):
    status = str(row.get("call_status",""))
    dur = duration_sec(row.get("call_duration_sec",""))
    has_trial = row.get("has_trial","no")
    has_order = row.get("has_order","no")
    latest_trial_status = str(row.get("latest_trial_status",""))
    recording = str(row.get("recording_url",""))

    lead_quality = "unknown"
    fraud_risk = "normal"
    followup_issue = "no_issue"
    course_feedback = "unknown"
    next_action = "manual_review"

    # =========================
    # 假通时 / 语音邮箱
    # =========================

    if dur > 1200 and (
        "语音" in status
        or "留言" in status
        or "用户忙" in status
        or "未接" in status
    ):
        fraud_risk = "voicemail_long_duration"

    if dur > 1800:
        fraud_risk = "silent_long_duration"

    # =========================
    # 线索质量
    # =========================

    if has_trial == "no":
        lead_quality = "no_trial_or_not_aware"

    elif latest_trial_status in ["cancel","s_absent"]:
        lead_quality = "weak_need"

    elif latest_trial_status == "end":
        lead_quality = "good_need"

    # =========================
    # 订单
    # =========================

    if has_order == "yes":
        next_action = "renewal_followup"

    elif latest_trial_status == "end":
        followup_issue = "not_followed_after_trial"
        next_action = "close_payment"

    elif latest_trial_status in ["cancel","s_absent"]:
        next_action = "rebook_trial"

    # =========================
    # 满意度
    # =========================

    if latest_trial_status == "cancel":
        course_feedback = "schedule_issue"

    elif latest_trial_status == "s_absent":
        course_feedback = "low_interest"

    elif latest_trial_status == "end" and has_order == "no":
        course_feedback = "price_issue"

    return {
        "lead_quality": lead_quality,
        "fraud_risk": fraud_risk,
        "followup_issue": followup_issue,
        "course_feedback": course_feedback,
        "next_action": next_action,
    }

extra = df.apply(classify, axis=1, result_type="expand")

out = pd.concat([df, extra], axis=1)

risk_cols = [
    "lead_quality",
    "fraud_risk",
    "followup_issue",
    "course_feedback",
]

out["risk_summary"] = out[risk_cols].astype(str).agg(" | ".join, axis=1)

OUT.parent.mkdir(parents=True, exist_ok=True)
out.to_csv(OUT, index=False)

print("✅ generated:", OUT)
print("rows:", len(out))

print("\n===== fraud risk =====")
print(out["fraud_risk"].value_counts().to_string())

print("\n===== lead quality =====")
print(out["lead_quality"].value_counts().to_string())

print("\n===== followup =====")
print(out["followup_issue"].value_counts().to_string())

print("\n===== next action =====")
print(out["next_action"].value_counts().to_string())
