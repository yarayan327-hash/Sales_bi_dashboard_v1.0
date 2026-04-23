import requests
import os

# 使用已经验证成功、能抓到数据的这组 Key 来获取 Token
APP_KEY_TOKEN = "dingkoqj2dtylufjjyok"
APP_SECRET_TOKEN = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"

# 消息接收方的配置 (保持不变)
USER_ID = "yanjin03"
AGENT_ID = "4349679935"

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    print("--- 启动推送补丁版 ---")
    
    # 1. 获取 Token
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY_TOKEN + "&appsecret=" + APP_SECRET_TOKEN
    res = requests.get(token_url).json()
    token = res.get("access_token")
    
    if not token:
        print("❌ 获取 Token 失败: " + str(res))
        return

    # 2. 读取报表内容
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = "📊 报表已生成，请在服务器查看详情。"

    # 3. 发送消息
    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    data = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {
            "msgtype": "markdown",
            "markdown": {
                "title": "📊 销售正式日报",
                "text": "## 📊 销售正式日报\n\n" + content.replace('\n', '\n\n')
            }
        }
    }
    
    send_res = requests.post(url, json=data).json()
    print("📢 推送结果: " + str(send_res))

if __name__ == "__main__":
    run()
