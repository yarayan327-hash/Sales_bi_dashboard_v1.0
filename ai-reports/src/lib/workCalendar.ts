import { DateTime } from "luxon";
import { KSA_TZ } from "./time";

/**
 * 默认工作日逻辑（KSA）：
 * 休息日：周五(5) + 周六(6)
 * 工作日：周日-周四
 *
 * 后续你如果补 07_work_calendar.csv：
 * - 你可以把 isWorkday(dateKey) 改成查表优先
 */

export function isWorkdayKSA(dateKey: string): boolean {
  const dt = DateTime.fromISO(dateKey, { zone: KSA_TZ });
  if (!dt.isValid) return true;
  // Luxon: Monday=1 ... Sunday=7
  // Friday=5, Saturday=6
  return dt.weekday !== 5 && dt.weekday !== 6;
}

export function listWorkdaysInMonth(dateKeyInMonth: string): string[] {
  const dt = DateTime.fromISO(dateKeyInMonth, { zone: KSA_TZ });
  const start = dt.startOf("month");
  const end = dt.endOf("month");

  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    const key = cur.toFormat("yyyy-LL-dd");
    if (isWorkdayKSA(key)) days.push(key);
    cur = cur.plus({ days: 1 });
  }
  return days;
}

export function countElapsedWorkdays(monthKey: string, reportDateKey: string): number {
  const workdays = listWorkdaysInMonth(monthKey);
  return workdays.filter((d) => d <= reportDateKey).length;
}
