import json
import os
import requests
from pathlib import Path

WEBHOOK = os.getenv("DINGTALK_DAILY_WEBHOOK") or "https://oapi.dingtalk.com/robot/send?access_token=7d7137eb8a713c118071ac37eaa49fa73b61325b452ff99af91ae1b33fe29557"

ROOT = Path("/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0")
REPORT_PATH = ROOT / "ai-reports/output/latest/daily_report_cn.txt"

def main():
    if not REPORT_PATH.exists():
        raise FileNotFoundError(f"Report not found: {REPORT_PATH}")

    text = REPORT_PATH.read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError("Daily report is empty")

    payload = {
        "msgtype": "text",
        "text": {
            "content": text
        }
    }

    resp = requests.post(
        WEBHOOK,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=20,
    )

    print("status_code:", resp.status_code)
    print("response:", resp.text)

    if resp.status_code >= 400:
        raise RuntimeError(f"DingTalk webhook failed: {resp.text}")

    res = resp.json()
    if res.get("errcode") != 0:
        raise RuntimeError(f"DingTalk webhook error: {res}")

if __name__ == "__main__":
    main()
