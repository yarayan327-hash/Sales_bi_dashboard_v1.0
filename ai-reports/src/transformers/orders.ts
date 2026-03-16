// src/transformers/orders.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * 只解析 paid_amount
 * 支持:
 * - "599.00"
 * - "1,299.00"
 * - "SAR 599.00"
 * - " 599 "
 */
function toPaidAmount(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  // 仅保留数字/小数点/负号
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// 支持: "2026/2/27 14:27" / "2026-02-27 14:27" / "2026-02-27T..."
function parseYMDFromDatetime(raw: string): string {
  const t = s(raw);
  if (!t) return "";

  const x = t.replace(/\//g, "-").replace("T", " ").trim();
  const m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";

  const y = m[1];
  const mm = String(Number(m[2])).padStart(2, "0");
  const dd = String(Number(m[3])).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * fact_orders.csv sample:
 * sales_name_raw = "51habiba.hassan"
 * processed_time = "2025/10/29 4:31"
 * paid_amount = "599.00"
 */
export function transformOrders(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const order_id = s(r.order_id);
      const user_id = s(r.user_id);

      const sales_name = s(
        r.sales_name_raw || r.sales_name || r.agent_name || r.consultant_name
      );

      const processed_time = s(r.processed_time || r.processed_time_ksa);
      const processed_date = parseYMDFromDatetime(processed_time);

      // ✅ 只取 paid_amount
      const paid_amount_raw = r.paid_amount;
      const paid_amount = toPaidAmount(paid_amount_raw);

      // sales_group 可能像 "前端销售部001组"
      const sgRaw = s(r.sales_group);
      const sgMatch = sgRaw.match(/(\d{3})/);
      const sales_group = s(r.sales_group_code || (sgMatch ? sgMatch[1] : ""));

      if (!order_id && !user_id) return null;

      return {
        ...r,
        order_id,
        user_id,
        sales_name,
        sales_group,
        processed_time,
        processed_date,
        paid_amount,
        paid_amount_raw, // debug 用
      };
    })
    .filter(Boolean) as AnyRow[];
}