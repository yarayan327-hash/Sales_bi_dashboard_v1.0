export function buildSalesTodo(input: {
  unreachedLeads: any[];
  preclassUnfollowed: any[];
  postclassUnfollowed: any[];
}) {
  const unreachedLeads = Array.isArray(input.unreachedLeads) ? input.unreachedLeads : [];
  const preclassUnfollowed = Array.isArray(input.preclassUnfollowed) ? input.preclassUnfollowed : [];
  const postclassUnfollowed = Array.isArray(input.postclassUnfollowed) ? input.postclassUnfollowed : [];

  const map = new Map<string, any>();

  function getRow(salesGroup: string, salesAgent: string) {
    const key = `${salesGroup}||${salesAgent}`;
    if (!map.has(key)) {
      map.set(key, {
        sales_group: salesGroup,
        sales_agent: salesAgent,
        unreached_leads: [],
        preclass_tasks: [],
        postclass_tasks: [],
      });
    }
    return map.get(key);
  }

  for (const r of unreachedLeads) {
    const row = getRow(String(r.sales_group ?? ""), String(r.sales_agent ?? ""));
    row.unreached_leads.push({
      user_id: r.user_id,
      lead_source: r.lead_source,
      assigned_time: r.assigned_time,
      total_calls: r.total_calls,
    });
  }

  for (const r of preclassUnfollowed) {
    const row = getRow(String(r.sales_group ?? ""), String(r.sales_agent ?? ""));
    row.preclass_tasks.push({
      user_id: r.user_id,
      class_start_ksa: r.class_start_ksa,
      booking_type: r.booking_type,
      textbook: r.textbook,
    });
  }

  for (const r of postclassUnfollowed) {
    const row = getRow(String(r.sales_group ?? ""), String(r.sales_agent ?? ""));
    row.postclass_tasks.push({
      user_id: r.user_id,
      class_start_ksa: r.class_start_ksa,
      booking_type: r.booking_type,
      textbook: r.textbook,
      missing_post_6h_touch: r.missing_post_6h_touch,
      missing_post_24h_touch: r.missing_post_24h_touch,
    });
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    unreached_count: r.unreached_leads.length,
    preclass_count: r.preclass_tasks.length,
    postclass_count: r.postclass_tasks.length,
    total_todo_count:
      r.unreached_leads.length + r.preclass_tasks.length + r.postclass_tasks.length,
  }));

  rows.sort((a, b) => b.total_todo_count - a.total_todo_count);
  return rows;
}