export function buildDailyReportCN(payload: any) {
  const m = payload.daily_metrics
  const diagnosis = payload.diagnosis
  const team = payload.team_pk

  let text = `📊 销售日报\n\n`

  text += `【MTD进度】\n`
  text += `线索 ${m.mtd.leads}\n`
  text += `预约 ${m.mtd.booked}\n`
  text += `出席 ${m.mtd.attended}\n`
  text += `订单 ${m.mtd.orders}\n`
  text += `GMV ${m.mtd.gmv}\n`
  text += `出席率 ${(m.mtd.attendance_rate * 100).toFixed(1)}%\n`
  text += `出席转化率 ${(m.mtd.attended_conversion_rate * 100).toFixed(1)}%\n\n`

  text += `【自动诊断】\n`
  text += diagnosis.conclusion + "\n\n"

  diagnosis.root_causes.forEach((c: any, i: number) => {
    text += `${i + 1}. ${c.title}\n`
    text += `${c.summary}\n`
    c.evidence.forEach((e: string) => {
      text += `- ${e}\n`
    })
    text += "\n"
  })

  text += `【Team PK】\n`
  team.forEach((t: any) => {
    text += `Team${t.sales_group}: ${t.orders}单 / ${t.gmv}\n`
  })

  return text
}