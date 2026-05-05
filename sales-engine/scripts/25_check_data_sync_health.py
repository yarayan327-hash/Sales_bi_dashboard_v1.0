import pandas as pd
import json
from datetime import datetime, timedelta
from pathlib import Path

BASE = Path("public/data")

def now_ksa():
    return datetime.utcnow() + timedelta(hours=3)

def check_table(file, date_col):
    p = BASE / file
    if not p.exists():
        return {"table": str(p), "status": "missing", "reason": "file_not_found", "rows": 0, "month_rows": 0}

    df = pd.read_csv(p, dtype=str).fillna("")
    month = now_ksa().strftime("%Y-%m")
    month_rows = df[date_col].str.contains(month, na=False).sum() if date_col and date_col in df.columns else len(df)

    return {
        "table": str(p),
        "status": "ok" if month_rows > 0 else "warning",
        "reason": "" if month_rows > 0 else "no_current_month_rows_" + month,
        "rows": int(len(df)),
        "month_rows": int(month_rows),
        "columns": list(df.columns)
    }

now = now_ksa()
res = {
    "sync_date_ksa": now.strftime("%Y-%m-%d"),
    "sync_time_ksa": now.strftime("%Y-%m-%d %H:%M:%S"),
    "status": "ok",
    "bad_count": 0,
    "checks": []
}

for f, col in [
    ("fact_leads.csv", ""),  # legacy table: only check file exists
    ("fact_trials.csv", "class_start_ksa"),
    ("fact_orders.csv", "order_time"),
    ("fact_calls.csv", "outbound_time"),
    ("fact_lead_source.csv", "add_time"),
]:
    r = check_table(f, col)
    if r["status"] != "ok":
        res["bad_count"] += 1
        res["status"] = "warning"
    res["checks"].append(r)

Path("public/data/data_sync_health.json").write_text(json.dumps(res, indent=2, ensure_ascii=False))
print("✅ health check updated")
