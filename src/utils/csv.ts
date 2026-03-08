// src/utils/csv.ts
/**
 * Robust CSV/TSV loader for public/data/*.csv
 * - Supports comma-separated CSV and tab-separated TSV (Excel export)
 * - Handles BOM
 * - Light quote handling
 * - Delimiter detection ignores quoted content
 */

export async function fetchTable(path: string, signal?: AbortSignal): Promise<Record<string, any>[]> {
  // cache-bust so Reload always fetches latest file
  const url = `${path}?t=${Date.now()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseDelimited(text);
}

export function parseDelimited(raw: string): Record<string, any>[] {
  const cleaned = stripBOM(raw).trim();
  if (!cleaned) return [];

  // keep empty last cell lines; remove pure empty lines
  const lines = cleaned.split(/\r?\n/).filter((l) => String(l).trim().length > 0);
  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const delimiter = detectDelimiter(headerLine);

  const headers = splitLine(headerLine, delimiter).map((h) => String(h).trim());
  if (headers.length === 0) return [];

  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    if (cols.length === 0) continue;

    const obj: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      const k = headers[c] || `col_${c}`;
      obj[k] = cols[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

/** Detect delimiter on header line, ignoring quoted parts */
function detectDelimiter(line: string) {
  const { tabCount, commaCount } = countDelimitersOutsideQuotes(line);
  if (tabCount >= commaCount && tabCount > 0) return "\t";
  return ",";
}

function countDelimitersOutsideQuotes(line: string) {
  let inQuotes = false;
  let tabCount = 0;
  let commaCount = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // handle escaped quotes ""
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes) {
      if (ch === "\t") tabCount++;
      else if (ch === ",") commaCount++;
    }
  }

  return { tabCount, commaCount };
}

function stripBOM(s: string) {
  return s.replace(/^\uFEFF/, "");
}

/**
 * Split a CSV/TSV line with light quote support:
 * - "a,b",c  (comma inside quotes)
 * - Works for TSV too
 */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // double quote escape ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => String(v ?? "").trim());
}