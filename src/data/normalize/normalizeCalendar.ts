import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { WorkdayDim } from "../../types/normalized";
import { formatDateKey, parseAnyDateToKsa } from "../../utils/time";

export function normalizeCalendar(rows: Record<string, string>[]): WorkdayDim[] {
  return rows.map(r => {
    const dateRaw = pick(r, HEADERS.dim_work_calendar.date);
    const dt = parseAnyDateToKsa(dateRaw);
    const date_key = dt ? formatDateKey(dt) : (dateRaw || "").slice(0,10);

    const is_workday_raw = pick(r, HEADERS.dim_work_calendar.is_workday);
    const is_workday = String(is_workday_raw).trim() === "1" || String(is_workday_raw).toLowerCase() === "true";

    const name = pick(r, HEADERS.dim_work_calendar.name);
    return { date_key, is_workday, name };
  }).filter(x => x.date_key);
}
