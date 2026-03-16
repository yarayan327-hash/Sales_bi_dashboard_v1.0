// src/report/buildDiagnosisEngine.ts

function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtPct(x: number, digits = 1) {
  if (!Number.isFinite(x)) return "0.0%";
  return `${(x * 100).toFixed(digits)}%`;
}

type RootCauseType =
  | "lead_insufficient"
  | "booking_insufficient"
  | "attendance_insufficient"
  | "conversion_insufficient";

type RootCause = {
  type: RootCauseType;
  title: string;
  severity: number;
  summary: string;
  evidence: string[];
  actions: string[];
};

function sortBySeverity(arr: RootCause[]) {
  return [...arr].sort((a, b) => b.severity - a.severity);
}

function pickWorstTimeSlot(timeSlotAnalysis: any[]) {
  const rows = (timeSlotAnalysis ?? [])
    .filter((r) => safeNum(r.booked) >= 5)
    .map((r) => ({
      time_slot: String(r.time_slot ?? "(empty)"),
      booked: safeNum(r.booked),
      attended: safeNum(r.attended),
      attendance_rate: safeNum(r.attendance_rate),
    }))
    .sort((a, b) => a.attendance_rate - b.attendance_rate);

  return rows[0] ?? null;
}

function pickWorstBookingType(bookingTypeAnalysis: any[]) {
  const rows = (bookingTypeAnalysis ?? [])
    .filter((r) => safeNum(r.booked) >= 10)
    .map((r) => ({
      booking_type: String(r.booking_type ?? "(empty)"),
      booked: safeNum(r.booked),
      attended: safeNum(r.attended),
      attendance_rate: safeNum(r.attendance_rate),
    }))
    .sort((a, b) => a.attendance_rate - b.attendance_rate);

  return rows[0] ?? null;
}

function pickWeakPreTouch(monthlyBySales: any[]) {
  const rows = (monthlyBySales ?? [])
    .filter((r) => safeNum(r.booked) >= 5)
    .map((r) => ({
      sales_group: String(r.sales_group ?? "UNK"),
      sales_agent: String(r.sales_agent ?? "(unknown)"),
      booked: safeNum(r.booked),
      pre_2h_touch_rate: safeNum(r.pre_2h_touch_rate),
      pre_2h_connect_rate: safeNum(r.pre_2h_connect_rate),
    }))
    .sort((a, b) => a.pre_2h_touch_rate - b.pre_2h_touch_rate);

  return rows[0] ?? null;
}

function pickWeakPostTouch(monthlyBySales: any[]) {
  const rows = (monthlyBySales ?? [])
    .filter((r) => safeNum(r.attended) >= 3)
    .map((r) => {
      const postTouchRate =
        safeNum(r.post_6h_touch_rate) +
        safeNum(r.post_24h_touch_rate) +
        safeNum(r.post_48h_touch_rate) +
        safeNum(r.post_7d_touch_rate) +
        safeNum(r.post_over_7d_touch_rate);

      return {
        sales_group: String(r.sales_group ?? "UNK"),
        sales_agent: String(r.sales_agent ?? "(unknown)"),
        attended: safeNum(r.attended),
        post_touch_rate: postTouchRate,
      };
    })
    .sort((a, b) => a.post_touch_rate - b.post_touch_rate);

  return rows[0] ?? null;
}

