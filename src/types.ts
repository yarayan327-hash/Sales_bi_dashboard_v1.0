export type DataBundle = {
  dim_agents: any[];
  dim_targets: any[];
  fact_calls: any[];
  fact_leads: any[];
  fact_orders: any[];
  fact_trials: any[];
  work_calendar: any[];
};

export type MTDRevenueBlock = {
  mtd_gmv: number;
  daily_gmv: number;
  daily_orders: number;
};

export type CallingRow = {
  sales_group: string; // "001"/"002"
  sales_agent: string; // sales_name
  report_date: string; // YYYY-MM-DD
  outbound_calls: number;
  outbound_minutes: number;
  lead_outbound_calls: number;
  stock_outbound_calls: number;
};

export type TrialConversionRow = {
  sales_group: string;
  sales_agent: string;
  class_date: string; // YYYY-MM-DD (KSA)
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
};

export type ProcessKPIRow = {
  sales_group: string;
  sales_agent: string;
  assigned_date: string; // YYYY-MM-DD (KSA standard for reporting)
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
};

export type TailConversionRow = {
  sales_group: string;
  sales_agent: string;
  mtd_attended: number;
  mtd_1h_call: number;
  mtd_24h_call: number;
  mtd_48h_call: number;
  mtd_7d_call: number;
  mtd_orders: number;
  mtd_gmv: number;
};

export type MTDAchievementRow = {
  sales_group: string;
  sales_agent: string;
  month: string; // YYYY-MM
  monthly_target: number;
  total_workdays_month: number;
  elapsed_workdays: number;
  daily_target: number;
  expected_mtd: number;
  actual_mtd: number;
  progress_gap: number;
  progress_rate: number | null;
};

export type Tab1Result = {
  reportDate: string;
  mtd_revenue: MTDRevenueBlock;
  calling_discipline: CallingRow[];
  trial_conversion: TrialConversionRow[];
  process_kpi: ProcessKPIRow[];
  mtd_tail_conversion: TailConversionRow[];
  mtd_target_achievement: MTDAchievementRow[];
};

export type Tab2Result = {
  // v2: follow-up analysis scaffolding
  // 先把结构留好，你后续扩展“calls per lead / timing buckets / duration per lead / late patterns”
  reportDate: string;
  followup_by_class_date: Array<{
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
  }>;
  followup_by_agent: Array<{
    sales_group: string;
    sales_agent: string;
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
  }>;
  followup_path: Array<{
    class_date: string;
    attended: number;
    follow_1h_and_order: number;
    follow_24h_and_order: number;
    no_follow_but_order: number;
    no_follow_no_order: number;
  }>;
  blame_list: Array<{
    user_id: string;
    sales_group: string;
    sales_agent: string;
    class_date: string;
    last_follow_time: string | null;
    follow_status: "NO_FOLLOW" | "LATE_FOLLOW" | "OK";
    has_order: boolean;
  }>;
};
