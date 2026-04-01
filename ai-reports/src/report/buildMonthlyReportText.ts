function fmt(n: number) {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString() : "0";
}

function pct(x: number) {
  return `${(Number(x ?? 0) * 100).toFixed(1)}%`;
}

export function buildMonthlyReportText(input: {
  payload: any;
  diagnosis: any;
}) {
  const payload = input.payload ?? {};
  const diagnosis = input.diagnosis ?? {};

  const overallAll = payload.overall ?? {};
  const overallManaged = payload.overall_managed ?? payload.overall ?? {};
  const exceptionPool = payload.exception_pool ?? {};
  const delta = payload.overall_vs_prev_month ?? {};
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const weeklyTrend = Array.isArray(payload.weekly_trend) ? payload.weekly_trend : [];
  const summary = diagnosis.summary ?? {};
  const focus = diagnosis.focus ?? {};

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
    .map((s: any) => {
      const label =
        focus?.best_source?.lead_source === s.lead_source && focus?.best_source?.source_label
          ? `（${focus.best_source.source_label}）`
          : "";
      return `- ${s.lead_source}${label}: 线索 ${fmt(s.leads)} / 预约 ${fmt(s.booked)} / 出席 ${fmt(
        s.attended
      )} / 成交 ${fmt(s.orders)} / 出席率 ${pct(s.attendance_rate)} / 转化率 ${pct(
        s.attended_conversion_rate
      )}`;
    })
    .join("\n");

  const trendLines = weeklyTrend
    .map(
      (w: any) =>
        `- ${w.label}（${w.start} ~ ${w.end}）：线索 ${fmt(w.leads)} / 预约 ${fmt(
          w.booked
        )} / 出席 ${fmt(w.attended)} / 成交 ${fmt(w.orders)} / GMV ${fmt(w.gmv)}`
    )
    .join("\n");

  const actionLines = (diagnosis.next_month_actions ?? [])
    .map((a: any) => `- ${a.priority}｜${a.target}：${a.action}`)
    .join("\n");

  return `📊 Sales Engine 月报
报告日期：${payload.report_date}
数据范围：${payload?.range?.month_start} ~ ${payload?.range?.month_end}

一、本月核心经营数据总览（业务全量）
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

二、本月管理口径核心经营数据（仅归属销售）
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

三、本月目标达成与上月对比
- 月目标达成结果：${summary.month_result}
- 管理口径完成率：${pct(summary.completion_rate)}
- 线索 Δ ${fmt(delta.leads_delta)}
- 预约 Δ ${fmt(delta.booked_delta)}
- 出席 Δ ${fmt(delta.attended_delta)}
- 成交 Δ ${fmt(delta.orders_delta)}
- GMV Δ ${fmt(delta.gmv_delta)}

四、本月趋势拆解
- 趋势方向：${summary.weekly_trend_direction}
${trendLines || "-"}

五、本月核心问题判断
- 核心问题：${summary.core_problem}
- 严重度：${fmt(summary.severity)}
- 问题类型：${summary.problem_type}
- 原因：${summary.core_reason}
- 管理结论：${summary.management_judgement}

六、团队拆解（仅归属销售）
${teamLines || "-"}

七、来源拆解（业务口径）
${sourceLines || "-"}
- 说明：若来源名称包含“转介绍”，当前只表示高转化表现，默认需做上游归因验证，不直接作为扩量依据。

八、数据异常监控
- 未归属预约池：预约 ${fmt(exceptionPool.booked)} / 出席 ${fmt(
    exceptionPool.attended
  )} / 成交 ${fmt(exceptionPool.orders)} / GMV ${fmt(exceptionPool.gmv)}
- 未归属预约占总预约：${pct(exceptionPool.booked_share_of_all)}
- 未归属出席占总出席：${pct(exceptionPool.attended_share_of_all)}
- 风险等级：${focus?.exception_pool?.severity || "低"}
- 说明：未归属预约池不参与团队PK与管理动作判断，但会影响业务全量漏斗表现；当占比过高时，应优先修复数据归属规则。

九、下月行动方向
${actionLines || "-"}

十、管理层一句话总结
${summary.executive_summary}

🦞 Sales Engine Monthly Report V1`;
}