import Papa from "papaparse";

export async function fetchText(path: string): Promise<string> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.text();
}

export async function loadCSV(path: string): Promise<{ headers: string[]; rows: Record<string, string>[]; raw: string }> {
  const raw = await fetchText(path);
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors?.length) {
    console.warn("[CSV PARSE WARN]", path, parsed.errors.slice(0, 3));
  }

  const headers = (parsed.meta.fields ?? []).map((h) => (h ?? "").trim());
  const rows = (parsed.data ?? []).filter(Boolean) as Record<string, string>[];
  return { headers, rows, raw };
}
