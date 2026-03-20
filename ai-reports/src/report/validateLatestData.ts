import fs from "fs";
import path from "path";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  reportDate: string;
  checkedAt: string;
  issues: ValidationIssue[];
  checkedFiles: string[];
}

function safeReadJson(filePath: string): any | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function normalizeJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

function extractDateFromPayload(payload: any): string {
  return String(
    payload?.report_date ??
      payload?.daily_metrics?.report_date ??
      payload?.daily_metrics?.yesterday?.report_date ??
      ""
  ).slice(0, 10);
}

function getMonthStart(reportDate: string): string {
  return `${String(reportDate).slice(0, 7)}-01`;
}

function extractYmdFromAny(raw: any): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  // 支持：
  // 2026-03-19
  // 2026/3/19
  // 2026-03-19 12:00
  // 2026/3/19 12:00
  // 2026-03-19T12:00:00+08:00
  const m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return "";

  const y = m[1];
  const mm = String(Number(m[2])).padStart(2, "0");
  const dd = String(Number(m[3])).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function isWithinMtd(ymd: string, monthStart: string, reportDate: string): boolean {
  return !!ymd && ymd >= monthStart && ymd <= reportDate;
}

function validateMtdDateField(params: {
  data: any[];
  field: string;
  monthStart: string;
  reportDate: string;
  fileLabel: string;
  maxExamples?: number;
}): ValidationIssue[] {
  const {
    data,
    field,
    monthStart,
    reportDate,
    fileLabel,
    maxExamples = 5,
  } = params;

  const issues: ValidationIssue[] = [];
  if (!Array.isArray(data)) {
    issues.push({
      level: "error",
      code: "INVALID_ACTION_FILE",
      message: `${fileLabel} 不是数组，无法校验 MTD 口径`,
    });
    return issues;
  }

  const outOfRangeRows = data
    .map((row, idx) => {
      const raw = row?.[field];
      const ymd = extractYmdFromAny(raw);
      return { idx, raw, ymd };
    })
    .filter((x) => !!x.raw && !!x.ymd && !isWithinMtd(x.ymd, monthStart, reportDate));

  if (outOfRangeRows.length > 0) {
    const examples = outOfRangeRows
      .slice(0, maxExamples)
      .map((x) => `${field}=${x.raw}`)
      .join("; ");

    issues.push({
      level: "error",
      code: "ACTION_SCOPE_NOT_MTD",
      message: `${fileLabel} 存在非 MTD 数据（字段 ${field}），示例：${examples}`,
    });
  }

  const missingDateRows = data
    .map((row, idx) => {
      const raw = row?.[field];
      const ymd = extractYmdFromAny(raw);
      return { idx, raw, ymd };
    })
    .filter((x) => !!x.raw && !x.ymd);

  if (missingDateRows.length > 0) {
    const examples = missingDateRows
      .slice(0, maxExamples)
      .map((x) => `${field}=${x.raw}`)
      .join("; ");

    issues.push({
      level: "warning",
      code: "UNPARSEABLE_ACTION_DATE",
      message: `${fileLabel} 中有无法解析的日期字段（${field}），示例：${examples}`,
    });
  }

  return issues;
}

