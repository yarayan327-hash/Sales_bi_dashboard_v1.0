function safeNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseAssignedTs(raw: any): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function parseCallTs(raw: any): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function hoursBetween(startTs: number, endTs: number): number | null {
  if (!startTs || !endTs || endTs < startTs) return null;
  return (endTs - startTs) / 1000 / 60 / 60;
}

export function buildUnreachedLeads(input: {
  reportDate: string;
  leads: any[];
  calls: any[];
  agents: any[];
}) {
  const leads = Array.isArray(input.leads) ? input.leads : [];
  const calls = Array.isArray(input.calls) ? input.calls : [];
  const agents = Array.isArray(input.agents) ? input.agents : [];
  const reportDate = String(input.reportDate ?? "").slice(0, 10);

  const agentMap = new Map<string, any>();
  for (const a of agents) {
    const sid = String(a.sales_id ?? "").trim();
    if (sid) agentMap.set(sid, a);
  }

  const callsByUser = new Map<string, any[]>();
  for (const c of calls) {
    const uid = String(c.user_id ?? "").trim();
    if (!uid) continue;
    if (!callsByUser.has(uid)) callsByUser.set(uid, []);
    callsByUser.get(uid)!.push(c);
  }

  for (const arr of callsByUser.values()) {
    arr.sort((a, b) => parseCallTs(a.outbound_ts_ms) - parseCallTs(b.outbound_ts_ms));
  }

  return leads
    .filter((l) => String(l.assigned_time ?? "").slice(0, 10) <= reportDate)
    .map((l) => {
      const uid = String(l.user_id ?? "").trim();
      const salesId = String(l.sales_id ?? "").trim();
      const assignedTime = String(l.assigned_time ?? "");
      const assignedTs = parseAssignedTs(assignedTime);
      const userCalls = callsByUser.get(uid) ?? [];
      const effectiveCalls = userCalls.filter((c) => safeNum(c.call_duration_sec) >= 20);
      const firstConnectTs = effectiveCalls.length
        ? parseCallTs(effectiveCalls[0].outbound_ts_ms)
        : 0;

      const agent = agentMap.get(salesId);

      return {
        user_id: uid,
        sales_id: salesId,
        sales_group: String(agent?.sales_group ?? ""),
        sales_agent: String(agent?.sales_name ?? ""),
        assigned_time: assignedTime,
        lead_source: String(l.lead_source ?? ""),
        total_calls: userCalls.length,
        connected_calls: effectiveCalls.length,
        first_connect_interval_hours: firstConnectTs
          ? hoursBetween(assignedTs, firstConnectTs)
          : null,
        is_reached: effectiveCalls.length > 0,
      };
    })
    .filter((r) => !r.is_reached)
    .sort((a, b) => {
      if (a.total_calls !== b.total_calls) return a.total_calls - b.total_calls;
      return String(a.assigned_time).localeCompare(String(b.assigned_time));
    });
}