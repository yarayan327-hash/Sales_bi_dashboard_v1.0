import requests
import json

APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
# 测试你提供的其中一个 Table ID
TEST_TABLE_ID = "PTUH2yg" 

def get_token():
    url = f"https://oapi.dingtalk.com/gettoken?appkey={APP_KEY}&appsecret={APP_SECRET}"
    return requests.get(url).json().get("access_token")

def probe_api(token):
    # 路径 A: 标准多维表格查询接口
    url = f"https://api.dingtalk.com/v1.0/contact/tables/{BASE_ID}/dataQuery"
    headers = {
        "x-acs-dingtalk-access-token": token,
        "Content-Type": "application/json"
    }
    payload = {
        "tableId": TEST_TABLE_ID,
        "maxResults": 5
    }
    
    print(f"--- 正在使用应用 A 尝试抓取表 {TEST_TABLE_ID} ---")
    response = requests.post(url, headers=headers, json=payload)
    print(f"HTTP 状态码: {response.status_code}")
    print(f"完整响应内容: {response.text}")

if __name__ == "__main__":
    token = get_token()
    if token:
        probe_api(token)
    else:
        print("无法获取 Token，请检查 AppKey/Secret")
