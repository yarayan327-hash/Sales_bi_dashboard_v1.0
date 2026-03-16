// src/report/reportUtils.ts
export function s(v: any) {
  return String(v ?? "").trim();
}

export function toNum(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeName(v: any) {
  return s(v).replace(/\u3000/g, " ").replace(/\s+/g, " ").toLowerCase();
}

export function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function getNowKSA() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + 3 * 60 * 60 * 1000);
}

export function getDefaultReportDateKSA() {
  const d = getNowKSA();
  d.setDate(d.getDate() - 1);
  return fmtYMD(d);
}

export function monthStartYmd(reportDate: string) {
  const y = Number(reportDate.slice(0, 4));
  const m = Number(reportDate.slice(5, 7));
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function shiftMonthKeepDay(ymd: string, deltaMonths: number) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));

  const dt = new Date(y, m - 1, 1);
  dt.setMonth(dt.getMonth() + deltaMonths);

  const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(d, lastDay);

  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function inRangeYmd(ymd: string, start: string, end: string) {
  return !!ymd && ymd >= start && ymd <= end;
}

export function bjIsoToKsaYmd(raw: any): string {
  const text = s(raw);
  if (!text) return "";

  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return "";

  const ksa = new Date(ts + (-5) * 60 * 60 * 1000); // 北京 +8 -> KSA +3，减 5 小时
  return fmtYMD(ksa);
}

export function parseLooseYmd(raw: any): string {
  const text = s(raw);
  if (!text) return "";

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  }

  m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  }

  // DD/MM/YYYY
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }

  return "";
}

export function parseKsaDateTimeToTs(raw: any): number | null {
  const text = s(raw).replace(/\//g, "-").replace("T", " ");
  if (!text) return null;

  // 2026-03-13 00:30 ~ 01:00
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\s*~/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0
    ).getTime();
  }

  // 2026-03-13 00:30
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0
    ).getTime();
  }

  const ts = Date.parse(text);
  return Number.isFinite(ts) ? ts : null;
}

export function parseCallsOutboundToTs(raw: any): number | null {
  const text = s(raw);
  if (!text) return null;

  // 07/02/2026 21:39 -> 按 DD/MM/YYYY 解析
  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      0
    ).getTime();
  }

  // YYYY/MM/DD HH:mm
  m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0
    ).getTime();
  }

  const ts = Date.parse(text.replace(/\//g, "-"));
  return Number.isFinite(ts) ? ts : null;
}

export function parseDurationSecFromCallStatus(raw: any) {
  const text = s(raw);
  if (!text) return 0;
  const m = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function extractUserId(raw: any) {
  const text = s(raw);
  const m = text.match(/\((\d+)\)/);
  if (m) return m[1];
  return /^\d+$/.test(text) ? text : text;
}