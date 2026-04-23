import requests
import pandas as pd
import json
import sys
import re
from datetime import datetime, timedelta

# 这里必须用那个能通的 Key
APP_KEY = "dingkoqj2dtylufjjyok"
APP_SECRET = "TcOcTzs77TAtj07YEp4Xx2pFqgY73V5IQ496iPUoWLpFrplF2aGAFd3bFfn3sCyN"
BASE_ID = "QPGYqjpJYr7qjAzGiojwj6jD8akx1Z5N"
OPERATOR_ID = "xKxPxUUt9Ugxrwiia3Gq8PwiEiE"
OUTPUT_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"
LOOKBACK_DAYS = 15

def get_token():
    url = "https://oapi.dingtalk.com/gettoken"
    params = {"appkey": APP_KEY, "appsecret": APP_SECRET}
    res = requests.get(url, params=params).json()
    if "access_token" not in res:
        raise RuntimeError("获取 Token 失败: " + str(res))
    return res["access_token"]

# ... 后面的逻辑保持不变 (为了节省篇幅，这里代表原有的抓取逻辑)
# 实际上我会通过下面的完整命令帮你全部还原
