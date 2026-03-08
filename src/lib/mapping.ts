// 解决：中英表头混用 + 字段缺失 + 学员ID里带括号

export function normalizeHeader(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

export function pickField(row: Record<string, any>, candidates: string[], fallbackIndex?: number): string {
  // 1) 按 header 名查
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => normalizeHeader(k) === normalizeHeader(c));
    if (key && row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
  }

  // 2) fallbackIndex（按列位置）: 需要 row 里有 __cols 数组（我们这里不强依赖）
  if (fallbackIndex != null && Array.isArray((row as any).__cols)) {
    const v = (row as any).__cols[fallbackIndex];
    if (v != null) return String(v).trim();
  }

  return "";
}

export function extractDigits(input: string): string {
  const s = String(input ?? "");
  const m = s.match(/(\d{5,})/);
  return m ? m[1] : "";
}

export function toNumberLoose(input: string): number {
  const s = String(input ?? "").trim();
  if (!s) return 0;
  // 0.00(SAR) -> 0.00
  const cleaned = s.replace(/\(.*?\)/g, "").replace(/,/g, "").replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

export function durationToSeconds(input: string): number {
  // "0:00:00"
  const s = String(input ?? "").trim();
  const parts = s.split(":").map((x) => Number(x));
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return (m || 0) * 60 + (sec || 0);
  }
  return 0;
}
