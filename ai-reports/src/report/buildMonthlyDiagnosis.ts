export function buildMonthlyDiagnosis(payload: any) {
  const { overall_managed, monthly_target, teams, sources, exception_pool } = payload;
  const completion_rate = monthly_target > 0 ? overall_managed.gmv / monthly_target : 0;
  const conversionRate = overall_managed.attended_conversion_rate;
  const conversionOk = conversionRate >= 0.18;
  
  let failure_type_type = "转化型失败", failure_reasoning = "预约率达标，出席率达标，但转化率严重不足", failure_conclusion = "做了但浪费了";
  if (overall_managed.booking_rate < 0.45) { failure_type_type = "预约型失败"; failure_reasoning = "预约率不足，导致后续链路全面受影响"; failure_conclusion = "没做够"; }
  
  const operating_mode_mode = conversionRate < 0.18 ? "修复模式（Repair）" : "增长模式（Growth）";
  const allow_expansion = conversionRate >= 0.10;
  
  const sortedTeams = [...teams].sort((a, b) => b.gmv - a.gmv);
  const sortedSources = [...sources].sort((a, b) => b.attended_conversion_rate - a.attended_conversion_rate);
  const best_source = sortedSources.find(s => s.orders > 0) || sortedSources[0];
  if (best_source && best_source.lead_source?.includes("转介绍")) { best_source.source_label = "高转化表现来源（需溯源验证）"; best_source.needs_traceback = true; }
  
  const next_month_actions = [
    { priority: "P0", target: "低转化销售", action: "建立课后 6h/24h 强制跟进机制 + 复盘机制 + 抽检机制", why: "直接影响下月订单" },
    { priority: "P0", target: "零业绩销售", action: "1 对 1 辅导 + 每日业绩通报 + 末位约谈机制", why: "破零是底线" },
    { priority: "P1", target: "客服团队", action: "课前确认 SOP 建立 + 自动提醒机制 + 确认率考核", why: "提升出席率" },
    { priority: "P2", target: "管理层", action: "运行模式切换评估 + 扩量许可审批", why: "避免用错误模式误导团队行为" },
  ];
  
  return {
    summary: { core_problem: "转化", severity: 95, core_reason: `出席转化率仅 ${(conversionRate * 100).toFixed(1)}%，低于健康值 18.0%。`, problem_type: "系统性问题", completion_rate, time_progress: 1.0, remaining_target: monthly_target - overall_managed.gmv, remaining_days: 0, current_daily_gmv: overall_managed.gmv / 30, daily_gmv_needed: monthly_target - overall_managed.gmv, pressure_multiple: 999, executive_summary: `当前管理口径 GMV 仅完成 ${(completion_rate * 100).toFixed(1)}%，必须切换为能力修复模式。`, management_judgement: "当前最优先的不是补线索，而是止血转化浪费。先修复出席后的跟进和关单能力，再考虑扩量。" },
    diagnosis: { conversion: { ok: conversionOk, value: conversionRate, threshold: 0.18 }, attendance: { ok: overall_managed.attendance_rate >= 0.45, value: overall_managed.attendance_rate, threshold: 0.45 }, booking: { ok: overall_managed.booking_rate >= 0.5, value: overall_managed.booking_rate, threshold: 0.5 }, lead_conversion: { value: overall_managed.lead_conversion_rate } },
    failure_type: { type: failure_type_type, reasoning: failure_reasoning, conclusion: failure_conclusion },
    focus: { best_team: sortedTeams[0], weakest_team: sortedTeams[sortedTeams.length - 1], best_source, weakest_source: sortedSources.find(s => s.orders === 0) || sortedSources[sortedSources.length - 1], exception_pool: { ...exception_pool, severity: exception_pool.booked_share_of_all > 0.15 ? "高" : "低" } },
    next_month_actions,
    operating_mode: { mode: operating_mode_mode, allow_expansion, reasoning: conversionRate < 0.18 ? "转化率低于 18% 健康阈值，必须进入修复模式" : "转化率健康，可维持增长模式" },
  };
}
