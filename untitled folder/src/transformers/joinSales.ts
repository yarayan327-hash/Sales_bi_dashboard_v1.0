// src/transformers/joinSales.ts

export interface AgentDimRow {
  sales_id: string;
  sales_group: string;
  sales_name: string;
}

export type AgentDim = AgentDimRow;

export function buildSalesLookups(agents: AgentDimRow[]) {
  const byId = new Map<string, AgentDimRow>();
  const byName = new Map<string, AgentDimRow>();

  (agents ?? []).forEach((a) => {
    const id = String(a.sales_id ?? "").trim();
    const name = String(a.sales_name ?? "").trim();
    if (id) byId.set(id, a);
    if (name) byName.set(name.toLowerCase(), a);
  });

  return { byId, byName };
}

/** 按 sales_name_raw 精准对齐 dim_agents（大小写不敏感） */
export function resolveBySalesName(salesNameRaw: string, lookups: ReturnType<typeof buildSalesLookups>) {
  const key = String(salesNameRaw ?? "").trim().toLowerCase();
  if (!key) return null;
  return lookups.byName.get(key) ?? null;
}

/**
 * 给任意表附加销售元信息（sales_id / sales_group / sales_name）
 * selector: 从 row 里拿“可能的 sales_id 或 sales_name”
 */
export function attachSalesMeta<T extends Record<string, any>>(
  rows: T[],
  agents: AgentDimRow[],
  selector: (row: T) => { sales_id?: any; sales_name?: any }
): (T & { sales_id?: string; sales_group?: string; sales_name?: string })[] {
  const agentsArr = Array.isArray(agents) ? agents : [];
  const { byId, byName } = buildSalesLookups(agentsArr);

  return (rows ?? []).map((r) => {
    const pick = selector(r) || {};
    const sid = String(pick.sales_id ?? "").trim();
    const sname = String(pick.sales_name ?? "").trim();

    let matched: AgentDimRow | null = null;

    if (sid && byId.has(sid)) matched = byId.get(sid)!;
    if (!matched && sname) matched = byName.get(sname.toLowerCase()) ?? null;

    return {
      ...r,
      sales_id: matched?.sales_id ?? (sid || undefined),
      sales_group: matched?.sales_group ?? undefined,
      sales_name: matched?.sales_name ?? (sname || undefined),
    };
  });
}