function toNum(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

function ymd(s: any) {
  return String(s ?? "").slice(0, 10);
}

function monthStart(reportDate: string) {
  return `${String(reportDate).slice(0, 7)}-01`;
}

function prevMonthSamePeriod(reportDate: string) {
  const [y, m, d] = String(reportDate).slice(0, 10).split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const yy = prev.getFullYear();
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return {
    start: `${yy}-${mm}-01`,
    end: `${yy}-${mm}-${dd}`,
  };
}

function normalizeGroup(v: any) {
  return String(v ?? "").trim() || "(empty)";
}

function normalizeSource(v: any) {
  return String(v ?? "").trim() || "(empty)";
}

function normalizeUserId(v: any) {
  return String(v ?? "").trim();
}

function parseLeadDate(r: any) {
  return ymd(r.assigned_time || r.assigned_date || r.assigned_time_ksa);
}

function parseTrialDate(r: any) {
  return ymd(r.class_date_ksa || r.class_start_ksa || r.class_date);
}

function parseOrderDate(r: any) {
  return ymd(r.processed_date || r.processed_time || r.processed_time_ksa);
}

function isBookedStatus(r: any) {
  return String(r.class_status ?? "").trim().toLowerCase() !== "cancel";
}

function isAttendedStatus(r: any) {
  return String(r.class_status ?? "").trim().toLowerCase() === "end";
}

function aggregateBlock(input: {
  leads: any[];
  trials: any[];
  orders: any[];
}) {
  const leads = input.leads ?? [];
  const trials = input.trials ?? [];
  const orders = input.orders ?? [];

  const booked = trials.filter(isBookedStatus);
  const attended = trials.filter(isAttendedStatus);

  const gmv = orders.reduce((s, r) => s + toNum(r.paid_amount), 0);

  return {
    leads: leads.length,
    booked: booked.length,
    attended: attended.length,
    orders: orders.length,
    gmv,
    booking_rate: safeDiv(booked.length, leads.length),
    attendance_rate: safeDiv(attended.length, booked.length),
    attended_conversion_rate: safeDiv(orders.length, attended.length),
    lead_conversion_rate: safeDiv(orders.length, leads.length),
    aov: safeDiv(gmv, orders.length),
  };
}

function groupBy<T>(rows: T[], getKey: (x: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = getKey(r) || "(empty)";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return map;
}

export function buildWeeklyReportPayload(input: {
  reportDate: string;
  monthlyTarget?: number;
  leads: any[];
  trials: any[];
  orders: any[];
}) {
  const reportDate = String(input.reportDate ?? "").slice(0, 10);
  const mStart = monthStart(reportDate);
  const lm = prevMonthSamePeriod(reportDate);

  const leads = Array.isArray(input.leads) ? input.leads : [];
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const monthlyTarget = toNum(input.monthlyTarget);

  // =========================
  // MTD
  // =========================
  const leadsMtd = leads.filter((r) => {
    const d = parseLeadDate(r);
    return d >= mStart && d <= reportDate;
  });

  const trialsMtd = trials.filter((r) => {
    const d = parseTrialDate(r);
    return d >= mStart && d <= reportDate;
  });

  const ordersMtd = orders.filter((r) => {
    const d = parseOrderDate(r);
    return d >= mStart && d <= reportDate;
  });

  // =========================
  // Last Month Same Period
  // =========================
  const leadsLm = leads.filter((r) => {
    const d = parseLeadDate(r);
    return d >= lm.start && d <= lm.end;
  });

  const trialsLm = trials.filter((r) => {
    const d = parseTrialDate(r);
    return d >= lm.start && d <= lm.end;
  });

  const ordersLm = orders.filter((r) => {
    const d = parseOrderDate(r);
    return d >= lm.start && d <= lm.end;
  });

  // =========================
  // Overall All (业务真实盘子)
  // =========================
  const overall = aggregateBlock({
    leads: leadsMtd,
    trials: trialsMtd,
    orders: ordersMtd,
  });

  const overallLm = aggregateBlock({
    leads: leadsLm,
    trials: trialsLm,
    orders: ordersLm,
  });

  // =========================
  // Overall Managed (仅管理口径)
  // 只保留有 sales_group 的线索 / 试听 / 订单
  // =========================
  const leadsManaged = leadsMtd.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");
  const trialsManaged = trialsMtd.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");
  const ordersManaged = ordersMtd.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");

  const overallManaged = aggregateBlock({
    leads: leadsManaged,
    trials: trialsManaged,
    orders: ordersManaged,
  });

  // =========================
  // Exception Pool (未归属预约池)
  // 不进入团队PK / 不进入管理判断
  // =========================
  const exceptionTrials = trialsMtd.filter((r) => normalizeGroup(r.sales_group) === "(empty)");
  const exceptionOrders = ordersMtd.filter((r) => normalizeGroup(r.sales_group) === "(empty)");

  const exceptionPool = {
    booked: exceptionTrials.filter(isBookedStatus).length,
    attended: exceptionTrials.filter(isAttendedStatus).length,
    orders: exceptionOrders.length,
    gmv: exceptionOrders.reduce((s, r) => s + toNum(r.paid_amount), 0),
    booked_share_of_all: safeDiv(
      exceptionTrials.filter(isBookedStatus).length,
      overall.booked
    ),
    attended_share_of_all: safeDiv(
      exceptionTrials.filter(isAttendedStatus).length,
      overall.attended
    ),
  };

  // =========================
  // Team Breakdown
  // 只做 managed 团队对比，不显示 empty
  // =========================
  const teamKeys = new Set<string>([
    ...trialsManaged.map((r) => normalizeGroup(r.sales_group)),
    ...ordersManaged.map((r) => normalizeGroup(r.sales_group)),
    ...leadsManaged.map((r) => normalizeGroup(r.sales_group)),
  ]);

  const teamRows = Array.from(teamKeys)
    .filter((team) => team !== "(empty)")
    .map((team) => {
      const teamLeads = leadsManaged.filter((r) => normalizeGroup(r.sales_group) === team);
      const teamTrials = trialsManaged.filter((r) => normalizeGroup(r.sales_group) === team);
      const teamOrders = ordersManaged.filter((r) => normalizeGroup(r.sales_group) === team);

      return {
        sales_group: team,
        ...aggregateBlock({
          leads: teamLeads,
          trials: teamTrials,
          orders: teamOrders,
        }),
      };
    })
    .sort((a, b) => b.gmv - a.gmv);

  // =========================
  // Source Breakdown
  // 来源保留业务真实口径（基于 leadsMtd）
  // 但只通过 lead user_id 映射同用户的 MTD trials / orders
  // =========================
  const sourceMap = groupBy(leadsMtd, (r) => normalizeSource(r.lead_source));

  const sourceRows = Array.from(sourceMap.entries())
    .map(([lead_source, sourceLeads]) => {
      const leadUsers = new Set(
        sourceLeads.map((r: any) => normalizeUserId(r.user_id)).filter(Boolean)
      );

      const sourceTrials = trialsMtd.filter((r) =>
        leadUsers.has(normalizeUserId(r.user_id))
      );

      const sourceOrders = ordersMtd.filter((r) =>
        leadUsers.has(normalizeUserId(r.user_id))
      );

      return {
        lead_source,
        ...aggregateBlock({
          leads: sourceLeads,
          trials: sourceTrials,
          orders: sourceOrders,
        }),
      };
    })
    .sort((a, b) => b.leads - a.leads);

  return {
    report_date: reportDate,
    range: {
      mtd_start: mStart,
      mtd_end: reportDate,
      lm_same_period_start: lm.start,
      lm_same_period_end: lm.end,
    },

    // 业务全量口径
    overall,

    // 管理判断口径
    overall_managed: overallManaged,

    // 未归属异常池
    exception_pool: exceptionPool,

    overall_vs_last_month_same_period: {
      leads_delta: overall.leads - overallLm.leads,
      booked_delta: overall.booked - overallLm.booked,
      attended_delta: overall.attended - overallLm.attended,
      orders_delta: overall.orders - overallLm.orders,
      gmv_delta: overall.gmv - overallLm.gmv,
    },

    teams: teamRows,
    sources: sourceRows,
    monthly_target: monthlyTarget,
  };
}