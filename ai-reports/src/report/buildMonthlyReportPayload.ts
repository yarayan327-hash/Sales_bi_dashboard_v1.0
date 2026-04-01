function toNum(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

function ymd(s: any) {
  const text = String(s ?? "").trim();
  if (!text) return "";

  const m = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!m) return text.slice(0, 10);

  const y = m[1];
  const mm = String(Number(m[2])).padStart(2, "0");
  const dd = String(Number(m[3])).padStart(2, "0");

  return `${y}-${mm}-${dd}`;
}

function monthStart(reportDate: string) {
  return `${String(reportDate).slice(0, 7)}-01`;
}

function monthEnd(reportDate: string) {
  const [y, m] = String(reportDate).slice(0, 7).split("-").map(Number);
  const last = new Date(y, m, 0);
  const dd = String(last.getDate()).padStart(2, "0");
  return `${String(y)}-${String(m).padStart(2, "0")}-${dd}`;
}

function prevMonthRange(reportDate: string) {
  const [y, m] = String(reportDate).slice(0, 7).split("-").map(Number);
  const prevStart = new Date(y, m - 2, 1);
  const prevEnd = new Date(y, m - 1, 0);
  return {
    start: `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, "0")}-01`,
    end: `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, "0")}-${String(
      prevEnd.getDate()
    ).padStart(2, "0")}`,
  };
}

function normalizeGroup(v: any) {
  return String(v ?? "").trim() || "(empty)";
}

function normalizeSource(v: any) {
  return String(v ?? "").trim() || "(empty)";
}

function parseLeadDate(r: any) {
  return ymd(r.assigned_time || r.assigned_date || r.assigned_time_ksa);
}

function parseTrialDate(r: any) {
  return ymd(r.class_date_ksa || r.class_start_ksa || r.class_date || r.trial_date);
}

