import os, json, time, hashlib, requests
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PENDING = ROOT / "sales-engine/data/output/recording_transcripts_pending.csv"
OUT = ROOT / "sales-engine/data/output/ai_recording_analysis.csv"

API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
BATCH_LIMIT = int(os.getenv("BATCH_LIMIT", "30"))

if not API_KEY:
    raise SystemExit("Missing GEMINI_API_KEY or GOOGLE_API_KEY")

pending = pd.read_csv(PENDING, dtype=str).fillna("")
old = pd.read_csv(OUT, dtype=str).fillna("") if OUT.exists() else pd.DataFrame()

done = set(old.get("recording_key", pd.Series(dtype=str)).astype(str).str.strip())
pending = pending[
    pending["transcript_text"].astype(str).str.strip().ne("")
    & ~pending["recording_key"].astype(str).str.strip().isin(done)
].copy()

print("pending to analyze:", len(pending))

def ask(row):
    text = str(row.get("transcript_text", ""))[:8000]
    prompt = f"""
You are analyzing Saudi Arabic sales call transcripts for an online English course.

Return ONLY valid JSON.

Fields:
call_stage: one of [pre_class_confirm, pre_class_reschedule, pre_class_cancel, in_class_support, post_class_followup, post_class_failed, duplicate_or_wrong, no_answer_or_voicemail, unknown]
stage_confidence: 0-1
summary_ar: Arabic summary, concise
attendance_intent: one of [high, medium, low, unknown]
purchase_intent: one of [high, medium, low, none, unknown]
lead_quality: one of [good_need, weak_need, no_need, wrong_number, no_trial_or_not_aware, invalid_or_noise, unknown]
main_objection: one of [price, payment_method, need_parent_approval, schedule, online_mode_concern, low_interest, wants_trial_first, course_quality, teacher_quality, technical_issue, none, unknown]
course_feedback: one of [satisfied, dissatisfied_teacher, dissatisfied_course, technical_issue, price_issue, schedule_issue, unknown]
fraud_risk: one of [normal, voicemail_long_duration, silent_long_duration, no_real_conversation, background_noise_only]
followup_issue: one of [not_followed_after_trial, late_followup_after_trial, no_preclass_confirmation, no_issue, unknown]
next_action: one of [close_payment, rebook_trial, recover_dissatisfied_user, manager_review, no_task]
reason_ar: Arabic reason.

Transcript:
{text}
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    payload = {"contents":[{"parts":[{"text":prompt}]}]}
    r = requests.post(url, json=payload, timeout=90)
    r.raise_for_status()
    raw = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)

rows = []
for i, row in pending.head(BATCH_LIMIT).iterrows():
    try:
        res = ask(row)
        base = row.to_dict()
        base.update(res)
        base["analysis_id"] = hashlib.md5(str(base.get("recording_key","")).encode()).hexdigest()
        base["analysis_status"] = "success"
        rows.append(base)
        print("ok", base.get("recording_key"))
    except Exception as e:
        base = row.to_dict()
        base["analysis_id"] = hashlib.md5(str(base.get("recording_key","")).encode()).hexdigest()
        base["analysis_status"] = "failed"
        base["analysis_error"] = str(e)[:500]
        rows.append(base)
        print("failed", base.get("recording_key"), e)
    time.sleep(0.8)

new = pd.DataFrame(rows)
final = pd.concat([old, new], ignore_index=True, sort=False)
final = final.drop_duplicates(subset=["recording_key"], keep="last")
final.to_csv(OUT, index=False)

print("DONE")
print("processed:", len(new))
print("total:", len(final))
