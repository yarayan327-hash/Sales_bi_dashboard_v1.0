cat << 'EOF' > /home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/scripts/generateDailyMetrics.ts
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const DATA_DIR = path.join(__dirname, '../../public/data');
const OUTPUT_DIR = path.join(__dirname, '../output');

// 【核心修复】万能日期标准化函数
// 目标：将 "2026/4/22", "2026-04-22T23:00", "2026-04-22 21:30" 全部统一为 "2026-04-22"
function normalizeDate(val: any): string {
    if (!val) return "";
    let s = String(val).trim();
    // 1. 处理 ISO 格式 (带 T 或空格)
    s = s.split(/[T ]/)[0];
    // 2. 将斜杠换成横杠
    s = s.replace(/\//g, '-');
    // 3. 补齐 0 (例如 2026-4-22 补为 2026-04-22)
    const parts = s.split('-');
    if (parts.length !== 3) return "";
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 强制标准化数字：洗掉 SAR, USD, 括号和逗号
function normalizeNum(val: any): number {
    if (!val) return 0;
    const s = String(val).replace(/[^\d.-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

async function run(queryDate: string) {
    const targetDate = normalizeDate(queryDate);
    console.log(`🔍 正在扫描全表，匹配日期: [${targetDate}] ...`);

    const loadCsv = (name: string) => {
        const p = path.join(DATA_DIR, name);
        if (!fs.existsSync(p)) return [];
        const raw = fs.readFileSync(p, 'utf-8');
        return parse(raw, { 
            columns: header => header.map((h: string) => h.trim().toLowerCase()),
            skip_empty_lines: true,
            relax_column_count: true 
        });
    };

    const orders = loadCsv('fact_orders.csv');
    const trials = loadCsv('fact_trials.csv');
    const leads = loadCsv('fact_leads.csv');

    // 精准匹配 (不再死磕原始字符串，全部 normalization 后再比对)
    const yOrders = orders.filter(r => normalizeDate(r.order_time || r.processed_time) === targetDate);
    const yLeads = leads.filter(r => normalizeDate(r.assigned_time || r.create_time) === targetDate);
    const yTrials = trials.filter(r => normalizeDate(r.class_start_ksa || r.start_time_bj) === targetDate);
    
    // 出席逻辑增强
    const yAttended = yTrials.filter(r => {
        const st = String(r.class_status).toLowerCase();
        return st.includes('on') || st.includes('attend') || st.includes('success');
    });

    const metrics = {
        date: targetDate,
        summary: {
            leads: yLeads.length,
            bookings: yTrials.length,
            attended: yAttended.length,
            orders: yOrders.length,
            gmv: yOrders.reduce((sum, r) => sum + normalizeNum(r.paid_amount), 0)
        }
    };

    console.log(`📈 结果: 线索=${metrics.summary.leads}, 预约=${metrics.summary.bookings}, 订单=${metrics.summary.orders}, GMV=${metrics.summary.gmv}`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, `metrics_${targetDate}.json`), JSON.stringify(metrics, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report_payload.json'), JSON.stringify(metrics, null, 2));
}

const target = process.argv[2] || "2026-04-22";
run(target);
EOF
