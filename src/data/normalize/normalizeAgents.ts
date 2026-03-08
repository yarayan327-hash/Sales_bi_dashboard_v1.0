import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { normalizeGroupName } from "../../utils/group";
import { AgentDim } from "../../types/normalized";

export function normalizeAgents(rows: Record<string, string>[]): AgentDim[] {
  return rows.map(r => {
    const sales_id = pick(r, HEADERS.dim_agents.sales_id);
    const sales_group = normalizeGroupName(pick(r, HEADERS.dim_agents.sales_group));
    const sales_name = pick(r, HEADERS.dim_agents.sales_name);
    return { sales_id, sales_group, sales_name };
  }).filter(x => x.sales_id);
}
