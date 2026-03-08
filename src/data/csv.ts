import Papa from "papaparse";

export type CsvRow = Record<string, any>;

export const parseCsvText = (text: string): CsvRow[] => {
  const res = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true
  });
  return (res.data ?? []).map((r) => r ?? {});
};

export const fetchCsv = async (url: string): Promise<CsvRow[]> => {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Failed to load ${url}`);
  const text = await resp.text();
  return parseCsvText(text);
};
