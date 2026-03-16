// src/report/buildTeamPkPayload.ts
import { parseLooseYmd, inRangeYmd, monthStartYmd, toNum } from "./reportUtils";

type Input = {
  reportDate: string;
  orders: any[];
};

export function buildTeamPkPayload(input: Input) {
  const start = monthStartYmd(input.reportDate);
  const end = input.reportDate;

  const agg: Record<string, any> = {};

  for (const o of input.orders) {
    const ymd = parseLooseYmd(o.processed_time);
    if (!inRangeYmd(ymd, start, end)) continue;

    const match = String(o.sales_group ?? "").match(/(\d{3})/);
    const group = match?.[1] || "(empty)";

    if (!agg[group]) {
      agg[group] = {
        sales_group: group,
        orders: 0,
        gmv: 0
      };
    }

    agg[group].orders += 1;
    agg[group].gmv += toNum(o.paid_amount);
  }

  return Object.values(agg).sort((a: any, b: any) => String(a.sales_group).localeCompare(String(b.sales_group)));
}