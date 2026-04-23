import requests
import os

# === 凭证锁定 ===
APP_KEY = "dingzqjextvcbu3uiftv"
APP_SECRET = "SCbsVO7G_GF_T7L9-fys76HcKkh" # 请确保这是完整的
USER_ID = "yanjin03"

# 读取 report_payload.json 获取最全的数据，而不是简版 txt
REPORT_JSON = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/output/latest/report_payload.json"

def run():
    # 1. 获取 Token
    token_url = "https://oapi.dingtalk.com/gettoken?appkey=" + APP_KEY + "&appsecret=" + APP_SECRET
    token = requests.get(token_url).json().get("access_token")

    # 2. 准备消息正文 (尝试从 JSON 中提取，如果提取失败则读文本)
    content = "⚠️ 报告内容解析失败"
    if os.path.exists(REPORT_JSON):
        import json
        with open(REPORT_JSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 这里的 content 字段通常存有 AI 生成的长文
            content = data.get('content', data.get('report_text', '数据加载中...'))
    
    # 3. 发送单聊消息 (这种模式发送者身份最准)
    # 注意：需在钉钉后台开启“机器人”功能
    url = "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend"
    headers = {"x-acs-dingtalk-access-token": token, "Content-Type": "application/json"}
    payload = {
        "robotCode": APP_KEY,
        "userIds": [USER_ID],
        "msgKey": "sampleMarkdown",
        "msgParam": "{\"title\":\"📊 正式日报 V3\",\"text\":\"" + content.replace('"', '\\"').replace('\n', '\\n') + "\"}"
    }
    
    res = requests.post(url, headers=headers, json=payload).json()
    print("推送结果: " + str(res))

if __name__ == "__main__":
    run()
