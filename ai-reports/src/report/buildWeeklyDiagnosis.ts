function pct(n: number) {
  return `${(Number(n ?? 0) * 100).toFixed(1)}%`;
}

function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildWeeklyDiagnosis(input: any) {
  // ⚠️ 管理判断必须基于 overall_managed
  const overall = input?.overall_managed ?? input?.overall ?? {};
  const overallAll = input?.overall ?? {};
  const exceptionPool = input?.exception_pool ?? {};
  const target = safeNum(input?.monthly_target);
  const reportDate = String(input?.report_date ?? "");
  const teams = Array.isArray(input?.teams) ? input.teams : [];
  const sources = Array.isArray(input?.sources) ? input.sources : [];

  const leads = safeNum(overall?.leads);
  const booked = safeNum(overall?.booked);
  const attended = safeNum(overall?.attended);
  const orders = safeNum(overall?.orders);
  const gmv = safeNum(overall?.gmv);

  const attendanceRate = safeNum(overall?.attendance_rate);
  const convRate = safeNum(overall?.attended_conversion_rate);
  const bookingRate = safeNum(overall?.booking_rate);
  const leadConvRate = safeNum(overall?.lead_conversion_rate);
  const aov = safeNum(overall?.aov);

  const now = new Date(`${reportDate}T00:00:00`);
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  const timeProgress = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
  const completionRate = target > 0 ? gmv / target : 0;
  const remainingTarget = Math.max(0, target - gmv);
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);

  const currentDailyGMV = dayOfMonth > 0 ? gmv / dayOfMonth : 0;
  const currentDailyOrders = dayOfMonth > 0 ? orders / dayOfMonth : 0;

  const dailyGmvNeeded = remainingDays > 0 ? remainingTarget / remainingDays : remainingTarget;
  const dailyOrdersNeeded =
    remainingDays > 0 && aov > 0 ? dailyGmvNeeded / aov : 0;

  // 节奏判断
  let rhythm = "正常";
  if (completionRate > timeProgress + 0.08) {
    rhythm = "领先";
  } else if (completionRate >= timeProgress - 0.05 && completionRate <= timeProgress + 0.08) {
    rhythm = "正常";
  } else if (completionRate < timeProgress - 0.05 && completionRate >= timeProgress * 0.5) {
    rhythm = "落后";
  } else if (completionRate < timeProgress * 0.5) {
    rhythm = "严重落后";
  }

  // 可达性
  let feasibility = "可达";
  if (dailyGmvNeeded <= currentDailyGMV * 1.5) {
    feasibility = "可达";
  } else if (dailyGmvNeeded <= currentDailyGMV * 2.5) {
    feasibility = "有风险";
  } else {
    feasibility = "不可达";
  }

  // 核心问题判断
  let coreProblem = "转化";
  let coreReason = `出席转化率仅 ${pct(convRate)}，低于健康值 18.0%。`;
  let severity = 95;
  let problemType = "系统性问题";

  if (convRate >= 0.18 && attendanceRate < 0.45) {
    coreProblem = "出席";
    coreReason = `出席率仅 ${pct(attendanceRate)}，低于健康值 45.0%。`;
    severity = 85;
  } else if (convRate >= 0.18 && attendanceRate >= 0.45 && bookingRate < 0.5) {
    coreProblem = "预约";
    coreReason = `预约率仅 ${pct(bookingRate)}，预约链路偏弱。`;
    severity = 70;
  } else if (convRate >= 0.18 && attendanceRate >= 0.45 && bookingRate >= 0.5) {
    coreProblem = "线索";
    coreReason = `转化链路整体健康，若目标仍未踩住，则更可能是真实线索不足。`;
    severity = 60;
    problemType = "供给问题";
  }

  const unhealthyCount =
    (convRate < 0.18 ? 1 : 0) +
    (attendanceRate < 0.45 ? 1 : 0) +
    (bookingRate < 0.5 ? 1 : 0);

  if (unhealthyCount <= 1 && coreProblem !== "线索") {
    problemType = "局部问题";
  } else if (unhealthyCount >= 2) {
    problemType = "系统性问题";
  }

  // 团队聚焦
  const sortedTeamsByGMV = [...teams].sort((a, b) => safeNum(b.gmv) - safeNum(a.gmv));
  const bestTeam = sortedTeamsByGMV[0] || null;
  const weakestTeam = [...teams].sort((a, b) => safeNum(a.gmv) - safeNum(b.gmv))[0] || null;

  // 来源聚焦
  const sortedSourcesByConversion = [...sources]
    .filter((s) => safeNum(s.leads) > 0)
    .sort((a, b) => safeNum(b.attended_conversion_rate) - safeNum(a.attended_conversion_rate));

  const bestSource = sortedSourcesByConversion[0] || null;
  const weakestSource =
    [...sources]
      .filter((s) => safeNum(s.leads) >= 10)
      .sort((a, b) => safeNum(a.attended_conversion_rate) - safeNum(b.attended_conversion_rate))[0] || null;

  // 管理摘要
  let executiveSummary = "";
  if (feasibility === "不可达") {
    executiveSummary = `当前管理口径 GMV 仅完成 ${pct(completionRate)}，远低于时间进度 ${pct(
      timeProgress
    )}，节奏已${rhythm}，按当前速度本月目标不可自然达成，必须立刻调整策略。`;
  } else if (feasibility === "有风险") {
    executiveSummary = `当前节奏${rhythm}，虽仍有机会达成，但需显著提升后续日均产出，否则月目标存在明显风险。`;
  } else {
    executiveSummary = `当前节奏${rhythm}，在可达范围内，关键是保持核心链路稳定并放大高质量来源。`;
  }

  let managementJudgement = "";
  if (coreProblem === "转化") {
    managementJudgement =
      "当前最优先的不是补线索，而是止血转化浪费。先修复出席后的跟进和关单能力，再考虑扩量。";
  } else if (coreProblem === "出席") {
    managementJudgement =
      "当前最优先的是修复到课链路。先提升课前确认和重点时段出席，再看转化放大。";
  } else if (coreProblem === "预约") {
    managementJudgement =
      "当前最优先的是修复邀约链路。先提高首拨、接通和预约转化，再看后续出席。";
  } else {
    managementJudgement =
      "当前转化链路基本健康，若目标未踩住，更应关注线索供给和来源结构优化。";
  }

  // 下周动作
  const nextWeekActions = [];

  if (coreProblem === "转化") {
    nextWeekActions.push(
      {
        priority: "P0",
        target: "低转化销售",
        action: "优先补课后 6h 跟进，并逐个复盘出席未转化客户的录音与跟进记录",
        why: "直接影响下周订单",
      },
      {
        priority: "P1",
        target: weakestTeam?.sales_group ? `Team${weakestTeam.sales_group}` : "最弱团队",
        action: "对最弱团队做转化链路专项复盘，重点盯出席后 24h 内的动作完成率",
        why: "修复团队短板",
      }
    );
  } else if (coreProblem === "出席") {
    nextWeekActions.push(
      {
        priority: "P0",
        target: "低出席销售",
        action: "强制执行课前 1 天 + 课前 2h 双确认",
        why: "直接影响下周到课",
      },
      {
        priority: "P1",
        target: "低出席时段",
        action: "针对低出席时段单独复盘预约与确认链路",
        why: "修复结构性出席问题",
      }
    );
  } else if (coreProblem === "预约") {
    nextWeekActions.push(
      {
        priority: "P0",
        target: "全体销售",
        action: "提高首拨触达与预约转化，优先清理新分配 24h 内未首拨线索",
        why: "直接影响后续出席池",
      },
      {
        priority: "P1",
        target: weakestSource?.lead_source || "低质量来源",
        action: "复核来源接通率与销售首拨执行情况",
        why: "区分来源问题还是执行问题",
      }
    );
  } else {
    nextWeekActions.push(
      {
        priority: "P0",
        target: bestSource?.lead_source || "高质量来源",
        action: "放大高质量来源占比，优先承接高转化来源",
        why: "最快提升下周增量",
      },
      {
        priority: "P1",
        target: "管理层",
        action: "复核分配机制和来源结构，优先资源倾斜给高质量渠道",
        why: "改善供给结构",
      }
    );
  }

  nextWeekActions.push({
    priority: "P2",
    target: "管理层",
    action: `按当前差距，重新拆解下周日均目标：至少 ${dailyOrdersNeeded.toFixed(
      1
    )} 单 / 日，至少 ${Math.round(dailyGmvNeeded).toLocaleString()} GMV / 日`,
    why: "让团队对目标有明确节奏感",
  });

  return {
    summary: {
      core_problem: coreProblem,
      severity,
      core_reason: coreReason,
      problem_type: problemType,
      rhythm,
      feasibility,
      executive_summary: executiveSummary,
      management_judgement: managementJudgement,
      completion_rate: completionRate,
      time_progress: timeProgress,
      remaining_target: remainingTarget,
      remaining_days: remainingDays,
      current_daily_gmv: currentDailyGMV,
      current_daily_orders: currentDailyOrders,
      daily_gmv_needed: dailyGmvNeeded,
      daily_orders_needed: dailyOrdersNeeded,
    },
    diagnosis: {
      conversion: {
        ok: convRate >= 0.18,
        value: convRate,
        threshold: 0.18,
      },
      attendance: {
        ok: attendanceRate >= 0.45,
        value: attendanceRate,
        threshold: 0.45,
      },
      booking: {
        ok: bookingRate >= 0.5,
        value: bookingRate,
        threshold: 0.5,
      },
      lead_conversion: {
        value: leadConvRate,
      },
    },
    focus: {
      best_team: bestTeam || null,
      weakest_team: weakestTeam || null,
      best_source: bestSource || null,
      weakest_source: weakestSource || null,
      exception_pool: exceptionPool || null,
      overall_all: overallAll || null,
    },
    next_week_actions: nextWeekActions,
  };
}