// src/transformers/agents.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * dim_agents.csv headers:
 * sales_id, sales_group, sales_name
 */
export function transformAgents(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const sales_id = s(r.sales_id);
      const sales_group = s(r.sales_group);
      const sales_name = s(r.sales_name);

      if (!sales_id && !sales_name) return null;

      return {
        sales_id,
        sales_group,
        sales_name,
      };
    })
    .filter(Boolean) as AnyRow[];
}