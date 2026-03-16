export type Lang = "zh" | "en";

export type SalesGroup = "001" | "002" | "UNKNOWN";

export interface DimAgentRow {
  sales_id: string;        // e.g. 4121806
  sales_group_raw: string; // Team001
  sales_group: SalesGroup; // 001 / 002 / UNKNOWN
  sales_name: string;      // 51habiba.hassan
}

export interface DimTargetRow {
  sales_id: string;
  monthly_target_usd: number;
}

export interface FactCallRow {
  user_id: string;
  sales_name: string;      // EGCC-eman.amr
  outbound_time: string;   // from csv
  connect_time: string;    // maybe empty
  call_duration: string;   // 0:00:00
}

export interface FactLeadRow {
  user_id: string;       // stu_id
  sales_id: string;      // new_admin_id
  assigned_time: string; // add_time
  desc: string;
}

export interface FactOrderRow {
  order_id: string;
  user_id: string;
  sales_name: string;
  sales_group_raw: string;
  amount: number;        // total amount (we use 定价币种支付金额 优先，否则 总金额)
  order_time: string;
  pay_currency: string;  // SAR
}

export interface FactTrialRow {
  record_id: string;
  user_id: string;
  agent_id: string;           // sales_id
  class_status: string;       // on/cancel/已结束
  start_time_ksa_raw: string; // "YYYY-MM-DD HH:mm ~ HH:mm"
  class_date_ksa: string;     // derived yyyy-LL-dd
  duration_minutes: number;
  cross_day: boolean;
  start_dt_ksa_iso: string;   // derived ISO string
  end_dt_ksa_iso: string;     // derived ISO string
}

/** Tab1 Modules */
export interface MTDRevenueBlock {
  mtd_gmv: number;
  daily_gmv: number;
  daily_orders: number;
}

export interface CallingRow {
  sales_group: string; // 001/002/UNKNOWN
  sales_agent: string; // sales_name
  report_date: string; // yyyy-LL-dd
  outbound_calls: number;
  outbound_minutes: number;
  lead_outbound_calls: number;
  stock_outbound_calls: number;
}

export interface TrialConversionRow {
  sales_group: string;
  sales_agent: string;
  class_date: string;

  booked: number;
  attended: number;

  pre15_call_users: number;
  pre15_connected_users: number;

  post1h_call_users: number;
  post1h_connected_users: number;

  post_class_remark_users: number;

  pre15_reach_rate: number | null;
  pre15_connect_rate: number | null;

  post1h_reach_rate: number | null;
  post1h_connect_rate: number | null;
}

export interface ProcessKPIRow {
  sales_group: string;
  sales_agent: string;
  assigned_date: string;

  leads: number;
  outbound_users: number;
  connected_users: number;
  effective_connected: number;

  booked_users: number;
  attended_users: number;

  outbound_rate: number | null;
  connect_rate: number | null;
  effective_rate: number | null;
  booking_rate: number | null;
  attendance_rate: number | null;
  lead_conversion_rate: number | null;
}

export interface TailConversionRow {
  sales_group: string;
  sales_agent: string;

  mtd_attended: number;
  mtd_1h_call: number;
  mtd_24h_call: number;
  mtd_48h_call: number;
  mtd_7d_call: number;

  mtd_orders: number;
  mtd_gmv: number;
}

export interface MTDTargetRow {
  sales_group: string;
  sales_agent: string;
  sales_id: string;

  monthly_target: number;
  total_workdays_month: number;
  elapsed_workdays: number;
  daily_target: number;

  expected_mtd: number;
  actual_mtd: number;

  progress_gap: number;
  progress_rate: number | null;
}

/** Tab2 */
export interface Tab2OverviewRow {
  class_date: string;
  attended_users: number;

  follow_1h_users: number;
  follow_24h_users: number;
  follow_48h_users: number;
  follow_7d_users: number;

  follow_1h_rate: number | null;
  follow_24h_rate: number | null;
  follow_48h_rate: number | null;
  follow_7d_rate: number | null;
}

export interface Tab2AgentFunnelRow {
  sales_agent: string;
  sales_group: string;
  class_date: string;

  attended: number;
  follow_1h: number;
  follow_24h: number;
  follow_48h: number;
  follow_7d: number;

  lost_1h: number;
  lost_24h: number;
  lost_48h: number;
  lost_7d: number;
}

export interface Tab2UnfollowRow {
  user_id: string;
  sales_agent: string;
  sales_group: string;
  class_date: string;
  last_follow_time: string; // ISO or empty
  follow_status: "未跟进" | "跟进超时";
  has_order: "YES" | "NO";
}

export interface LoadedData {
  agents: DimAgentRow[];
  targets: DimTargetRow[];
  calls: FactCallRow[];
  leads: FactLeadRow[];
  orders: FactOrderRow[];
  trials: FactTrialRow[];
}
