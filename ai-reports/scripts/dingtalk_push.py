import requests
import os

# 推送专用：使用你的机器人 Key
APP_KEY = "dingzqjextvcbu3uiftv"
APP_SECRET = "SCbsVO7G_GF_T7L9-fys76HcKkh" 
USER_ID = "yanjin03"
AGENT_ID = "4349679935"

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    res = requests.get(token_url).json()
    token = res.get("access_token")
    if not token:
        print("❌ 推送 Token 获取失败 (Secret 可能不对): " + str(res))
        return

    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = "⚠️ 报表内容为空"

    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    data = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {"msgtype": "markdown", "markdown": {"title": "📊 销售日报", "text": "## 📊 销售日报\n\n" + content.replace('\n', '\n\n')}}
    }
    print("推送结果: " + str(requests.post(url, json=data).json()))

if __name__ == "__main__":
    run()
