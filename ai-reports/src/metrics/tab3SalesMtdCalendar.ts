// src/metrics/tab3SalesMtdCalendar.ts

export interface Tab3Inputs {
  reportDate: string; // YYYY-MM-DD (T-1, KSA)
  agents?: any[];     // dim_agents: sales_id, sales_group, sales_name
  orders?: any[];     // fact_orders: sales_name_raw, processed_time, paid_amount
}

function toNum(x: any) {
  const n = Number(String(x ?? "0").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toYMD(raw: any): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD ...
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;

  // YYYY-MM-DD ...
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;

  // DD/MM/YYYY ...
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;

  return "";
}

function monthStartYMD(reportDate: string) {
  const [y, m] = reportDate.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function inRangeYMD(ymd: string, start: string, end: string) {
  return !!ymd && ymd >= start && ymd <= end;
}

/**
 * 中东工作周：
 * 工作日 = 周日 ~ 周四
 * 休息日 = 周五、周六
 *
 * JS getDay():
 * 0 Sun / 1 Mon / 2 Tue / 3 Wed / 4 Thu / 5 Fri / 6 Sat
 */
function isWeekend(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  return day === 5 || day === 6; // Fri / Sat
}

function listWorkdays(start: string, end: string) {
  const out: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  let cur = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);

  while (cur.getTime() <= endD.getTime()) {
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (!isWeekend(ymd)) out.push(ymd);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }

  return out;
}

/**
 * 如果最后成单日落在休息日（Fri/Sat），顺延到下一个工作日
 */
function moveToNextWorkday(ymd: string, workdays: string[]) {
  if (!ymd) return "";
  if (workdays.includes(ymd)) return ymd;

  for (const d of workdays) {
    if (d >= ymd) return d;
  }

  return workdays[workdays.length - 1] || "";
}

function normalizeName(raw: any): string {
  return String(raw ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeName(raw: any): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

export function computeTab3SalesMtdCalendar(input: Tab3Inputs) {
  const reportDate = String(input.reportDate || "").slice(0, 10);
  const start = monthStartYMD(reportDate);
  const end = reportDate;

  const agents = Array.isArray(input.agents) ? input.agents : [];
  const orders = Array.isArray(input.orders) ? input.orders : [];

  const name2group = new Map<string, string>();
  const name2display = new Map<string, string>();

  for (const a of agents) {
    const displayName = safeName(a.sales_name);
    const normalized = normalizeName(a.sales_name);
    const group = String(a.sales_group ?? "").trim();

    if (!normalized) continue;

    name2group.set(normalized, group);
    name2display.set(normalized, displayName);
  }

  const ordersIn = orders
    .map((r) => {
      const ymd = r.processed_date || toYMD(r.processed_time);

      const rawSalesName =
        r.sales_name_raw ??
        r.sales_name ??
        r.sales_agent ??
        r.agent_name ??
        r.name ??
        "";

      const normalizedSales = normalizeName(rawSalesName);

      const displaySales =
        name2display.get(normalizedSales) ||
        safeName(rawSalesName) ||
        "(unknown)";

      const salesGroup =
        name2group.get(normalizedSales) ||
        r.sales_group ||
        "";

      // ✅ 只取 paid_amount
      const gmv = toNum(r.paid_amount);

      return {
        ...r,
        ymd,
        normalized_sales: normalizedSales,
        sales_name: displaySales,
        sales_group: salesGroup,
        gmv,
      };
    })
    .filter((r) => inRangeYMD(r.ymd, start, end));

  /* ---------- Group GMV ---------- */
  const groupAgg: Record<string, { sales_group: string; gmv: number; orders: number }> = {};

  for (const r of ordersIn) {
    const g = r.sales_group || "(empty)";
    if (!groupAgg[g]) {
      groupAgg[g] = { sales_group: g, gmv: 0, orders: 0 };
    }
    groupAgg[g].gmv += r.gmv;
    groupAgg[g].orders += 1;
  }

  const groupTable = Object.values(groupAgg).sort((a, b) => b.gmv - a.gmv);

  /* ---------- Sales MTD agg ---------- */
  const salesAgg: Record<
    string,
    {
      sales_name: string;
      sales_group: string;
      gmv: number;
      orders: number;
      lastOrderDate: string;
    }
  > = {};

  for (const r of ordersIn) {
    const key = r.normalized_sales || normalizeName(r.sales_name) || "(unknown)";

    if (!salesAgg[key]) {
      salesAgg[key] = {
        sales_name: r.sales_name || "(unknown)",
        sales_group: r.sales_group || "",
        gmv: 0,
        orders: 0,
        lastOrderDate: "",
      };
    }

    salesAgg[key].gmv += r.gmv;
    salesAgg[key].orders += 1;

    if (!salesAgg[key].lastOrderDate || r.ymd > salesAgg[key].lastOrderDate) {
      salesAgg[key].lastOrderDate = r.ymd;
    }
  }

  const salesRank = Object.values(salesAgg).sort((a, b) => b.gmv - a.gmv);

  /* ---------- Calendar cells ---------- */
  const workdays = listWorkdays(start, end);
  const cellMap: Record<string, any[]> = {};
  for (const d of workdays) cellMap[d] = [];

  for (const s of salesRank) {
    const targetDate = moveToNextWorkday(s.lastOrderDate, workdays);

    if (targetDate && cellMap[targetDate]) {
      cellMap[targetDate].push({
        sales_name: s.sales_name,
        sales_group: s.sales_group,
        orders: s.orders,
        gmv: s.gmv,
        lastOrderDate: s.lastOrderDate,
        displayDate: targetDate,
      });
    }
  }

  for (const d of workdays) {
    cellMap[d].sort((a, b) => b.gmv - a.gmv);
  }

  return {
    range: { start, end },
    groupTable,
    workdays,
    cells: cellMap,
    top3: salesRank.slice(0, 3),
    debug: {
      ordersIn: ordersIn.length,
      agents: agents.length,
      groups: groupTable.length,
      sales: salesRank.length,
      sample_orders_in: ordersIn.slice(0, 10).map((r) => ({
        raw_sales_name:
          r.sales_name_raw ??
          r.sales_name ??
          r.sales_agent ??
          r.agent_name ??
          r.name ??
          "",
        normalized_sales: r.normalized_sales,
        mapped_sales_name: r.sales_name,
        mapped_sales_group: r.sales_group,
        ymd: r.ymd,
        gmv: r.gmv,
        paid_amount: r.paid_amount,
      })),
      sample_sales_rank: salesRank.slice(0, 10),
    },
  };
}