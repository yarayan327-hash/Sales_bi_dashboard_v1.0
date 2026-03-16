// src/report/buildMtdGapPayload.ts
import { normalizeName, parseLooseYmd, inRangeYmd, monthStartYmd, toNum, s } from "./reportUtils";

type Input = {
  reportDate: string;
  agents: any[];
  targets: any[];
  orders: any[];
};

function pickEffectiveTarget(targets: any[], salesId: string, reportDate: string) {
  const rows = targets.filter((t) => String(t.sales_id ?? "").trim() === salesId);

  const effective = rows.filter((t) => {
    const from = parseLooseYmd(t.effective_from);
    const to = parseLooseYmd(t.effective_to);
    if (!from || !to) return false;
    return reportDate >= from && reportDate <= to;
  });

  if (effective.length > 0) {
    return toNum(effective[effective.length - 1].monthly_target_usd);
  }

  const fallback = rows.find((t) => !s(t.effective_from) && !s(t.effective_to));
  return fallback ? toNum(fallback.monthly_target_usd) : 0;
}

export function buildMtdGapPayload(input: Input) {
  const start = monthStartYmd(input.reportDate);
  const end = input.reportDate;

  const bySalesName = new Map<string, any>();
  const bySalesId = new Map<string, any>();

  for (const a of input.agents) {
    const row = {
      sales_id: s(a.sales_id),
      sales_name: s(a.sales_name),
      sales_group: s(a.sales_group),
      target: pickEffectiveTarget(input.targets, s(a.sales_id), input.reportDate),
      gmv: 0,
      orders: 0,
      gap: 0
    };

    bySalesId.set(row.sales_id, row);
    bySalesName.set(normalizeName(row.sales_name), row);
  }

  for (const o of input.orders) {
    const ymd = parseLooseYmd(o.processed_time);
    if (!inRangeYmd(ymd, start, end)) continue;

    const matched = bySalesName.get(normalizeName(o.sales_name_raw || o.sales_name));
    if (!matched) continue;

    matched.orders += 1;
    matched.gmv += toNum(o.paid_amount);
  }

  const rows = Array.from(bySalesId.values()).map((r) => ({
    ...r,
    gap: r.target - r.gmv
  }));

  rows.sort((a, b) => {
    const ga = String(a.sales_group || "999");
    const gb = String(b.sales_group || "999");
    if (ga !== gb) return ga.localeCompare(gb);
    return String(a.sales_name).localeCompare(String(b.sales_name));
  });

  return rows;
}