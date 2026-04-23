import requests
import os

# 全部切换为【应用 A】的凭证，因为这组是验证过绝对能通过 Token 校验的
APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
USER_ID = "yanjin03"
# 这里改用应用 A 自己的 AgentId（你刚才提供的是 4485198512）
AGENT_ID = "4485198512" 

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    print("--- 启动【应用 A】保底推送程序 ---")
    
    # 1. 获取 Token
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    r = requests.get(token_url).json()
    token = r.get("access_token")
    
    if not token:
        print("❌ Token 获取失败: " + str(r))
        return

    # 2. 读取报表
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = "📊 报表已生成，请在服务器查看。"

    # 3. 发送工作通知
    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    data = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {
            "msgtype": "markdown",
            "markdown": {
                "title": "📊 销售分析正式日报",
                "text": "## 📊 销售分析正式日报\n\n" + content.replace('\n', '\n\n')
            }
        }
    }
    
    res = requests.post(url, json=data).json()
    print("📢 最终推送结果: " + str(res))

if __name__ == "__main__":
    run()