function buildLeadCause(dailyMetrics: any): RootCause | null {
  const mtd = dailyMetrics?.mtd ?? {};
  const lm = dailyMetrics?.vs_last_month_same_period ?? {};

  const leads = safeNum(mtd.leads);
  const leadsDelta = safeNum(lm.leads_delta);

  if (leads <= 0) {
    return {
      type: "lead_insufficient",
      title: "线索量不足",
      severity: 100,
      summary: `MTD 线索为 0，业务无法形成有效漏斗。`,
      evidence: [`MTD线索 = 0`],
      actions: [
        "优先检查分配链路是否中断",
        "检查投放 / 人工分配是否正常入表",
        "先补充可分配线索，再看后续环节",
      ],
    };
  }

  if (leadsDelta < 0) {
    return {
      type: "lead_insufficient",
      title: "线索量偏弱",
      severity: Math.min(95, Math.abs(leadsDelta)),
      summary: `MTD 线索 ${leads}，较上月同期少 ${Math.abs(leadsDelta)} 条。`,
      evidence: [
        `MTD线索 ${leads}`,
        `较上月同期线索 Δ ${leadsDelta}`,
      ],
      actions: [
        "先拆来源看投放线索与人工分配线索占比",
        "检查线索接通率与首拨频次，避免把“无效线索”误判成“线索不足”",
        "若分配不足，先补量；若接通差，再看销售触达动作",
      ],
    };
  }

  return null;
}

function buildBookingCause(
  dailyMetrics: any,
  salesFollowup: any
): RootCause | null {
  const mtd = dailyMetrics?.mtd ?? {};
  const leads = safeNum(mtd.leads);
  const booked = safeNum(mtd.booked);
  const bookingRate = safeNum(mtd.booking_rate);

  if (leads <= 0) return null;

  // 经验阈值，可后续配置化
  const healthyBookingRate = 0.5;

  if (bookingRate >= healthyBookingRate) return null;

  const weakPreTouch = pickWeakPreTouch(salesFollowup?.monthly_by_sales ?? []);

  const evidence = [
    `MTD预约 ${booked} / 线索 ${leads}`,
    `预约率 ${fmtPct(bookingRate)}，低于健康值 ${fmtPct(healthyBookingRate)}`,
  ];

  if (weakPreTouch) {
    evidence.push(
      `课前弱触达样本: Team${weakPreTouch.sales_group} ${weakPreTouch.sales_agent} 课前2h触达率 ${fmtPct(
        weakPreTouch.pre_2h_touch_rate
      )}`
    );
  }

  return {
    type: "booking_insufficient",
    title: "预约量不足",
    severity: Math.round((healthyBookingRate - bookingRate) * 100),
    summary: `MTD 预约率仅 ${fmtPct(bookingRate)}，预约环节偏弱。`,
    evidence,
    actions: [
      "先区分是线索不足，还是销售首拨/跟进不足",
      "看各来源线索接通率与外呼次数，避免一次未接就停止跟进",
      "优先抓低预约率销售与低接通来源",
    ],
  };
}

function buildAttendanceCause(
  dailyMetrics: any,
  salesFollowup: any
): RootCause | null {
  const mtd = dailyMetrics?.mtd ?? {};
  const booked = safeNum(mtd.booked);
  const attended = safeNum(mtd.attended);
  const attendanceRate = safeNum(mtd.attendance_rate);

  if (booked <= 0) return null;

  const healthyAttendanceRate = 0.45;
  if (attendanceRate >= healthyAttendanceRate) return null;

  const weakBookingType = pickWorstBookingType(
    salesFollowup?.booking_type_analysis ?? []
  );
  const weakTimeSlot = pickWorstTimeSlot(
    salesFollowup?.time_slot_analysis ?? []
  );
  const weakPreTouch = pickWeakPreTouch(salesFollowup?.monthly_by_sales ?? []);

  const evidence = [
    `MTD出席 ${attended} / 预约 ${booked}`,
    `出席率 ${fmtPct(attendanceRate)}，低于健康值 ${fmtPct(
      healthyAttendanceRate
    )}`,
  ];

  if (weakBookingType) {
    evidence.push(
      `预约方式弱项: ${weakBookingType.booking_type} 出席率 ${fmtPct(
        weakBookingType.attendance_rate
      )}（预约 ${weakBookingType.booked} / 出席 ${weakBookingType.attended}）`
    );
  }

  if (weakTimeSlot) {
    evidence.push(
      `时段弱项: ${weakTimeSlot.time_slot} 出席率 ${fmtPct(
        weakTimeSlot.attendance_rate
      )}（预约 ${weakTimeSlot.booked} / 出席 ${weakTimeSlot.attended}）`
    );
  }

  if (weakPreTouch) {
    evidence.push(
      `课前动作弱项: Team${weakPreTouch.sales_group} ${weakPreTouch.sales_agent} 课前2h触达率 ${fmtPct(
        weakPreTouch.pre_2h_touch_rate
      )}，接通率 ${fmtPct(weakPreTouch.pre_2h_connect_rate)}`
    );
  }

  return {
    type: "attendance_insufficient",
    title: "出席不足",
    severity: Math.round((healthyAttendanceRate - attendanceRate) * 100),
    summary: `MTD 出席率仅 ${fmtPct(attendanceRate)}，当前主要短板在出席环节。`,
    evidence,
    actions: [
      "优先看课前2小时外呼与接通情况",
      "拆自约 / 代约，看是否是自约确认链路偏弱",
      "拆上课时段，重点关注低出席时段的确认动作",
    ],
  };
}

