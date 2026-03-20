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

function safeReadText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
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
  return (
    String(
      payload?.report_date ??
        payload?.daily_metrics?.report_date ??
        payload?.daily_metrics?.yesterday?.report_date ??
        ""
    ).slice(0, 10)
  );
}

function hasCrossMonthRisk(reportDate: string, payload: any): boolean {
  const monthPrefix = String(reportDate).slice(0, 7);
  const text = JSON.stringify(payload);

  // 只做轻量风险提示，不做强制报错
  // 如果 payload 中明显出现更早月份日期，则提示
  const dateMatches = text.match(/\d{4}-\d{2}-\d{2}/g) || [];
  return dateMatches.some((d) => !String(d).startsWith(monthPrefix));
}

export function validateLatestData(input: {
  reportDate: string;
  outputDir?: string;
}): ValidationResult {
  const reportDate = String(input.reportDate ?? "").slice(0, 10);
  const outputDir = input.outputDir || path.resolve("output");

  const latestDir = path.join(outputDir, "latest");

  const requiredLatestFiles = [
    "daily_metrics.json",
    "report_payload.json",
    "action_payload.json",
    "daily_report_cn.txt",
    "daily_report_en.txt",
  ];

  const issues: ValidationIssue[] = [];
  const checkedFiles: string[] = [];

  // 1) 检查 latest 必需文件
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

  // 如果基础文件都不齐，后面不继续深挖
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

  // 2) 检查 latest report_payload 日期
  const latestReportPayloadPath = path.join(latestDir, "report_payload.json");
  const latestActionPayloadPath = path.join(latestDir, "action_payload.json");
  const latestDailyMetricsPath = path.join(latestDir, "daily_metrics.json");

  const latestReportPayload = safeReadJson(latestReportPayloadPath);
  const latestActionPayload = safeReadJson(latestActionPayloadPath);
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

  // 3) 检查 latest 和当日文件一致性
  const pairFiles = [
    "daily_metrics",
    "report_payload",
    "action_payload",
  ];

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

  // 4) 轻量检查跨月污染风险（warning）
  if (latestActionPayload && hasCrossMonthRisk(reportDate, latestActionPayload)) {
    issues.push({
      level: "warning",
      code: "CROSS_MONTH_RISK",
      message: "action_payload 中检测到跨月日期，需确认行动数据是否已严格限制为 MTD",
    });
  }

  if (latestReportPayload && hasCrossMonthRisk(reportDate, latestReportPayload)) {
    issues.push({
      level: "warning",
      code: "REPORT_PAYLOAD_CROSS_MONTH_RISK",
      message: "report_payload 中检测到跨月日期，需确认分析口径是否正确",
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