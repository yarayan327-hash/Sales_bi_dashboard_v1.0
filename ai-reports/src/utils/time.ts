// src/utils/time.ts

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatYMD(d: Date) {
  // 用本地 getter 就够了，因为我们最终只用 YYYY-MM-DD 做比较
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Parse: "YYYY-MM-DD HH:mm ~ HH:mm"
 * Ramadan cross-day possible:
 * if end < start => end += 1 day
 */
export function parseTrialRangeKSA(
  raw: string
): { start: Date; end: Date; dateKey: string } | null {
  const s = (raw || "").trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/
  );
  if (!m) return null;

  const [_, Y, Mo, D, sh, sm, eh, em] = m;
  const start = new Date(
    Number(Y),
    Number(Mo) - 1,
    Number(D),
    Number(sh),
    Number(sm),
    0,
    0
  );
  let end = new Date(
    Number(Y),
    Number(Mo) - 1,
    Number(D),
    Number(eh),
    Number(em),
    0,
    0
  );

  // 跨天（如 23:30 ~ 00:00）
  if (end.getTime() < start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end, dateKey: formatYMD(start) };
}

export function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/** 把毫秒时间戳转成 YYYY-MM-DD（按本地日期） */
export function toReportDateFromMs(ms: number) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return formatYMD(d);
}

/** 把 Date 转成 YYYY-MM-DD */
export function toReportDate(d: Date) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return formatYMD(d);
}

/** 解析各种可能的时间字符串（ISO / 其他） */
export function parseAnyToKSA(raw: any): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

/**
 * orders.processed_time: "29/10/2025 4:31"
 * dd/mm/yyyy h:mm
 */
export function parseOrderProcessedTime(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
  );
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      0,
      0
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d2 = new Date(s);
  if (!Number.isNaN(d2.getTime())) return d2;

  return null;
}

/** KSA T-1（这里用本地时间计算也可用；你后面如果要严谨再做 UTC+3 版） */
export function ksaTodayMinus1() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return formatYMD(d);
}

/** 月初 YYYY-MM-01 */
export function monthStartYMD(ymd: string) {
  const s = String(ymd ?? "");
  return s.length >= 7 ? `${s.slice(0, 7)}-01` : "";
}

/** 判断 ymd 是否在区间内（字符串比较即可，前提是 YYYY-MM-DD） */
export function inRangeYMD(ymd: string, start: string, end: string) {
  const a = String(ymd ?? "").slice(0, 10);
  if (!a) return false;
  return a >= start && a <= end;
}