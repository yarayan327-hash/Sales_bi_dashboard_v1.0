export function buildDailyReportEN(payload: any) {
  const m = payload.daily_metrics
  const diagnosis = payload.diagnosis
  const team = payload.team_pk

  let text = `📊 Daily Sales Report\n\n`

  text += `【MTD Performance】\n`
  text += `Leads: ${m.mtd.leads}\n`
  text += `Bookings: ${m.mtd.booked}\n`
  text += `Attendance: ${m.mtd.attended}\n`
  text += `Orders: ${m.mtd.orders}\n`
  text += `GMV: ${m.mtd.gmv}\n`
  text += `Attendance Rate: ${(m.mtd.attendance_rate * 100).toFixed(1)}%\n`
  text += `Conversion Rate: ${(m.mtd.attended_conversion_rate * 100).toFixed(
    1
  )}%\n\n`

  text += `【Key Diagnosis】\n`
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
    text += `Team${t.sales_group}: ${t.orders} orders / GMV ${t.gmv}\n`
  })

  return text
}