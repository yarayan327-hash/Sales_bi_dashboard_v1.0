import requests
import os

APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
USER_ID = "yanjin03"
# 这里务必填入 AppKey 对应的那个数字 ID
AGENT_ID = "dingzqjextvcbu3uiftv" 

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    token = requests.get(token_url).json().get("access_token")

    if not token:
        print("Token 失败")
        return

    content = "⚠️ 报表内容为空"
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()

    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    data = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {"msgtype": "markdown", "markdown": {"title": "📊 销售正式日报", "text": content}}
    }
    print("推送结果: " + str(requests.post(url, json=data).json()))

if __name__ == "__main__":
    run()
