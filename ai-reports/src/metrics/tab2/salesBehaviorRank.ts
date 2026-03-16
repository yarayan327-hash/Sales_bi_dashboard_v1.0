// src/metrics/tab2/salesBehaviorRank.ts

type Input = {
  reportDate: string;
  agents: any[];
  trials: any[]; // attended
  calls: any[];  // effective
  orders: any[];
};

export function buildSalesBehaviorRank(input: Input) {
  const { agents, trials, calls, orders } = input;

  // 以 sales_id / sales_name 聚合都行，这里优先 sales_name（更直观）
  const map = new Map<string, any>();

  function keyOf(r: any) {
    return String(r.sales_name ?? r.sales_agent ?? r.sales_name_raw ?? r.sales_id ?? "UNKNOWN");
  }

  function getRow(k: string) {
    if (!map.has(k)) {
      map.set(k, {
        sales: k,
        attended_trials: 0,
        effective_calls: 0,
        orders: 0,
        gmv: 0,
      });
    }
    return map.get(k);
  }

  trials.forEach((r) => {
    const row = getRow(keyOf(r));
    row.attended_trials += 1;
  });

  calls.forEach((r) => {
    const row = getRow(keyOf(r));
    row.effective_calls += 1;
  });

  orders.forEach((r) => {
    const row = getRow(keyOf(r));
    row.orders += 1;
    row.gmv += Number(r.paid_amount ?? r.amount ?? 0);
  });

  return Array.from(map.values()).sort((a, b) => {
    // 你可以换成更合理的评分逻辑
    const scoreA = a.orders * 100 + a.effective_calls * 1 + a.attended_trials * 2;
    const scoreB = b.orders * 100 + b.effective_calls * 1 + b.attended_trials * 2;
    return scoreB - scoreA;
  });
}