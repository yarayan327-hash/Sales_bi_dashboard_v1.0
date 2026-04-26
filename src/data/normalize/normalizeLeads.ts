import { extractDigits } from "../../utils/text";
import { parseAnyDateToKsa } from "../../utils/time";
import { LeadFact } from "../../types/normalized";

function pickAny(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function normalizeLeads(rows: Record<string, string>[]): LeadFact[] {
  return rows.map(r => {
    const user_id = extractDigits(pickAny(r, ["user_id", "stu_id", "学员ID", "学生ID", "student_id"]));
    const sales_id = pickAny(r, ["sales_id", "new_admin_id", "销售ID", "负责人", "admin_id"]);
    const assigned_time = pickAny(r, ["assigned_time", "add_time", "分配时间", "线索创建时间"]);
    const assigned_dt_ksa = parseAnyDateToKsa(assigned_time);
    const desc = pickAny(r, ["lead_source", "desc", "线索来源", "线索状态"]);

    return { user_id, sales_id, assigned_dt_ksa, desc };
  }).filter(x => x.user_id && x.sales_id);
}
