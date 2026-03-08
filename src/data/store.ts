import { DataBundle } from "../types";
import { fetchCsv } from "./csv";
import { normAgents, normTargets, normCalls, normLeads, normOrders, normTrials, normCalendar } from "./normalize";

export type LoadedData = {
  bundle: DataBundle;
  agents: ReturnType<typeof normAgents>;
  targets:
