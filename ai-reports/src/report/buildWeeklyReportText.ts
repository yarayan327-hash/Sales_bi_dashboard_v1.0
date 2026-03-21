function fmt(n: number) {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString() : "0";
}

function pct(x: number) {
  return `${(Number(x ?? 0) * 100).toFixed(1)}%`;
}

export function buildWeeklyReportText(input: {
  payload: any;
  diagnosis: any;
}) {
  const payload = input.payload ?? {};
  const diagnosis = input.diagnosis ?? {};

  const overallAll = payload.overall ?? {};
  const overallManaged = payload.overall_managed ?? payload.overall ?? {};
  const exceptionPool = payload.exception_pool ?? {};
  const delta = payload.overall_vs_last_month_same_period ?? {};
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const summary = diagnosis.summary ?? {};

  const teamLines = teams
    .map(
      (t: any) =>
        `- Team${t.sales_group}: 线索 ${fmt(t.leads)} / 预约 ${fmt(t.booked)} / 出席 ${fmt(
          t.attended
        )} / 成交 ${fmt(t.orders)} / GMV ${fmt(t.gmv)} / 出席率 ${pct(
          t.attendance_rate
        )} / 转化率 ${pct(t.attended_conversion_rate)}`
    )
    .join("\n");

  const sourceLines = sources
    .slice(0, 8)
    .map(
      (s: any) =>
        `- ${s.lead_source}: 线索 ${fmt(s.leads)} / 预约 ${fmt(s.booked)} / 出席 ${fmt(
          s.attended
        )} / 成交 ${fmt(s.orders)} / 出席率 ${pct(s.attendance_rate)} / 转化率 ${pct(
          s.attended_conversion_rate
        )}`
    )
    .join("\n");

  const actionLines = (diagnosis.next_week_actions ?? [])
    .map((a: any) => `- ${a.priority}｜${a.target}：${a.action}`)
    .join("\n");

  return `📊 Sales Engine 周报
报告日期：${payload.report_date}
数据范围：MTD ${payload?.range?.mtd_start} ~ ${payload?.range?.mtd_end}

一、MTD 核心经营数据总览（业务全量）
- 线索：${fmt(overallAll.leads)}
- 预约：${fmt(overallAll.booked)}
- 出席：${fmt(overallAll.attended)}
- 成交：${fmt(overallAll.orders)}
- GMV：${fmt(overallAll.gmv)}
- 预约率：${pct(overallAll.booking_rate)}
- 出席率：${pct(overallAll.attendance_rate)}
- 出席转化率：${pct(overallAll.attended_conversion_rate)}
- 线索转化率：${pct(overallAll.lead_conversion_rate)}
- 客单价：${fmt(overallAll.aov)}

二、管理口径核心经营数据（仅归属销售）
- 线索：${fmt(overallManaged.leads)}
- 预约：${fmt(overallManaged.booked)}
- 出席：${fmt(overallManaged.attended)}
- 成交：${fmt(overallManaged.orders)}
- GMV：${fmt(overallManaged.gmv)}
- 预约率：${pct(overallManaged.booking_rate)}
- 出席率：${pct(overallManaged.attendance_rate)}
- 出席转化率：${pct(overallManaged.attended_conversion_rate)}
- 线索转化率：${pct(overallManaged.lead_conversion_rate)}
- 客单价：${fmt(overallManaged.aov)}

三、整体趋势对比（业务全量 MTD vs 上月同期）
- 线索 Δ ${fmt(delta.leads_delta)}
- 预约 Δ ${fmt(delta.booked_delta)}
- 出席 Δ ${fmt(delta.attended_delta)}
- 成交 Δ ${fmt(delta.orders_delta)}
- GMV Δ ${fmt(delta.gmv_delta)}

四、MTD 节奏判断（管理口径）
- 当前完成率：${pct(summary.completion_rate)}
- 时间进度：${pct(summary.time_progress)}
- 节奏判断：${summary.rhythm}
- 可达性：${summary.feasibility}
- 剩余目标：${fmt(summary.remaining_target)}
- 剩余天数：${fmt(summary.remaining_days)}
- 当前日均 GMV：${fmt(summary.current_daily_gmv)}
- 当前日均订单：${fmt(summary.current_daily_orders)}
- 日均需完成 GMV：${fmt(summary.daily_gmv_needed)}
- 日均需完成订单：${summary.daily_orders_needed?.toFixed?.(1) ?? "0.0"}

五、核心问题判断
- 核心问题：${summary.core_problem}
- 严重度：${fmt(summary.severity)}
- 问题类型：${summary.problem_type}
- 原因：${summary.core_reason}
- 管理结论：${summary.management_judgement}

六、团队拆解（仅归属销售）
${teamLines || "-"}

七、来源拆解（业务口径）
${sourceLines || "-"}

八、数据异常监控
- 未归属预约池：预约 ${fmt(exceptionPool.booked)} / 出席 ${fmt(
    exceptionPool.attended
  )} / 成交 ${fmt(exceptionPool.orders)} / GMV ${fmt(exceptionPool.gmv)}
- 未归属预约占总预约：${pct(exceptionPool.booked_share_of_all)}
- 未归属出席占总出席：${pct(exceptionPool.attended_share_of_all)}
- 说明：未归属预约池不参与团队PK与管理动作判断，但会影响业务全量漏斗表现。

九、下周行动计划
${actionLines || "-"}

十、管理层一句话总结
${summary.executive_summary}

🦞 Sales Engine Weekly Report V1`;
}