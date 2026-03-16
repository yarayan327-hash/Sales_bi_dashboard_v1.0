export const headerAliases: Record<string, string[]> = {
  // dim_agents
  sales_id: ["sales_id", "销售ID", "销售 Id", "销售编号", "Agent ID", "agent_id", "aid", "sid"],
  sales_group: ["sales_group", "销售组", "组", "Group", "grp", "业绩归属销售组"],
  sales_name: ["sales_name", "销售名称", "业绩归属销售", "Agent", "name"],

  // dim_targets
  monthly_target_usd: ["monthly_target_usd", "monthly_target", "目标", "Target", "target_usd", "target"],

  // calls
  student_id: ["student_id", "学员ID", "学员Id", "stu_id", "uid", "学员ID(含括号)"],
  outbound_time: ["outbound_time", "外呼时间", "Call Time", "time_raw"],
  answered_time: ["answered_time", "双方接听时间", "接听时间"],
  answered_status: ["answered_status", "接听状态"],
  call_duration: ["call_duration", "通话时长", "Duration", "dur_raw"],

  // leads
  add_time: ["add_time", "线索创建时间", "create_time"],
  new_admin_id: ["new_admin_id", "new_admin", "sales_id", "销售ID", "Agent ID"],

  // orders
  order_id: ["order_id", "订单号", "订单ID"],
  amount_paid: ["amount_paid", "定价币种支付金额", "支付金额", "Amount", "amt"],
  order_time: ["order_time", "订单时间", "Created At", "time"],

  // trials
  start_time_ksa: ["start_time_ksa", "start_time(KSA)", "上课时间(KSA)", "KSA", "ksa_raw"],
  class_status: ["class_status", "课程状态", "Status", "status"],
  agent_id: ["agent_id", "销售ID", "Agent ID", "aid"],
  user_id: ["user_id", "学员ID", "student_id", "uid"]
};

export const normalizeHeader = (h: string) =>
  String(h ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();

export const findField = (row: Record<string, any>, canonical: string): any => {
  const aliases = headerAliases[canonical] ?? [canonical];
  const keys = Object.keys(row);
  for (const a of aliases) {
    const an = normalizeHeader(a);
    for (const k of keys) {
      if (normalizeHeader(k) === an) return row[k];
    }
  }
  return undefined;
};
