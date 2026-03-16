export function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeRate(n: number, d: number): number | null {
  if (!d) return null;
  return n / d;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round0(n: number): number {
  return Math.round(n);
}
