import pandas as pd
import glob
import os
import re

DATA_DIR = "/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/public/data"

def clean_val(val):
    if pd.isna(val): return 0
    s = str(val).replace(',', '').replace('SAR', '').strip()
    res = re.search(r"(\d+\.?\d*)", s)
    return float(res.group(1)) if res else 0

def format_date(val):
    if pd.isna(val) or str(val).strip() == "": return ""
    try:
        # 尝试多种格式解析日期
        dt = pd.to_datetime(val)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return str(val)

def process_and_merge(file_pattern, target_name, id_cols, mapping, date_cols, amount_cols=[]):
    path = os.path.join(DATA_DIR, target_name)
    # 查找所有匹配的文件（例如包含“订单记录”的所有CSV）
    all_files = glob.glob(os.path.join(DATA_DIR, file_pattern))
    if not all_files:
        print(f"⚠️ 未找到匹配 {file_pattern} 的文件")
        return
    
    print(f"正在处理 {target_name}，共发现 {len(all_files)} 个历史文件...")
    frames = []
    # 按照文件名排序，确保日期较晚的文件排在后面
    for f in sorted(all_files):
        try:
            df = pd.read_csv(f)
            df.rename(columns=mapping, inplace=True)
            
            # 补齐缺失列
            for col in date_cols + amount_cols:
                if col not in df.columns: df[col] = ""
            
            # 格式化日期
            for col in date_cols:
                if col in df.columns: df[col] = df[col].apply(format_date)
            
            # 清洗金额
            for col in amount_cols:
                if col in df.columns: df[col] = df[col].apply(clean_val)
                
            frames.append(df)
        except Exception as e:
            print(f"读取文件 {f} 出错: {e}")
    
    if frames:
        # 合并所有历史数据，并根据唯一ID去重，keep='last' 确保保留最新的状态
        final_df = pd.concat(frames).drop_duplicates(subset=id_cols, keep='last')
        # 强制按看板需要的列存入（这里仅列出核心必选列，可根据需要扩展）
        final_df.to_csv(path, index=False, encoding='utf-8-sig')
        print(f"✅ {target_name} 历史清洗完成，最终保留 {len(final_df)} 条唯一记录。")

if __name__ == "__main__":
    # 1. 订单表历史合并 (按 order_id 去重)
    process_and_merge(
        "*订单记录.csv", "fact_orders.csv", ['order_id'], 
        {'订单号': 'order_id', '实付金额': 'paid_amount', '下单时间': 'order_time', '订单id': 'order_id'}, 
        ['order_time', 'processed_time'], ['paid_amount', 'original_price']
    )
    
    # 2. 体验课历史合并 (按 id 去重，更新 on/end 状态)
    process_and_merge(
        "*课程记录.csv", "fact_trials.csv", ['id'], 
        {'课程名称': 'course_name', '状态': 'class_status', '上课时间': 'start_time_bj'}, 
        ['booked_at', 'start_time_bj'], []
    )
    
    # 3. 线索分配历史合并 (按 user_id + 分配时间去重)
    process_and_merge(
        "*分配记录.csv", "fact_leads.csv", ['user_id', 'assigned_time'], 
        {'学员ID': 'user_id', '分配时间': 'assigned_time', '销售ID': 'sales_id'}, 
        ['assigned_time'], []
    )
    
    # 4. 外呼记录历史合并
    process_and_merge(
        "*通话记录.csv", "fact_calls.csv", ['user_id', 'outbound_time'], 
        {'学员ID': 'user_id', '拨打时间': 'outbound_time', '呼叫状态': 'call_status'}, 
        ['outbound_time'], []
    )
