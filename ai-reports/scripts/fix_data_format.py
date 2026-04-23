import pandas as pd
import os
import re

DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

def clean_val(val):
    if pd.isna(val): return 0
    s = str(val)
    # 提取数字，例如从 "3150.00(SAR)" 提取 3150.00
    res = re.search(r"(\d+\.?\d*)", s)
    return res.group(1) if res else 0

def fix_orders():
    path = os.path.join(DATA_DIR, "fact_orders.csv")
    if not os.path.exists(path): return
    
    df = pd.read_csv(path)
    
    # 1. 字段名映射 (根据抓取到的数据内容进行映射)
    # 看板要求的标准表头顺序
    target_cols = [
        'order_id', 'user_name', 'user_id', 'sales_name_raw', 'sales_group', 
        'original_price', 'paid_amount', 'package_name', 'order_time', 
        'payment_method', 'pay_currency', 'discount_amount', 'order_status', 'processed_time'
    ]
    
    # 定义可能的原始列名映射 (根据你之前 grep 的结果手动对位)
    mapping = {
        '订单号': 'order_id', '订单id': 'order_id',
        '学员姓名': 'user_name',
        '学员ID': 'user_id',
        '销售姓名': 'sales_name_raw', 'sales_name': 'sales_name_raw',
        '销售小组': 'sales_group',
        '实付金额': 'paid_amount', '支付金额': 'paid_amount',
        '下单时间': 'order_time',
    }
    df.rename(columns=mapping, inplace=True)

    # 2. 如果某些列不存在，补齐空列
    for col in target_cols:
        if col not in df.columns:
            df[col] = ""

    # 3. 清洗金额
    for col in ['paid_amount', 'original_price', 'discount_amount']:
        df[col] = df[col].apply(clean_val)

    # 4. 强制按看板要求的顺序重新排列列
    df = df[target_cols]
    
    df.to_csv(path, index=False)
    print("✅ fact_orders.csv reordered and cleaned.")

def fix_calls():
    path = os.path.join(DATA_DIR, "fact_calls.csv")
    if not os.path.exists(path): return
    df = pd.read_csv(path)
    if 'call_status' in df.columns:
        df['call_status'] = df['call_status'].replace({'双方接通': 'connected', '客户未接听': 'no_answer'})
    df.to_csv(path, index=False)
    print("✅ fact_calls.csv fixed.")

if __name__ == "__main__":
    fix_orders()
    fix_calls()
