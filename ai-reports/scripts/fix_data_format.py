import pandas as pd
import os
import re

DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

def clean_val(val):
    if pd.isna(val): return 0
    s = str(val).replace(',', '') # 处理千分位
    res = re.search(r"(\d+\.?\d*)", s)
    return float(res.group(1)) if res else 0

def format_date(val):
    if pd.isna(val) or str(val).strip() == "": return ""
    try:
        # 统一转化为 YYYY-MM-DD HH:mm:ss
        dt = pd.to_datetime(val)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return str(val)

def fix_orders():
    path = os.path.join(DATA_DIR, "fact_orders.csv")
    if not os.path.exists(path): return
    
    df = pd.read_csv(path)
    
    # 标准表头及顺序
    target_cols = [
        'order_id', 'user_name', 'user_id', 'sales_name_raw', 'sales_group', 
        'original_price', 'paid_amount', 'package_name', 'order_time', 
        'payment_method', 'pay_currency', 'discount_amount', 'order_status', 'processed_time'
    ]
    
    # 强化映射逻辑
    mapping = {
        '订单号': 'order_id', '订单id': 'order_id',
        '学员姓名': 'user_name',
        '学员ID': 'user_id',
        '销售姓名': 'sales_name_raw', 'sales_name': 'sales_name_raw',
        '销售小组': 'sales_group',
        '实付金额': 'paid_amount', '支付金额': 'paid_amount',
        '下单时间': 'order_time', '订单时间': 'order_time',
        '处理时间': 'processed_time'
    }
    df.rename(columns=mapping, inplace=True)

    # 补齐、清洗、格式化
    for col in target_cols:
        if col not in df.columns: df[col] = ""
    
    # 金额清洗
    for col in ['paid_amount', 'original_price', 'discount_amount']:
        df[col] = df[col].apply(clean_val)
    
    # 日期标准化
    for col in ['order_time', 'processed_time']:
        df[col] = df[col].apply(format_date)

    df = df[target_cols]
    df.to_csv(path, index=False, encoding='utf-8-sig') # 增加BOM确保Excel和看板都能识别
    print("✅ fact_orders.csv 纠偏完成")

def fix_calls():
    path = os.path.join(DATA_DIR, "fact_calls.csv")
    if not os.path.exists(path): return
    df = pd.read_csv(path)
    # 通话状态标准化
    status_map = {'双方接通': 'connected', '客户未接听': 'no_answer', '主叫挂断': 'canceled'}
    if 'call_status' in df.columns:
        df['call_status'] = df['call_status'].replace(status_map)
    # 时间标准化
    if 'outbound_time' in df.columns:
        df['outbound_time'] = df['outbound_time'].apply(format_date)
    
    df.to_csv(path, index=False, encoding='utf-8-sig')
    print("✅ fact_calls.csv 纠偏完成")

if __name__ == "__main__":
    fix_orders()
    fix_calls()
