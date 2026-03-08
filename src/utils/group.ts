export function normalizeGroupName(raw: string): string {
  const s = (raw || "").trim();
  // Accept "Team001", "_____001_", "前端销售部001组" etc.
  const m = s.match(/(001|002|003|004|005|006)/);
  if (m) return m[1];
  return s || "UNASSIGNED";
}
