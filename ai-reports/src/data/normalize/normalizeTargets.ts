import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { toNumber } from "../../utils/number";
import { TargetDim } from "../../types/normalized";

export function normalizeTargets(rows: Record<string, string>[]): TargetDim[] {
  return rows.map(r => {
    const sales_id = pick(r, HEADERS.dim_targets.sales_id);
    const monthly_target_usd = toNumber(pick(r, HEADERS.dim_targets.monthly_target_usd));
    return { sales_id, monthly_target_usd };
  }).filter(x => x.sales_id);
}
