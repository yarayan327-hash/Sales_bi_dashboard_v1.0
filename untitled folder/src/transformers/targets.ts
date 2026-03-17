// src/transformers/targets.ts
export interface DimTargetRaw {
  sales_id?: string | number;
  monthly_target_usd?: string | number;
}

export interface DimTarget {
  sales_id: string;
  monthly_target_usd: number;
}

export function transformTargets(rows: DimTargetRaw[]): DimTarget[] {
  return rows
    .map((r) => {
      const sales_id = String(r.sales_id ?? "").trim();
      const target = Number(String(r.monthly_target_usd ?? "0").replace(/,/g, "").trim() || 0);
      if (!sales_id) return null;
      return {
        sales_id,
        monthly_target_usd: Number.isFinite(target) ? target : 0,
      } as DimTarget;
    })
    .filter(Boolean) as DimTarget[];
}