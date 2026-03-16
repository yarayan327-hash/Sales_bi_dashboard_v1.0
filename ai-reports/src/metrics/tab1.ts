// src/metrics/tab1.ts

type Input = {
  reportDate: string;
  agents: any[];
  targets: any[];
  leads: any[];
  calls: any[];
  orders: any[];
  trials: any[];
};

function inDay(ts: number | null, reportDate: string) {
  if (!ts) return false;
  const start = new Date(reportDate + " 00:00:00").getTime();
  const end = new Date(reportDate + " 23:59:59").getTime();
  return ts >= start && ts <= end;
}

export function computeTab1(input: Input) {
  const {
    reportDate,
    agents = [],
    targets = [],
    leads = [],
    calls = [],
    orders = [],
    trials = [],
  } = input;

  // ✅ 当日预约（用新字段）
  const booked = trials.filter(
    (t) => t.is_booked && inDay(t.start_ts_ms, reportDate)
  ).length;

  // ✅ 当日出席
  const attended = trials.filter(
    (t) => t.is_attended && inDay(t.start_ts_ms, reportDate)
  ).length;

  // ✅ 当日订单
  const ordersInDay = orders.filter((o) =>
    inDay(o.pay_ts_ms ?? o.order_ts_ms, reportDate)
  );

  const ordersCount = ordersInDay.length;

  const gmv = ordersInDay.reduce(
    (s, o) => s + (Number(o.amount ?? o.gmv ?? 0) || 0),
    0
  );

  return {
    booked,
    attended,
    orders: ordersCount,
    gmv,
    debug: {
      trials: trials.length,
      orders: orders.length,
    },
  };
}