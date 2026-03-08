// src/utils/status.ts
export function isAttendedStatus(status: any) {
  return String(status ?? "").trim().toLowerCase() === "end";
}