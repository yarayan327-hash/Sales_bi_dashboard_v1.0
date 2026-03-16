export function includesAny(hay: string, needles: string[]): boolean {
  const s = (hay || "").toLowerCase();
  return needles.some(k => s.includes(k.toLowerCase()));
}

export function extractDigits(s: string): string {
  const m = (s || "").match(/(\d{5,})/);
  return m ? m[1] : (s || "").trim();
}
