import { findField } from "./headerMap";
import { normalizeSalesGroup } from "../utils/group";

export const normAgents = (rows: any[]) => {
  return rows
    .map((r) => {
      const sales_id = String(findField(r, "sales_id") ?? "").trim();
      const sales_group_raw = String(findField(r, "sales_group") ?? "").trim();
      const sales_name = String(findField(r, "sales_name") ?? "").trim();
      return {
        sales_id,
        sales_group: normalizeSalesGroup(sales_group_raw),
        sales_name
      };
    })
    .filter((x) => x.sales_id || x.sales_name);
};

export const normTargets = (rows: any[]) => {
  return rows
    .map((r) => {
      const sales_id = String(findField(r, "sales_id") ?? "").trim();
      const monthly_target_usd = findField(r, "monthly_target_usd");
      const month = String(r.month ?? "").trim(); // recommended
      const effective_from = String(r.effective_from ?? "").trim();
      const version = String(r.version ?? "").trim();
      return { sales_id, monthly_target_usd, month, effective_from, version };
    })
    .filter((x) => x.sales_id);
};

export const normCalls = (rows: any[]) => {
  return rows.map((r) => {
    const student_id_raw = String(findField(r, "student_id") ?? "").trim();
    // handle: "student (61986214)"
    const m = student_id_raw.match(/(\d+)/);
    const student_id = m ? m[1] : student_id_raw;

    return {
      student_id,
      outbound_time: findField(r, "outbound_time"),
      answered_time: findField(r, "answered_time"),
      answered_status: findField(r, "answered_status"),
      call_duration: findField(r, "call_duration"),
      sales_name: String(findField(r, "sales_name") ?? r["销售名称"] ?? "").trim()
    };
  });
};

export const normLeads = (rows: any[]) => {
  return rows.map((r) => ({
    stu_id: String(r.stu_id ?? findField(r, "student_id") ?? "").trim(),
    new_admin_id: String(r.new_admin_id ?? findField(r, "new_admin_id") ?? "").trim(),
    add_time: r.add_time ?? findField(r, "add_time"),
    desc: String(r.desc ?? "").trim()
  }));
};

export const normOrders = (rows: any[]) => {
  return rows.map((r) => ({
    order_id: String(findField(r, "order_id") ?? "").trim(),
    student_id: String(findField(r, "student_id") ?? r["学员ID"] ?? "").trim(),
    sales_name: String(findField(r, "sales_name") ?? "").trim(),
    sales_group: normalizeSalesGroup(String(findField(r, "sales_group") ?? "").trim()),
    amount_paid: findField(r, "amount_paid"),
    order_time: findField(r, "order_time")
  }));
};

export const normTrials = (rows: any[]) => {
  return rows.map((r) => ({
    record_id: String(r.record_id ?? "").trim(),
    user_id: String(r.user_id ?? findField(r, "user_id") ?? "").trim(),
    agent_id: String(r.agent_id ?? findField(r, "agent_id") ?? "").trim(),
    start_time_ksa: r.start_time_ksa ?? findField(r, "start_time_ksa"),
    class_status: String(r.class_status ?? findField(r, "class_status") ?? "").trim(),
    booked_at: r.booked_at ?? null
  }));
};

export const normCalendar = (rows: any[]) => {
  return rows
    .map((r) => ({
      date: String(r.date ?? "").trim(),
      is_workday: String(r.is_workday ?? "").trim(),
      month: String(r.month ?? "").trim()
    }))
    .filter((x) => x.date && x.month);
};
