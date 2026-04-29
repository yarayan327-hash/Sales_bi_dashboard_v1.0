// ai-reports/src/transformers/leads.ts
type AnyRow = Record<string, any>;

function s(v: any) {
  return String(v ?? "").trim();
}

function extractDigits(v: any) {
  const text = s(v);
  const m = text.match(/\d+/);
  return m ? m[0] : "";
}

export function transformLeads(rows: AnyRow[]): AnyRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const user_id = extractDigits(
        r.user_id || r.stu_id || r["学员ID"] || r["学生ID"] || r.student_id
      );

      const sales_id = s(
        r.sales_id || r.new_admin_id || r["销售ID"] || r["负责人"] || r.admin_id
      );

      const assigned_time = s(
        r.assigned_time ||
        r.assigned_time_ksa ||
        r.assigned_date ||
        r.assigned_date_ksa ||
        r.add_time ||
        r["分配时间"] ||
        r["线索创建时间"]
      );

      const lead_source = s(
        r.lead_source || r.desc || r["线索来源"] || r["线索状态"]
      );

      if (!user_id) return null;

      return {
        ...r,
        user_id,
        sales_id,
        assigned_time,
        lead_source,
      };
    })
    .filter(Boolean) as AnyRow[];
}
