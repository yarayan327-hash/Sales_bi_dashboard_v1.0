// src/report/buildDailyMetricsPayload.ts
import {
  bjIsoToKsaYmd,
  inRangeYmd,
  monthStartYmd,
  parseLooseYmd,
  shiftMonthKeepDay,
  toNum
} from "./reportUtils";

type Input = {
  reportDate: string;
  leads: any[];
  trials: any[];
  orders: any[];
};

function isAttended(trial: any) {
  return String(trial.class_status ?? "").trim().toLowerCase() === "end";
}

function leadYmd(r: any) {
  return bjIsoToKsaYmd(r.assigned_time);
}

function trialYmd(r: any) {
  return parseLooseYmd(r.class_start_ksa || r.start_time_bj || r.booked_at);
}

function orderYmd(r: any) {
  return parseLooseYmd(r.processed_time);
}

function aggBlock(leads: any[], trials: any[], orders: any[]) {
  const leadsCount = leads.length;
  const booked = trials.filter((t) => String(t.class_status ?? "").trim().toLowerCase() !== "cancel").length;
  const attended = trials.filter(isAttended).length;
  const ordersCount = orders.length;
  const gmv = orders.reduce((s, r) => s + toNum(r.paid_amount), 0);

  return {
    leads: leadsCount,
    booked,
    attended,
    orders: ordersCount,
    gmv,
    booking_rate: leadsCount ? booked / leadsCount : 0,
    attendance_rate: booked ? attended / booked : 0,
    attended_conversion_rate: attended ? ordersCount / attended : 0,
    lead_conversion_rate: leadsCount ? ordersCount / leadsCount : 0,
    aov: ordersCount ? gmv / ordersCount : 0
  };
}

export function buildDailyMetricsPayload(input: Input) {
  const reportDate = input.reportDate;
  const yesterday = reportDate;
  const mtdStart = monthStartYmd(reportDate);

  const lmStart = shiftMonthKeepDay(mtdStart, -1);
  const lmEnd = shiftMonthKeepDay(reportDate, -1);

  const leadsYesterday = input.leads.filter((r) => leadYmd(r) === yesterday);
  const trialsYesterday = input.trials.filter((r) => trialYmd(r) === yesterday);
  const ordersYesterday = input.orders.filter((r) => orderYmd(r) === yesterday);

  const leadsMtd = input.leads.filter((r) => inRangeYmd(leadYmd(r), mtdStart, reportDate));
  const trialsMtd = input.trials.filter((r) => inRangeYmd(trialYmd(r), mtdStart, reportDate));
  const ordersMtd = input.orders.filter((r) => inRangeYmd(orderYmd(r), mtdStart, reportDate));

  const leadsLm = input.leads.filter((r) => inRangeYmd(leadYmd(r), lmStart, lmEnd));
  const trialsLm = input.trials.filter((r) => inRangeYmd(trialYmd(r), lmStart, lmEnd));
  const ordersLm = input.orders.filter((r) => inRangeYmd(orderYmd(r), lmStart, lmEnd));

  const yesterdayBlock = aggBlock(leadsYesterday, trialsYesterday, ordersYesterday);
  const mtdBlock = aggBlock(leadsMtd, trialsMtd, ordersMtd);
  const lmBlock = aggBlock(leadsLm, trialsLm, ordersLm);

  return {
    report_date: reportDate,
    yesterday: yesterdayBlock,
    mtd: mtdBlock,
    vs_last_month_same_period: {
      leads_delta: mtdBlock.leads - lmBlock.leads,
      booked_delta: mtdBlock.booked - lmBlock.booked,
      attended_delta: mtdBlock.attended - lmBlock.attended,
      orders_delta: mtdBlock.orders - lmBlock.orders,
      gmv_delta: mtdBlock.gmv - lmBlock.gmv
    },
    debug: {
      ranges: {
        yesterday,
        mtd: { start: mtdStart, end: reportDate },
        lm_same_period: { start: lmStart, end: lmEnd }
      }
    }
  };
}