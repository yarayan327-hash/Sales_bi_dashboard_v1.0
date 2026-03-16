import { DateTime } from "luxon";

export const KSA_TZ = "Asia/Riyadh";

export function todayKSA(): DateTime {
  return DateTime.now().setZone(KSA_TZ);
}

export function reportDefaultDateKSA_yyyyLLdd(): string {
  // 默认：KSA 昨天
  return todayKSA().minus({ days: 1 }).toFormat("yyyy-LL-dd");
}

export function parseFlexibleDateTime(input: string, tz = KSA_TZ): DateTime | null {
  const s = (input ?? "").trim();
  if (!s) return null;

  // Common patterns from your exports:
  // 2026/1/1 22:51
  // 2025/10/29 3:33
  // 2026-02-09T23:21:45+08:00
  // 2026-02-11 21:30
  const candidates = [
    "yyyy/M/d H:mm",
    "yyyy/M/d HH:mm",
    "yyyy/LL/dd HH:mm",
    "yyyy-LL-dd HH:mm",
    "yyyy-LL-dd'T'HH:mm:ssZZ",
    "yyyy-LL-dd'T'HH:mm:ss.SSSZZ",
    "yyyy-LL-dd'T'HH:mm:ss",
  ];

  for (const fmt of candidates) {
    const dt = DateTime.fromFormat(s, fmt, { zone: tz });
    if (dt.isValid) return dt;
  }

  // try ISO
  const iso = DateTime.fromISO(s, { zone: tz });
  if (iso.isValid) return iso;

  return null;
}

export function toDateKeyKSA(dt: DateTime): string {
  return dt.setZone(KSA_TZ).toFormat("yyyy-LL-dd");
}

export function clampPct(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function pct(n: number, d: number): number | null {
  if (!d) return null;
  return n / d;
}

export function fmtPct(p: number | null): string {
  if (p === null || !isFinite(p)) return "N/A";
  return `${(p * 100).toFixed(1)}%`;
}

export function fmtMoney(n: number | null): string {
  if (n === null || !isFinite(n)) return "0.00";
  return n.toFixed(2);
}
