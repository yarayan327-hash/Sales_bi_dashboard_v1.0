import fs from "fs"
import path from "path"

import { runDiagnosisEngineV2 } from "../src/report/diagnosis/diagnosisEngineV2"
import { buildDailyReportCN } from "../src/report/reportText/buildDailyReportCN"
import { buildDailyReportEN } from "../src/report/reportText/buildDailyReportEN"

const payloadPath = path.resolve("output/latest/report_payload.json")
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"))

payload.diagnosis = runDiagnosisEngineV2(payload)

const cn = buildDailyReportCN(payload)
const en = buildDailyReportEN(payload)

fs.writeFileSync("output/latest/daily_report_cn.txt", cn)
fs.writeFileSync("output/latest/daily_report_en.txt", en)

console.log("✅ Daily report generated")