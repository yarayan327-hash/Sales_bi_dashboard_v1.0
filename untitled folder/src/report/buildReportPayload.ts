// src/report/buildReportPayload.ts
import { buildDiagnosisEngine } from "./buildDiagnosisEngine";

type Input = {
  daily_metrics: any;
  sales_followup: any;
  team_pk: any;
  mtd_gap: any;
};

export function buildReportPayload(input: Input) {
  const diagnosis = buildDiagnosisEngine({
    daily_metrics: input.daily_metrics,
    sales_followup: input.sales_followup,
    team_pk: input.team_pk,
    mtd_gap: input.mtd_gap,
  });

  return {
    generated_at: new Date().toISOString(),
    daily_metrics: input.daily_metrics,
    sales_followup: input.sales_followup,
    team_pk: input.team_pk,
    mtd_gap: input.mtd_gap,
    diagnosis,
  };
}