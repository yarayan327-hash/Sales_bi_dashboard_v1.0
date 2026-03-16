// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import "./index.css";

import { fetchTable } from "./utils/csv";

import { transformAgents } from "./transformers/agents";
import { transformLeads } from "./transformers/leads";
import { transformTrials } from "./transformers/trials";
import { transformOrders } from "./transformers/orders";
import { transformCalls } from "./transformers/calls";

import { computeTab0ProjectOverview } from "./metrics/tab0ProjectOverview";
import { computeTab1 } from "./metrics/tab1";
import { computeTab2 } from "./metrics/tab2";
import { computeTab3SalesMtdCalendar } from "./metrics/tab3SalesMtdCalendar";

type TabKey = "tab0" | "tab1" | "tab2" | "tab3";
type Scope = "mtd" | "daily" | "all";

const PATHS = {
  agents: "/data/dim_agents.csv",
  leads: "/data/fact_leads.csv",
  calls: "/data/fact_calls.csv",
  orders: "/data/fact_orders.csv",
  trials: "/data/fact_trials.csv",
};

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "0.0%";
  return `${(x * 100).toFixed(1)}%`;
}

function deltaClass(delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return "";
  return delta > 0 ? "pos" : "neg";
}

function KPI({
  title,
  value,
  sub,
  delta,
  tone = "blue",
}: {
  title: string;
  value: string;
  sub?: string;
  delta?: number;
  tone?: "blue" | "dark";
}) {
  return (
    <div className={`kpiCard ${tone === "dark" ? "darkTone" : ""}`}>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
      {sub ? <div className="kpiSub">{sub}</div> : null}
      {typeof delta === "number" ? (
        <div className={`delta ${deltaClass(delta)}`}>
          vs LM: {delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- time helpers ---------- */
function getKsaNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + 3 * 60 * 60 * 1000); // UTC+3
}

function fmtYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getDefaultReportDateKSA() {
  const d = getKsaNow();
  d.setDate(d.getDate() - 1);
  return fmtYMD(d);
}

function formatDDMMYYYY(d: Date | null) {
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatDDMMYYYY_HHMMSS(d: Date | null) {
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

/* 北京时间字符串 -> 绝对时间 Date，再按 KSA 展示 */
function bjStringToKsaDate(raw: any): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // ISO with timezone, e.g. 2026-02-25T17:47:17+08:00
  const isoTs = Date.parse(s);
  if (Number.isFinite(isoTs)) {
    return new Date(isoTs);
  }

  // "YYYY/MM/DD HH:mm:ss" or "YYYY-MM-DD HH:mm:ss" as BJ local time
  const normalized = s.replace(/\//g, "-").replace("T", " ");
  const m = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const ss = Number(m[6] ?? 0);

  // 原始时间按北京时间(+08:00)解释，转成 UTC 绝对时间
  const utcMs = Date.UTC(y, mo - 1, d, hh - 8, mi, ss);
  return new Date(utcMs);
}

function getLatestLeadAssignedDateKSA(rawLeads: any[]): Date | null {
  let latest: Date | null = null;

  for (const r of rawLeads ?? []) {
    const dt =
      bjStringToKsaDate(
        r?.assigned_time ??
          r?.assigned_time_bj ??
          r?.assigned_datetime ??
          r?.assign_time ??
          r?.assigned_date
      );

    if (!dt) continue;
    if (!latest || dt.getTime() > latest.getTime()) latest = dt;
  }

  return latest;
}

/* ---------- display helpers ---------- */
function getDisplaySalesName(it: any) {
  return (
    it?.sales_name ||
    it?.sales_name_raw ||
    it?.sales_agent ||
    it?.agent_name ||
    it?.name ||
    "(unknown)"
  );
}

function getDisplaySalesGroup(it: any) {
  return it?.sales_group || it?.group || "(empty)";
}

function normalizeGroupKey(group: any) {
  const raw =
    group === null || group === undefined || String(group).trim() === ""
      ? "0"
      : String(group).trim();

  if (raw === "(empty)") return "0";
  if (raw.length === 1) return `00${raw}`;
  if (raw.length === 2) return `0${raw}`;
  return raw;
}

function getWeekdayLabelCN(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const w = dt.getDay();
  const map = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return map[w] || "";
}

function renderTeamLabel(groupRaw: any) {
  const key = normalizeGroupKey(groupRaw);
  if (!key || key === "0") return "(empty)";
  return `Team${key}`;
}

function teamPillStyle(groupRaw: any): React.CSSProperties {
  const key = normalizeGroupKey(groupRaw);
  const n = Number(key);
  const isBlue = Number.isFinite(n) && n % 2 === 1;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
    background: isBlue ? "rgba(38,183,255,.10)" : "rgba(253,231,0,.24)",
    border: isBlue
      ? "1px solid rgba(38,183,255,.22)"
      : "1px solid rgba(253,231,0,.38)",
    color: "var(--text-primary)",
  };
}

/* ---------- Tab1 fallback helpers ---------- */
function isZeroDailyBlock(x: any) {
  const booked = Number(x?.booked ?? 0);
  const attended = Number(x?.attended ?? 0);
  const orders = Number(x?.orders ?? 0);
  const gmv = Number(x?.gmv ?? 0);
  return booked === 0 && attended === 0 && orders === 0 && gmv === 0;
}

function pickDailyFallback(tab0Daily: any) {
  const debug = tab0Daily?.debug ?? {};
  const inRange = debug?.in_range ?? {};

  const mtd = tab0Daily?.mtd ?? {};
  const booked = Number(inRange?.trials ?? mtd?.booked ?? 0);
  const attended = Number(inRange?.attended ?? mtd?.attended ?? 0);
  const orders = Number(inRange?.orders ?? mtd?.orders ?? 0);
  const gmv = Number(inRange?.gmv ?? mtd?.gmv ?? 0);

  return { booked, attended, orders, gmv, debug };
}

/* ---------- Tab3 row ---------- */
function MiniSalesRow({ item }: { item: any }) {
  const sales_group = getDisplaySalesGroup(item);
  const sales_name = getDisplaySalesName(item);
  const orders = Number(item?.orders ?? 0);
  const gmv = Number(item?.gmv ?? 0);
  const groupKey = normalizeGroupKey(sales_group);

  return (
    <div
      className={`miniRow g${groupKey}`}
      title={`${sales_name} · ${fmt(orders)} 单 · ${fmtMoney(gmv)}`}
    >
      <span className="dot" />
      <div className="miniRowBody">
        <div className="name">{sales_name}</div>
        <div className="miniBadges">
          <span className="meta">{fmt(orders)} 单</span>
          <span className="meta">{fmtMoney(gmv)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Tab2 helpers ---------- */
function Tab2SummaryTable({
  title,
  rows,
  rangeText,
}: {
  title: string;
  rows: any[];
  rangeText: string;
}) {
  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="sectionHead" style={{ marginBottom: 8 }}>
        <div>
          <div className="h2" style={{ fontSize: 18 }}>{title}</div>
          <div className="hint">{rangeText}</div>
        </div>
      </div>

      <table className="table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ width: 120 }}>sales_group</th>
            <th style={{ minWidth: 180 }}>sales_agent</th>
            <th style={{ textAlign: "right", width: 90 }}>attended</th>
            <th style={{ textAlign: "right", width: 90 }}>pre_2h</th>
            <th style={{ textAlign: "right", width: 90 }}>0~6h</th>
            <th style={{ textAlign: "right", width: 90 }}>6~24h</th>
            <th style={{ textAlign: "right", width: 90 }}>24~48h</th>
            <th style={{ textAlign: "right", width: 90 }}>48h~7d</th>
            <th style={{ textAlign: "right", width: 120 }}>unfollowed_7d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.sales_group}-${r.sales_agent}-${idx}`}>
              <td>{r.sales_group || "(empty)"}</td>
              <td>{r.sales_agent || "(empty)"}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.attended ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.pre_2h ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.post_6h ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.post_24h ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.post_48h ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.post_7d ?? 0))}</td>
              <td style={{ textAlign: "right" }}>{fmt(Number(r.unfollowed_7d ?? 0))}</td>
            </tr>
          ))}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ color: "var(--text-secondary)", fontWeight: 900, padding: 14 }}>
                当前没有命中的销售汇总数据。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("tab0");
  const [scope, setScope] = useState<Scope>("mtd");
  const [reportDate, setReportDate] = useState<string>(getDefaultReportDateKSA());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [loadedAtKsa, setLoadedAtKsa] = useState<Date | null>(null);

  const [raw, setRaw] = useState<{
    agents: any[];
    leads: any[];
    calls: any[];
    orders: any[];
    trials: any[];
  }>({ agents: [], leads: [], calls: [], orders: [], trials: [] });

  async function reloadAll() {
    setErr("");
    setLoading(true);
    try {
      const [agents, leads, calls, orders, trials] = await Promise.all([
        fetchTable(PATHS.agents),
        fetchTable(PATHS.leads),
        fetchTable(PATHS.calls),
        fetchTable(PATHS.orders),
        fetchTable(PATHS.trials),
      ]);

      setRaw({
        agents: Array.isArray(agents) ? agents : [],
        leads: Array.isArray(leads) ? leads : [],
        calls: Array.isArray(calls) ? calls : [],
        orders: Array.isArray(orders) ? orders : [],
        trials: Array.isArray(trials) ? trials : [],
      });

      setLoadedAtKsa(getKsaNow());
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadAll();
  }, []);

  /* ---------- transforms ---------- */
  const agents = useMemo(() => transformAgents(raw.agents ?? []), [raw.agents]);
  const leads = useMemo(() => transformLeads(raw.leads ?? []), [raw.leads]);
  const calls = useMemo(() => transformCalls(raw.calls ?? []), [raw.calls]);
  const orders = useMemo(() => transformOrders(raw.orders ?? []), [raw.orders]);
  const trials = useMemo(() => transformTrials(raw.trials ?? []), [raw.trials]);

  const latestLeadAssignedKsa = useMemo(() => getLatestLeadAssignedDateKSA(raw.leads ?? []), [raw.leads]);

  /* ---------- compute ---------- */
  const tab0 = useMemo(() => {
    try {
      return computeTab0ProjectOverview({
        reportDate,
        scope,
        agents,
        leads,
        trials,
        orders,
      } as any);
    } catch (e: any) {
      return { error: String(e?.message ?? e ?? "Tab0 build error") } as any;
    }
  }, [reportDate, scope, agents, leads, trials, orders]);

  const tab0Daily = useMemo(() => {
    try {
      return computeTab0ProjectOverview({
        reportDate,
        scope: "daily",
        agents,
        leads,
        trials,
        orders,
      } as any);
    } catch (e: any) {
      return { error: String(e?.message ?? e ?? "Tab0 daily build error") } as any;
    }
  }, [reportDate, agents, leads, trials, orders]);

  const tab1Raw = useMemo(() => {
    try {
      return computeTab1({ reportDate, agents, leads, trials, orders, calls } as any);
    } catch (e: any) {
      return { error: String(e?.message ?? e ?? "Tab1 build error") } as any;
    }
  }, [reportDate, agents, leads, trials, orders, calls]);

  const tab1 = useMemo(() => {
    const rawBlock: any = tab1Raw ?? {};
    if (rawBlock?.error) return rawBlock;

    if (!isZeroDailyBlock(rawBlock)) {
      return {
        ...rawBlock,
        debug: {
          ...(rawBlock?.debug ?? {}),
          source: "computeTab1",
        },
      };
    }

    const fallback = pickDailyFallback(tab0Daily);

    return {
      booked: fallback.booked,
      attended: fallback.attended,
      orders: fallback.orders,
      gmv: fallback.gmv,
      debug: {
        source: "fallback_tab0_daily",
        note: "computeTab1 输出为 0，已自动使用 Tab0 的 daily 口径兜底（通常是日期/字段对齐问题导致）。",
        tab1_debug: rawBlock?.debug ?? rawBlock,
        tab0_daily_debug: fallback.debug,
      },
    };
  }, [tab1Raw, tab0Daily]);

  const tab2 = useMemo(() => {
    try {
      return computeTab2({ reportDate, agents, leads, trials, orders, calls } as any);
    } catch (e: any) {
      return { error: String(e?.message ?? e ?? "Tab2 build error") } as any;
    }
  }, [reportDate, agents, leads, trials, orders, calls]);

  const tab3 = useMemo(() => {
    try {
      return computeTab3SalesMtdCalendar({ reportDate, agents, orders, scope: "mtd" } as any);
    } catch (e: any) {
      return { error: String(e?.message ?? e ?? "Tab3 build error") } as any;
    }
  }, [reportDate, agents, orders]);

  const loadedHint = `Loaded rows: agents ${agents?.length ?? 0}, leads ${leads?.length ?? 0}, calls ${
    calls?.length ?? 0
  }, orders ${orders?.length ?? 0}, trials ${trials?.length ?? 0}`;

  const topError =
    err ||
    (tab === "tab0" && (tab0 as any)?.error) ||
    (tab === "tab1" && (tab1 as any)?.error) ||
    (tab === "tab2" && (tab2 as any)?.error) ||
    (tab === "tab3" && (tab3 as any)?.error) ||
    "";

  const tab3Top3 = useMemo(() => {
    try {
      const cells = (tab3 as any)?.cells ?? {};
      const all: any[] = Object.keys(cells).flatMap((d) => (cells?.[d] ?? []) as any[]);
      const byName = new Map<string, any>();

      for (const it of all) {
        const k = String(getDisplaySalesName(it));
        const prev = byName.get(k);
        if (!prev || Number(it?.gmv ?? 0) > Number(prev?.gmv ?? 0)) {
          byName.set(k, it);
        }
      }

      const arr = Array.from(byName.values());
      arr.sort((a, b) => Number(b?.gmv ?? 0) - Number(a?.gmv ?? 0));
      return arr.slice(0, 3);
    } catch {
      return [];
    }
  }, [tab3]);

  const tab2WeeklyRows = (((tab2 as any)?.weeklyBySales ?? []) as any[]);
  const tab2MonthlyRows = (((tab2 as any)?.monthlyBySales ?? []) as any[]);

  return (
    <div className="page">
      <div className="card topbar">
        <div>
          <div className="title">Sales BI Dashboard</div>
          <div className="hint" style={{ marginTop: 10 }}>
            数据更新时间：截至 {formatDDMMYYYY(latestLeadAssignedKsa)} 分配线索
          </div>
          <div className="hint" style={{ marginTop: 4, opacity: 0.75 }}>
            本次载入时间：截至 {formatDDMMYYYY_HHMMSS(loadedAtKsa)}（KSA）
          </div>
        </div>

        <div className="topbar-actions">
          <button className="btn primary" onClick={reloadAll} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </button>
        </div>
      </div>

      <div className="card controls">
        <div className="control">
          <label>reportDate (KSA, T-1)</label>
          <input value={reportDate} onChange={(e) => setReportDate(e.target.value.slice(0, 10))} />
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "tab0" ? "active" : ""}`} onClick={() => setTab("tab0")}>
            Tab0 项目总览
          </button>
          <button className={`tab ${tab === "tab1" ? "active" : ""}`} onClick={() => setTab("tab1")}>
            Tab1 日报看板
          </button>
          <button className={`tab ${tab === "tab2" ? "active" : ""}`} onClick={() => setTab("tab2")}>
            Tab2 课后长尾追踪
          </button>
          <button className={`tab ${tab === "tab3" ? "active" : ""}`} onClick={() => setTab("tab3")}>
            Tab3 销售MTD日历
          </button>
        </div>
      </div>

      {topError ? (
        <div className="errorBanner">
          <b>Error:</b> {topError}
        </div>
      ) : null}

      <div className="content">
        {tab === "tab0" ? (
          <div className="card" style={{ padding: 18 }}>
            <div className="sectionHead">
              <div>
                <h2 className="h2">项目总览（MTD to T-1, KSA）</h2>
                <div className="hint">口径：MTD=当月1号~T-1；Daily=仅T-1当天；All-time=截至T-1累计</div>
              </div>

              <div className="pills">
                <button className={`pill ${scope === "mtd" ? "active" : ""}`} onClick={() => setScope("mtd")}>
                  MTD
                </button>
                <button className={`pill ${scope === "daily" ? "active" : ""}`} onClick={() => setScope("daily")}>
                  Daily
                </button>
                <button className={`pill ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                  All-time
                </button>
              </div>
            </div>

            <div className="grid kpi">
              <KPI title="线索 Leads" value={fmt((tab0 as any)?.mtd?.leads ?? 0)} delta={(tab0 as any)?.vs_last_month_same_period?.leads_delta} />
              <KPI title="预约 Booked" value={fmt((tab0 as any)?.mtd?.booked ?? 0)} delta={(tab0 as any)?.vs_last_month_same_period?.booked_delta} />
              <KPI title="出席 Attended" value={fmt((tab0 as any)?.mtd?.attended ?? 0)} delta={(tab0 as any)?.vs_last_month_same_period?.attended_delta} />
              <KPI title="订单 Orders" value={fmt((tab0 as any)?.mtd?.orders ?? 0)} delta={(tab0 as any)?.vs_last_month_same_period?.orders_delta} />
              <KPI title="GMV" value={fmt((tab0 as any)?.mtd?.gmv ?? 0)} delta={(tab0 as any)?.vs_last_month_same_period?.gmv_delta} />

              <KPI title="预约率" value={fmtPct((tab0 as any)?.rates?.booking_rate ?? 0)} sub={`${fmt((tab0 as any)?.mtd?.booked ?? 0)}/${fmt((tab0 as any)?.mtd?.leads ?? 0)}`} />
              <KPI title="出席率" value={fmtPct((tab0 as any)?.rates?.attendance_rate ?? 0)} sub={`${fmt((tab0 as any)?.mtd?.attended ?? 0)}/${fmt((tab0 as any)?.mtd?.booked ?? 0)}`} />
              <KPI title="出席转化率" value={fmtPct((tab0 as any)?.rates?.attended_conversion ?? 0)} sub={`${fmt((tab0 as any)?.mtd?.orders ?? 0)}/${fmt((tab0 as any)?.mtd?.attended ?? 0)}`} />
              <KPI title="线索转化率" value={fmtPct((tab0 as any)?.rates?.lead_conversion ?? 0)} sub={`${fmt((tab0 as any)?.mtd?.orders ?? 0)}/${fmt((tab0 as any)?.mtd?.leads ?? 0)}`} />
              <KPI title="AOV" value={fmt(Math.round((tab0 as any)?.rates?.aov ?? 0))} sub="GMV / Orders" />
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontWeight: 900, cursor: "pointer" }}>Debug</summary>
              <pre className="pre">{JSON.stringify((tab0 as any)?.debug ?? tab0, null, 2)}</pre>
            </details>
          </div>
        ) : null}

        {tab === "tab1" ? (
          <div className="card" style={{ padding: 18 }}>
            <div className="sectionHead">
              <div>
                <h2 className="h2">Tab1 日报看板</h2>
                <div className="hint">口径：日报（T-1 单日）。若 computeTab1 因字段/日期不匹配导致 0，会自动使用 Tab0 daily 口径兜底。</div>
              </div>
            </div>

            <div className="grid kpi">
              <KPI title="Booked" value={fmt((tab1 as any)?.booked ?? 0)} />
              <KPI title="Attended" value={fmt((tab1 as any)?.attended ?? 0)} />
              <KPI title="Orders" value={fmt((tab1 as any)?.orders ?? 0)} />
              <KPI title="GMV" value={fmt((tab1 as any)?.gmv ?? 0)} />
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontWeight: 900, cursor: "pointer" }}>Debug</summary>
              <pre className="pre">{JSON.stringify(tab1, null, 2)}</pre>
            </details>
          </div>
        ) : null}

        {tab === "tab2" ? (
          <div className="card" style={{ padding: 18 }}>
            <div className="sectionHead">
              <div>
                <h2 className="h2">Tab2 课后长尾追踪</h2>
                <div className="hint">
                  口径：按销售汇总。有效通话 = call_duration_sec ≥ 20 秒。课后时间窗为互斥分桶。
                </div>
              </div>
            </div>

            <div className="grid kpi">
              <KPI title="Weekly Attended" value={fmt(Number((tab2 as any)?.debug?.attendedWeekly ?? 0))} />
              <KPI title="Monthly Attended" value={fmt(Number((tab2 as any)?.debug?.attendedMonthly ?? 0))} />
              <KPI title="Effective Calls" value={fmt(Number((tab2 as any)?.debug?.effectiveCalls ?? 0))} />
              <KPI title="Calls Users" value={fmt(Number((tab2 as any)?.debug?.callsUsers ?? 0))} />
            </div>

            <Tab2SummaryTable
              title="本周按销售汇总"
              rows={tab2WeeklyRows}
              rangeText={`${(tab2 as any)?.weeklyRange?.start ?? "-"} ~ ${(tab2 as any)?.weeklyRange?.end ?? "-"}`}
            />

            <Tab2SummaryTable
              title="本月按销售汇总"
              rows={tab2MonthlyRows}
              rangeText={`${(tab2 as any)?.monthlyRange?.start ?? "-"} ~ ${(tab2 as any)?.monthlyRange?.end ?? "-"}`}
            />

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontWeight: 900, cursor: "pointer" }}>Debug</summary>
              <pre className="pre">{JSON.stringify(tab2, null, 2)}</pre>
            </details>
          </div>
        ) : null}

        {tab === "tab3" ? (
          <div className="card" style={{ padding: 18 }}>
            <div className="sectionHead">
              <div>
                <h2 className="h2">Sales MTD Calendar</h2>
                <div className="hint">
                  范围：{(tab3 as any)?.range?.start} ~ {(tab3 as any)?.range?.end}（工作日：周日-周四）
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "flex-end",
                  minWidth: 260,
                }}
              >
                {tab3Top3.map((it: any, i: number) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
                  return (
                    <div
                      key={`${getDisplaySalesName(it)}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 14,
                        border: "var(--border)",
                        background: "#fff",
                        fontWeight: 900,
                        width: "100%",
                        maxWidth: 360,
                        justifyContent: "space-between",
                      }}
                      title={`${getDisplaySalesName(it)} · ${fmt(it?.orders ?? 0)} 单 · ${fmtMoney(it?.gmv ?? 0)}`}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span>{medal}</span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 160,
                          }}
                        >
                          {getDisplaySalesName(it)}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85, whiteSpace: "nowrap" }}>
                        {fmt(it?.orders ?? 0)}单 · {fmtMoney(it?.gmv ?? 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <div className="h2" style={{ fontSize: 18 }}>
                组别 MTD GMV（排序）
              </div>
              <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "55%" }}>sales_group</th>
                    <th style={{ textAlign: "right", width: "20%" }}>orders</th>
                    <th style={{ textAlign: "right", width: "25%" }}>gmv</th>
                  </tr>
                </thead>
                <tbody>
                  {(((tab3 as any)?.groupTable ?? []) as any[]).map((r: any) => (
                    <tr key={r.sales_group || "(empty)"}>
                      <td>
                        <span style={teamPillStyle(r.sales_group)}>
                          {renderTeamLabel(r.sales_group)}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>{fmt(r.orders ?? 0)}</td>
                      <td style={{ textAlign: "right", fontWeight: 900 }}>{fmtMoney(r.gmv ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontWeight: 900, opacity: 0.85 }}>
              工作日日历
            </div>

            <div className="calendarGrid">
              {(((tab3 as any)?.workdays ?? []) as string[]).map((d) => {
                const items = (tab3 as any)?.cells?.[d] ?? [];
                return (
                  <div key={d} className="dayCell" style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div
                        className="dayTitle"
                        style={{
                          whiteSpace: "nowrap",
                          wordBreak: "keep-all",
                        }}
                      >
                        {d}
                      </div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          alignSelf: "flex-start",
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "rgba(246,246,246,.95)",
                          border: "1px solid rgba(0,0,0,.06)",
                          fontSize: 12,
                          fontWeight: 900,
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getWeekdayLabelCN(d)}
                      </span>
                    </div>

                    {items?.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, minWidth: 0 }}>
                        {items.map((it: any, idx: number) => (
                          <MiniSalesRow
                            key={`${getDisplaySalesName(it)}-${idx}`}
                            item={it}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty" style={{ marginTop: 10 }}>
                        —
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontWeight: 900, cursor: "pointer" }}>Debug</summary>
              <pre className="pre">{JSON.stringify((tab3 as any)?.debug ?? tab3, null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </div>

      <div className="footer">{loadedHint}</div>
    </div>
  );
}