export function runDiagnosisEngineV2(payload: any) {
  const metrics = payload.daily_metrics.mtd
  const followup = payload.sales_followup
  const bookingTypes = followup.booking_type_analysis || []
  const timeSlots = followup.time_slot_analysis || []
  const sales = followup.monthly_by_sales || []

  const causes: any[] = []

  // ---------- 出席问题 ----------
  const attendanceRate = metrics.attendance_rate || 0
  if (attendanceRate < 0.45) {
    const weakestBooking = bookingTypes.sort(
      (a: any, b: any) => a.attendance_rate - b.attendance_rate
    )[0]

    const weakestSlot = timeSlots.sort(
      (a: any, b: any) => a.attendance_rate - b.attendance_rate
    )[0]

    const weakestPreCall = sales
      .filter((s: any) => s.booked >= 10)
      .sort((a: any, b: any) => a.pre_2h_touch_rate - b.pre_2h_touch_rate)[0]

    causes.push({
      type: "attendance_insufficient",
      title: "出席不足",
      severity: Math.round((0.45 - attendanceRate) * 100),
      summary: `MTD 出席率 ${(attendanceRate * 100).toFixed(
        1
      )}%，低于健康值 45%。`,
      evidence: [
        `MTD出席 ${metrics.attended} / 预约 ${metrics.booked}`,
        `出席率 ${(attendanceRate * 100).toFixed(1)}%`,
        weakestBooking
          ? `预约方式弱项: ${weakestBooking.booking_type} 出席率 ${(weakestBooking.attendance_rate * 100).toFixed(1)}%`
          : "",
        weakestSlot
          ? `时段弱项: ${weakestSlot.time_slot} 出席率 ${(weakestSlot.attendance_rate * 100).toFixed(1)}%`
          : "",
        weakestPreCall
          ? `课前动作弱项: Team${weakestPreCall.sales_group} ${weakestPreCall.sales_agent} 课前2h触达率 ${(weakestPreCall.pre_2h_touch_rate * 100).toFixed(1)}%`
          : ""
      ].filter(Boolean),
      actions: [
        "优先检查课前2小时确认外呼",
        "拆自约 / 代约链路",
        "重点复盘低出席时段用户确认动作"
      ]
    })
  }

  // ---------- 转化问题 ----------
  const conversionRate = metrics.attended_conversion_rate || 0
  if (conversionRate < 0.18) {
    const weakestFollowup = sales
      .filter((s: any) => s.attended >= 5)
      .sort((a: any, b: any) => a.post_6h_touch_rate - b.post_6h_touch_rate)[0]

    causes.push({
      type: "conversion_insufficient",
      title: "转化不足",
      severity: Math.round((0.18 - conversionRate) * 100),
      summary: `MTD 出席转化率 ${(conversionRate * 100).toFixed(
        1
      )}%，低于健康值 18%。`,
      evidence: [
        `MTD订单 ${metrics.orders} / 出席 ${metrics.attended}`,
        `出席转化率 ${(conversionRate * 100).toFixed(1)}%`,
        weakestFollowup
          ? `课后动作弱项: Team${weakestFollowup.sales_group} ${weakestFollowup.sales_agent} 出席后6h触达率 ${(weakestFollowup.post_6h_touch_rate * 100).toFixed(1)}%`
          : ""
      ].filter(Boolean),
      actions: [
        "检查课后 6h / 24h 跟进覆盖率",
        "重点排查出席后未跟进用户",
        "复盘高出席低转化销售话术"
      ]
    })
  }

  // ---------- 线索问题 ----------
  const leadDelta = payload.daily_metrics.vs_last_month_same_period.leads_delta
  if (leadDelta < 0) {
    causes.push({
      type: "lead_insufficient",
      title: "线索量偏弱",
      severity: Math.abs(leadDelta),
      summary: `MTD 线索 ${metrics.leads}，较上月同期少 ${Math.abs(
        leadDelta
      )} 条`,
      evidence: [
        `MTD线索 ${metrics.leads}`,
        `较上月同期 Δ ${leadDelta}`
      ],
      actions: [
        "拆线索来源占比",
        "检查线索接通率",
        "排查首拨频次是否不足"
      ]
    })
  }

  const sorted = causes.sort((a, b) => b.severity - a.severity)

  return {
    conclusion:
      sorted.length > 0
        ? `当前首要问题为：${sorted
            .slice(0, 3)
            .map((c) => c.title)
            .join("、")}`
        : "当前核心指标整体正常",
    root_causes: sorted.slice(0, 3),
    all_root_causes: sorted
  }
}