// src/transformers/leads.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * fact_leads.csv sample:
 * user_id, sales_id, assigned_time, lead_source
 */
export function transformLeads(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const user_id = s(r.user_id);
      const sales_id = s(r.sales_id);
      const assigned_time = s(r.assigned_time || r.assigned_time_ksa || r.assigned_date || r.assigned_date_ksa);

      if (!user_id) return null;

      return {
        ...r,
        user_id,
        sales_id,
        assigned_time,
      };
    })
    .filter(Boolean) as AnyRow[];
}