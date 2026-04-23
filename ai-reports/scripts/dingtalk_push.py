import requests
import os
import json

# === 【应用 B】负责发送日报 ===
APP_KEY = "dingzqjextvcbu3uiftv"
APP_SECRET = "SCbsVO7G_GF_T7L9-fys76HcKkh" 
AGENT_ID = "4349679935"
USER_ID = "yanjin03"

REPORT_PATH = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/daily_report.txt"

def run():
    print("--- 启动应用 B 推送程序 ---")
    
    # 1. 获取应用 B 的 Token
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    r_token = requests.get(token_url).json()
    token = r_token.get("access_token")
    
    if not token:
        print("❌ 应用 B Token 获取失败，请确认 Secret 是否复制完整: " + str(r_token))
        return

    # 2. 读取报表
    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = "📊 报表已生成，详情请查看看板。"

    # 3. 发送工作通知
    url = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=" + token
    payload = {
        "agent_id": int(AGENT_ID),
        "userid_list": USER_ID,
        "msg": {
            "msgtype": "markdown",
            "markdown": {
                "title": "📊 销售深度分析日报",
                "text": "## 📊 销售深度分析日报\n\n" + content.replace('\n', '\n\n')
            }
        }
    }
    
    res = requests.post(url, json=payload).json()
    print("📢 最终推送结果: " + str(res))

if __name__ == "__main__":
    run()
