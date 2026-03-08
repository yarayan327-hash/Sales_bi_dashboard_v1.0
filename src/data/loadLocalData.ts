import { fetchCsv } from "../utils/csv";
import { RawTables } from "../types/raw";

export async function loadLocalData(): Promise<RawTables> {
  const [
    dim_agents,
    dim_targets,
    fact_calls,
    fact_leads,
    fact_orders,
    fact_trials,
  ] = await Promise.all([
    fetchCsv("/data/dim_agents.csv"),
    fetchCsv("/data/dim_targets.csv"),
    fetchCsv("/data/fact_calls.csv"),
    fetchCsv("/data/fact_leads.csv"),
    fetchCsv("/data/fact_orders.csv"),
    fetchCsv("/data/fact_trials.csv"),
  ]);

  // Optional calendar; if missing we'll fallback.
  let dim_work_calendar: any[] | undefined = undefined;
  try {
    dim_work_calendar = await fetchCsv("/data/dim_work_calendar.csv");
  } catch (e) {
    // ignore
  }

  return {
    dim_agents,
    dim_targets,
    fact_calls,
    fact_leads,
    fact_orders,
    fact_trials,
    dim_work_calendar,
  };
}