export function validateLatestData(input: {
  reportDate: string;
  outputDir?: string;
}): ValidationResult {
  const reportDate = String(input.reportDate ?? "").slice(0, 10);
  const outputDir = input.outputDir || path.resolve("output");
  const latestDir = path.join(outputDir, "latest");
  const monthStart = getMonthStart(reportDate);

  const requiredLatestFiles = [
    "daily_metrics.json",
    "report_payload.json",
    "action_payload.json",
    "daily_report_cn.txt",
    "daily_report_en.txt",
    "sales_todo.json",
    "unreached_leads.json",
    "preclass_unfollowed.json",
    "postclass_unfollowed.json",
  ];

  const issues: ValidationIssue[] = [];
  const checkedFiles: string[] = [];

  // 1) latest 必需文件
  for (const name of requiredLatestFiles) {
    const p = path.join(latestDir, name);
    checkedFiles.push(p);
    if (!fileExists(p)) {
      issues.push({
        level: "error",
        code: "MISSING_LATEST_FILE",
        message: `latest 缺少必需文件: ${name}`,
      });
    }
  }

  const hasMissingCritical = issues.some((i) => i.level === "error");
  if (hasMissingCritical) {
    return {
      ok: false,
      reportDate,
      checkedAt: new Date().toISOString(),
      issues,
      checkedFiles,
    };
  }

  // 2) latest report_date 校验
  const latestReportPayloadPath = path.join(latestDir, "report_payload.json");
  const latestDailyMetricsPath = path.join(latestDir, "daily_metrics.json");

  const latestReportPayload = safeReadJson(latestReportPayloadPath);
  const latestDailyMetrics = safeReadJson(latestDailyMetricsPath);

  const payloadDate =
    extractDateFromPayload(latestReportPayload) ||
    extractDateFromPayload(latestDailyMetrics);

  if (!payloadDate) {
    issues.push({
      level: "error",
      code: "MISSING_REPORT_DATE",
      message: "无法从 latest/report_payload.json 或 daily_metrics.json 中识别 report_date",
    });
  } else if (payloadDate !== reportDate) {
    issues.push({
      level: "error",
      code: "STALE_LATEST_DATA",
      message: `latest 数据日期不匹配：期望 ${reportDate}，实际 ${payloadDate}`,
    });
  }

  // 3) latest vs dated 文件一致性
  const pairFiles = ["daily_metrics", "report_payload", "action_payload"];

  for (const base of pairFiles) {
    const datedPath = path.join(outputDir, `${base}_${reportDate}.json`);
    const latestPath = path.join(latestDir, `${base}.json`);

    checkedFiles.push(datedPath);
    checkedFiles.push(latestPath);

    if (!fileExists(datedPath)) {
      issues.push({
        level: "error",
        code: "MISSING_DATED_FILE",
        message: `缺少当日文件：${base}_${reportDate}.json`,
      });
      continue;
    }

    const latestJson = safeReadJson(latestPath);
    const datedJson = safeReadJson(datedPath);

    if (!latestJson || !datedJson) {
      issues.push({
        level: "error",
        code: "INVALID_JSON",
        message: `${base} 的 latest 或 dated 文件无法解析 JSON`,
      });
      continue;
    }

    if (normalizeJson(latestJson) !== normalizeJson(datedJson)) {
      issues.push({
        level: "error",
        code: "LATEST_DATED_MISMATCH",
        message: `latest/${base}.json 与 ${base}_${reportDate}.json 内容不一致`,
      });
    }
  }

  // 4) 真正的 MTD 行动口径校验
  const unreachedLeads = safeReadJson(path.join(latestDir, "unreached_leads.json"));
  const preclassUnfollowed = safeReadJson(path.join(latestDir, "preclass_unfollowed.json"));
  const postclassUnfollowed = safeReadJson(path.join(latestDir, "postclass_unfollowed.json"));
  const salesTodo = safeReadJson(path.join(latestDir, "sales_todo.json"));

  issues.push(
    ...validateMtdDateField({
      data: unreachedLeads,
      field: "assigned_time",
      monthStart,
      reportDate,
      fileLabel: "unreached_leads.json",
    })
  );

  issues.push(
    ...validateMtdDateField({
      data: preclassUnfollowed,
      field: "class_start_ksa",
      monthStart,
      reportDate,
      fileLabel: "preclass_unfollowed.json",
    })
  );

  issues.push(
    ...validateMtdDateField({
      data: postclassUnfollowed,
      field: "class_start_ksa",
      monthStart,
      reportDate,
      fileLabel: "postclass_unfollowed.json",
    })
  );

  // sales_todo 通常是聚合结果，不强制检查所有字段日期
  // 只做轻量结构检查，避免误报
  if (!Array.isArray(salesTodo)) {
    issues.push({
      level: "warning",
      code: "INVALID_SALES_TODO",
      message: "sales_todo.json 不是数组，跳过销售待办结构检查",
    });
  }

  return {
    ok: !issues.some((i) => i.level === "error"),
    reportDate,
    checkedAt: new Date().toISOString(),
    issues,
    checkedFiles,
  };
}