function parseOrderDate(r: any) {
  return ymd(r.processed_time || r.processed_date || r.order_time || r.order_date || r.processed_time_ksa);
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

function normId(v: any) {
  return String(v ?? "").trim();
}

function collectCandidateIds(record: any, keys: string[]) {
  const ids = new Set<string>();
  for (const key of keys) {
    const val = normId(record?.[key]);
    if (val) ids.add(val);
  }
  return Array.from(ids);
}

function getLeadCandidateIds(record: any) {
  return collectCandidateIds(record, [
    "user_id",
    "student_id",
    "account_id",
    "lead_user_id",
    "source_user_id",
    "parent_user_id",
    "family_id",
    "phone",
    "mobile",
    "wa_phone",
  ]);
}

function getTrialCandidateIds(record: any) {
  return collectCandidateIds(record, [
    "user_id",
    "student_id",
    "account_id",
    "lead_user_id",
    "source_user_id",
    "parent_user_id",
    "family_id",
    "phone",
    "mobile",
    "wa_phone",
  ]);
}

function getOrderCandidateIds(record: any) {
  return collectCandidateIds(record, [
    "user_id",
    "student_id",
    "account_id",
    "lead_user_id",
    "source_user_id",
    "parent_user_id",
    "family_id",
    "phone",
    "mobile",
    "wa_phone",
  ]);
}

function buildLeadSourceIndex(leads: any[]) {
  const idToSource = new Map<string, string>();
  const sourceLeadRows = new Map<string, any[]>();

  for (const lead of leads) {
    const source = normalizeSource(lead.lead_source);

    if (!sourceLeadRows.has(source)) sourceLeadRows.set(source, []);
    sourceLeadRows.get(source)!.push(lead);

    const ids = getLeadCandidateIds(lead);
    for (const id of ids) {
      if (!idToSource.has(id)) {
        idToSource.set(id, source);
      }
    }
  }

  return { idToSource, sourceLeadRows };
}

function resolveSourceFromRecord(
  record: any,
  getIds: (r: any) => string[],
  idToSource: Map<string, string>
) {
  const ids = getIds(record);
  for (const id of ids) {
    const source = idToSource.get(id);
    if (source) return source;
  }
  return "unknown";
}

function buildSourceRowsV2(input: {
  leads: any[];
  trials: any[];
  orders: any[];
}) {
  const leads = input.leads ?? [];
  const trials = input.trials ?? [];
  const orders = input.orders ?? [];

  const { idToSource, sourceLeadRows } = buildLeadSourceIndex(leads);

  const metricsMap = new Map<
    string,
    {
      lead_source: string;
      leads: number;
      booked: number;
      attended: number;
      orders: number;
      gmv: number;
    }
  >();

  const ensureSource = (source: string) => {
    if (!metricsMap.has(source)) {
      metricsMap.set(source, {
        lead_source: source,
        leads: 0,
        booked: 0,
        attended: 0,
        orders: 0,
        gmv: 0,
      });
    }
    return metricsMap.get(source)!;
  };

  for (const [source, rows] of sourceLeadRows.entries()) {
    const row = ensureSource(source);
    row.leads = rows.length;
  }

  for (const t of trials) {
    const source = resolveSourceFromRecord(t, getTrialCandidateIds, idToSource);
    const row = ensureSource(source);

    if (isBookedStatus(t)) row.booked += 1;
    if (isAttendedStatus(t)) row.attended += 1;
  }

  for (const o of orders) {
    const source = resolveSourceFromRecord(o, getOrderCandidateIds, idToSource);
    const row = ensureSource(source);

    row.orders += 1;
    row.gmv += toNum(o.paid_amount);
  }

  return Array.from(metricsMap.values())
    .map((r) => ({
      lead_source: r.lead_source,
      leads: r.leads,
      booked: r.booked,
      attended: r.attended,
      orders: r.orders,
      gmv: r.gmv,
      booking_rate: safeDiv(r.booked, r.leads),
      attendance_rate: safeDiv(r.attended, r.booked),
      attended_conversion_rate: safeDiv(r.orders, r.attended),
      lead_conversion_rate: safeDiv(r.orders, r.leads),
      aov: safeDiv(r.gmv, r.orders),
    }))
    .sort((a, b) => {
      if (a.lead_source === "unknown") return 1;
      if (b.lead_source === "unknown") return -1;
      return b.leads - a.leads;
    });
}

function buildWeekBuckets(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const ranges: { label: string; start: string; end: string }[] = [];

  let current = new Date(s);
  let idx = 1;
  while (current <= e) {
    const ws = new Date(current);
    const we = new Date(current);
    we.setDate(we.getDate() + 6);
    if (we > e) we.setTime(e.getTime());

    const startStr = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, "0")}-${String(
      ws.getDate()
    ).padStart(2, "0")}`;
    const endStr = `${we.getFullYear()}-${String(we.getMonth() + 1).padStart(2, "0")}-${String(
      we.getDate()
    ).padStart(2, "0")}`;

    ranges.push({
      label: `Week${idx}`,
      start: startStr,
      end: endStr,
    });

    current.setDate(current.getDate() + 7);
    idx += 1;
  }

  return ranges;
}

export function buildMonthlyReportPayload(input: {
  reportDate: string;
  monthlyTarget?: number;
  leads: any[];
  trials: any[];
  orders: any[];
}) {
  const reportDate = String(input.reportDate ?? "").slice(0, 10);
  const mStart = monthStart(reportDate);
  const mEnd = monthEnd(reportDate);
  const prevMonth = prevMonthRange(reportDate);

  const leads = Array.isArray(input.leads) ? input.leads : [];
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const monthlyTarget = toNum(input.monthlyTarget);

  const leadsMonth = leads.filter((r) => {
    const d = parseLeadDate(r);
    return d >= mStart && d <= mEnd;
  });

  const trialsMonth = trials.filter((r) => {
    const d = parseTrialDate(r);
    return d >= mStart && d <= mEnd;
  });

  const ordersMonth = orders.filter((r) => {
    const d = parseOrderDate(r);
    return d >= mStart && d <= mEnd;
  });

  const leadsPrev = leads.filter((r) => {
    const d = parseLeadDate(r);
    return d >= prevMonth.start && d <= prevMonth.end;
  });

  const trialsPrev = trials.filter((r) => {
    const d = parseTrialDate(r);
    return d >= prevMonth.start && d <= prevMonth.end;
  });

  const ordersPrev = orders.filter((r) => {
    const d = parseOrderDate(r);
    return d >= prevMonth.start && d <= prevMonth.end;
  });

  const overall = aggregateBlock({
    leads: leadsMonth,
    trials: trialsMonth,
    orders: ordersMonth,
  });

  const overallPrev = aggregateBlock({
    leads: leadsPrev,
    trials: trialsPrev,
    orders: ordersPrev,
  });

  const leadsManaged = leadsMonth.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");
  const trialsManaged = trialsMonth.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");
  const ordersManaged = ordersMonth.filter((r) => normalizeGroup(r.sales_group) !== "(empty)");

  const overallManaged = aggregateBlock({
    leads: leadsManaged,
    trials: trialsManaged,
    orders: ordersManaged,
  });

  const exceptionTrials = trialsMonth.filter((r) => normalizeGroup(r.sales_group) === "(empty)");
  const exceptionOrders = ordersMonth.filter((r) => normalizeGroup(r.sales_group) === "(empty)");

  const exceptionPool = {
    booked: exceptionTrials.filter(isBookedStatus).length,
    attended: exceptionTrials.filter(isAttendedStatus).length,
    orders: exceptionOrders.length,
    gmv: exceptionOrders.reduce((s, r) => s + toNum(r.paid_amount), 0),
    booked_share_of_all: safeDiv(exceptionTrials.filter(isBookedStatus).length, overall.booked),
    attended_share_of_all: safeDiv(exceptionTrials.filter(isAttendedStatus).length, overall.attended),
  };

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

  const sourceRows = buildSourceRowsV2({
    leads: leadsMonth,
    trials: trialsMonth,
    orders: ordersMonth,
  });

  const weekBuckets = buildWeekBuckets(mStart, mEnd);
  const weeklyTrend = weekBuckets.map((w) => {
    const weekLeads = leadsMonth.filter((r) => {
      const d = parseLeadDate(r);
      return d >= w.start && d <= w.end;
    });

    const weekTrials = trialsMonth.filter((r) => {
      const d = parseTrialDate(r);
      return d >= w.start && d <= w.end;
    });

    const weekOrders = ordersMonth.filter((r) => {
      const d = parseOrderDate(r);
      return d >= w.start && d <= w.end;
    });

    return {
      label: w.label,
      start: w.start,
      end: w.end,
      ...aggregateBlock({
        leads: weekLeads,
        trials: weekTrials,
        orders: weekOrders,
      }),
    };
  });

  return {
    report_date: reportDate,
    range: {
      month_start: mStart,
      month_end: mEnd,
      prev_month_start: prevMonth.start,
      prev_month_end: prevMonth.end,
    },
    overall,
    overall_managed: overallManaged,
    exception_pool: exceptionPool,
    overall_vs_prev_month: {
      leads_delta: overall.leads - overallPrev.leads,
      booked_delta: overall.booked - overallPrev.booked,
      attended_delta: overall.attended - overallPrev.attended,
      orders_delta: overall.orders - overallPrev.orders,
      gmv_delta: overall.gmv - overallPrev.gmv,
    },
    teams: teamRows,
    sources: sourceRows,
    weekly_trend: weeklyTrend,
    monthly_target: monthlyTarget,
  };
}