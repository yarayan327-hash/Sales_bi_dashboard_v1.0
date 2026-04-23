import requests
import os

# === 凭证完全锁定区 ===
APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
USER_ID = "yanjin03"
# 确保这里是纯数字
AGENT_ID = "4349679935" 

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    # 1. 获取 Token
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    res = requests.get(token_url).json()
    token = res.get("access_token")
    if not token:
        print("❌ Token 获取失败: " + str(res))
        return

    # 2. 读取报表内容
    content = "⚠️ 报表内容为空，请检查 AI 生成环节。"
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()

    # 3. 发送工作通知
    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    data = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {
            "msgtype": "markdown", 
            "markdown": {
                "title": "📊 Sales Engine Daily Report", 
                "text": "## 📊 销售正式日报\n\n" + content.replace('\n', '\n\n')
            }
        }
    }
    
    final_res = requests.post(url, json=data).json()
    print("📢 推送结果: " + str(final_res))

if __name__ == "__main__":
    run()
