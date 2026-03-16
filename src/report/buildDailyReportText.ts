// src/report/buildDailyReportText.ts
function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(x: number, digits = 1) {
  if (!Number.isFinite(x)) return "0.0%";
  return `${(x * 100).toFixed(digits)}%`;
}

function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rankTop<T>(arr: T[], pick: (x: T) => number, topN = 3) {
  return [...arr].sort((a, b) => pick(b) - pick(a)).slice(0, topN);
}

function sortTimeSlots(rows: any[]) {
  const order = ["13:00-15:00", "15:00-17:00", "17:00-19:00", "19:00-21:00"];
  return [...rows].sort(
    (a, b) =>
      order.indexOf(String(a.time_slot ?? "")) -
      order.indexOf(String(b.time_slot ?? ""))
  );
}

export function buildDailyReportText(payload: any) {
  const daily = payload?.daily_metrics ?? {};
  const mtdGap = Array.isArray(payload?.mtd_gap) ? payload.mtd_gap : [];
  const teamPk = Array.isArray(payload?.team_pk) ? payload.team_pk : [];
  const salesFollowup = payload?.sales_followup ?? {};
  const diagnosis = payload?.diagnosis ?? {};

  const yesterday = daily?.yesterday ?? {};
  const mtd = daily?.mtd ?? {};
  const lm = daily?.vs_last_month_same_period ?? {};

  const monthlyBySales = Array.isArray(salesFollowup?.monthly_by_sales)
    ? salesFollowup.monthly_by_sales
    : [];

  const bookingTypeAnalysis = Array.isArray(salesFollowup?.booking_type_analysis)
    ? salesFollowup.booking_type_analysis
    : [];

  const timeSlotAnalysis = Array.isArray(salesFollowup?.time_slot_analysis)
    ? sortTimeSlots(salesFollowup.time_slot_analysis)
    : [];

  const topSales = rankTop(monthlyBySales, (r) => safeNum(r.attended), 3);

  const lowPreTouch = [...monthlyBySales]
    .filter((r) => safeNum(r.booked) >= 5 && String(r.sales_group ?? "").trim() !== "")
    .sort((a, b) => safeNum(a.pre_2h_touch_rate) - safeNum(b.pre_2h_touch_rate))
    .slice(0, 3);

  const lowPostTouch = [...monthlyBySales]
    .filter((r) => safeNum(r.attended) >= 3 && String(r.sales_group ?? "").trim() !== "")
    .map((r) => {
      const postTouch =
        safeNum(r.post_6h_touch_rate) +
        safeNum(r.post_24h_touch_rate) +
        safeNum(r.post_48h_touch_rate) +
        safeNum(r.post_7d_touch_rate) +
        safeNum(r.post_over_7d_touch_rate);

      return { ...r, _post_touch_rate: postTouch };
    })
    .sort((a, b) => safeNum(a._post_touch_rate) - safeNum(b._post_touch_rate))
    .slice(0, 3);

  const teamLines = teamPk
    .map((r: any) => {
      const group = String(r.sales_group ?? "(empty)");
      return `- Team${group}: ${fmt(safeNum(r.orders))}单 / ${fmt(safeNum(r.gmv))}`;
    })
    .join("\n");

  const gapLines = mtdGap
    .map((r: any) => ({
      name: String(r.sales_name ?? "(unknown)"),
      sales_group: String(r.sales_group ?? "(empty)"),
      target: safeNum(r.target),
      gmv: safeNum(r.gmv),
      gap: safeNum(r.gap),
    }))
    .sort((a: any, b: any) => b.gap - a.gap)
    .slice(0, 5)
    .map(
      (r: any) =>
        `- Team${r.sales_group} ${r.name}: 已完成 ${fmt(r.gmv)} / 目标 ${fmt(
          r.target
        )}，Gap ${fmt(r.gap)}`
    )
    .join("\n");

  const bookingTypeLines = bookingTypeAnalysis
    .map((r: any) => {
      const bookingType = String(r.booking_type ?? "(empty)");
      return `- ${bookingType}: 预约 ${fmt(safeNum(r.booked))} / 出席 ${fmt(
        safeNum(r.attended)
      )} / 出席率 ${fmtPct(safeNum(r.attendance_rate))}`;
    })
    .join("\n");

  const timeSlotLines = timeSlotAnalysis
    .map((r: any) => {
      const slot = String(r.time_slot ?? "(empty)");
      return `- ${slot}: 预约 ${fmt(safeNum(r.booked))} / 出席 ${fmt(
        safeNum(r.attended)
      )} / 出席率 ${fmtPct(safeNum(r.attendance_rate))}`;
    })
    .join("\n");

  const topSalesLines = topSales
    .map(
      (r: any) =>
        `- Team${r.sales_group} ${r.sales_agent}: 预约 ${fmt(
          safeNum(r.booked)
        )} / 出席 ${fmt(safeNum(r.attended))}`
    )
    .join("\n");

  const lowPreTouchLines = lowPreTouch
    .map(
      (r: any) =>
        `- Team${r.sales_group} ${r.sales_agent}: 课前2h触达率 ${fmtPct(
          safeNum(r.pre_2h_touch_rate)
        )}`
    )
    .join("\n");

  const lowPostTouchLines = lowPostTouch
    .map(
      (r: any) =>
        `- Team${r.sales_group} ${r.sales_agent}: 课后累计触达率 ${fmtPct(
          safeNum(r._post_touch_rate)
        )}`
    )
    .join("\n");

  const diagnosisLines = Array.isArray(diagnosis?.root_causes)
    ? diagnosis.root_causes
        .map((c: any, idx: number) => {
          const evidence = Array.isArray(c?.evidence)
            ? c.evidence.map((x: string) => `  · ${x}`).join("\n")
            : "";
          const actions = Array.isArray(c?.actions)
            ? c.actions.map((x: string) => `  → ${x}`).join("\n")
            : "";

          return `${idx + 1}. ${c?.title}\n- ${c?.summary}\n${evidence}\n${actions}`;
        })
        .join("\n\n")
    : "";

  const text = [
    `📊 销售日报`,
    ``,
    `【昨日结果】`,
    `- 线索 ${fmt(safeNum(yesterday.leads))}`,
    `- 预约 ${fmt(safeNum(yesterday.booked))}`,
    `- 出席 ${fmt(safeNum(yesterday.attended))}`,
    `- 订单 ${fmt(safeNum(yesterday.orders))}`,
    `- GMV ${fmt(safeNum(yesterday.gmv))}`,
    `- 预约率 ${fmtPct(safeNum(yesterday.booking_rate))}`,
    `- 出席率 ${fmtPct(safeNum(yesterday.attendance_rate))}`,
    `- 出席转化率 ${fmtPct(safeNum(yesterday.attended_conversion_rate))}`,
    `- 线索转化率 ${fmtPct(safeNum(yesterday.lead_conversion_rate))}`,
    ``,
    `【MTD进度】`,
    `- MTD线索 ${fmt(safeNum(mtd.leads))}`,
    `- MTD预约 ${fmt(safeNum(mtd.booked))}`,
    `- MTD出席 ${fmt(safeNum(mtd.attended))}`,
    `- MTD订单 ${fmt(safeNum(mtd.orders))}`,
    `- MTD GMV ${fmt(safeNum(mtd.gmv))}`,
    `- MTD预约率 ${fmtPct(safeNum(mtd.booking_rate))}`,
    `- MTD出席率 ${fmtPct(safeNum(mtd.attendance_rate))}`,
    `- MTD出席转化率 ${fmtPct(safeNum(mtd.attended_conversion_rate))}`,
    `- MTD线索转化率 ${fmtPct(safeNum(mtd.lead_conversion_rate))}`,
    ``,
    `【较上月同期】`,
    `- 线索 Δ ${fmt(safeNum(lm.leads_delta))}`,
    `- 预约 Δ ${fmt(safeNum(lm.booked_delta))}`,
    `- 出席 Δ ${fmt(safeNum(lm.attended_delta))}`,
    `- 订单 Δ ${fmt(safeNum(lm.orders_delta))}`,
    `- GMV Δ ${fmt(safeNum(lm.gmv_delta))}`,
    ``,
    `【自动诊断】`,
    diagnosis?.conclusion || `- 当前未生成诊断结论`,
    diagnosisLines ? `\n${diagnosisLines}` : `- 暂无诊断明细`,
    ``,
    `【Team PK】`,
    teamLines || `- 暂无数据`,
    ``,
    `【MTD Gap Top5】`,
    gapLines || `- 暂无数据`,
    ``,
    `【预约方式表现】`,
    bookingTypeLines || `- 暂无数据`,
    ``,
    `【时段表现】`,
    timeSlotLines || `- 暂无数据`,
    ``,
    `【高出席销售 Top3】`,
    topSalesLines || `- 暂无数据`,
    ``,
    `【课前触达偏弱】`,
    lowPreTouchLines || `- 暂无数据`,
    ``,
    `【课后触达偏弱】`,
    lowPostTouchLines || `- 暂无数据`,
  ].join("\n");

  return text;
}