function buildConversionCause(
  dailyMetrics: any,
  salesFollowup: any
): RootCause | null {
  const mtd = dailyMetrics?.mtd ?? {};
  const attended = safeNum(mtd.attended);
  const orders = safeNum(mtd.orders);
  const attendedConversionRate = safeNum(mtd.attended_conversion_rate);

  if (attended <= 0) return null;

  const healthyAttendedConversionRate = 0.18;
  if (attendedConversionRate >= healthyAttendedConversionRate) return null;

  const weakPostTouch = pickWeakPostTouch(salesFollowup?.monthly_by_sales ?? []);

  const evidence = [
    `MTD订单 ${orders} / 出席 ${attended}`,
    `出席转化率 ${fmtPct(attendedConversionRate)}，低于健康值 ${fmtPct(
      healthyAttendedConversionRate
    )}`,
  ];

  if (weakPostTouch) {
    evidence.push(
      `课后动作弱项: Team${weakPostTouch.sales_group} ${weakPostTouch.sales_agent} 课后累计触达率 ${fmtPct(
        weakPostTouch.post_touch_rate
      )}`
    );
  }

  return {
    type: "conversion_insufficient",
    title: "转化不足",
    severity: Math.round(
      (healthyAttendedConversionRate - attendedConversionRate) * 100
    ),
    summary: `MTD 出席转化率仅 ${fmtPct(
      attendedConversionRate
    )}，主要短板在课后转化环节。`,
    evidence,
    actions: [
      "优先检查课后 6h / 24h / 48h 的跟进覆盖情况",
      "抓低课后触达销售，重点看是否存在出席后未跟进",
      "复盘高出席低转化销售的话术与跟进节奏",
    ],
  };
}

export function buildDiagnosisEngine(payload: {
  daily_metrics: any;
  sales_followup: any;
  team_pk?: any[];
  mtd_gap?: any[];
}) {
  const dailyMetrics = payload?.daily_metrics ?? {};
  const salesFollowup = payload?.sales_followup ?? {};

  const causes: RootCause[] = [];

  const leadCause = buildLeadCause(dailyMetrics);
  if (leadCause) causes.push(leadCause);

  const bookingCause = buildBookingCause(dailyMetrics, salesFollowup);
  if (bookingCause) causes.push(bookingCause);

  const attendanceCause = buildAttendanceCause(dailyMetrics, salesFollowup);
  if (attendanceCause) causes.push(attendanceCause);

  const conversionCause = buildConversionCause(dailyMetrics, salesFollowup);
  if (conversionCause) causes.push(conversionCause);

  const sorted = sortBySeverity(causes);
  const top3 = sorted.slice(0, 3);

  const conclusion =
    top3.length > 0
      ? `当前首要问题为：${top3.map((x) => x.title).join("、")}`
      : "当前核心漏斗指标未发现明显异常。";

  return {
    conclusion,
    root_causes: top3,
    all_root_causes: sorted,
  };
}