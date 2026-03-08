import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { extractDigits } from "../../utils/text";
import { parseAnyDateToKsa } from "../../utils/time";
import { LeadFact } from "../../types/normalized";

export function normalizeLeads(rows: Record<string, string>[]): LeadFact[] {
  return rows.map(r => {
    const user_id = extractDigits(pick(r, HEADERS.fact_leads.user_id));
    const sales_id = pick(r, HEADERS.fact_leads.sales_id);
    const assigned_time = pick(r, HEADERS.fact_leads.assigned_time);
    const assigned_dt_ksa = parseAnyDateToKsa(assigned_time);
    const desc = pick(r, HEADERS.fact_leads.desc);
    return { user_id, sales_id, assigned_dt_ksa, desc };
  }).filter(x => x.user_id && x.sales_id);
}
