// src/components/TabViews.tsx
import React from "react";

function fmt(n: any) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString();
}

function medal(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "";
}

export function Tab0View(props: any) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="sectionHead">
        <div>
          <h2 className="h2">项目总览（MTD to T-1, KSA）</h2>
          <div className="hint">口径：MTD=当月1号~T-1；Daily=仅T-1当天；All-time=截至T-1累计</div>
        </div>
        <div className="pills">
          {(["mtd", "daily", "all"] as const).map((k) => (
            <button key={k} className={props.scope === k ? "pill active" : "pill"} onClick={() => props.setScope(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <pre className="pre">{JSON.stringify(props.data, null, 2)}</pre>
    </div>
  );
}

export function Tab1View(props: any) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 className="h2">Tab1 日报看板</h2>
      <div className="hint">（先保留数据输出，后续再做模块化卡片）</div>
      <pre className="pre">{JSON.stringify(props.data, null, 2)}</pre>
    </div>
  );
}

export function Tab2View(props: any) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 className="h2">Tab2 课后长尾追踪</h2>
      <div className="hint">有效通话口径：call_duration_sec ≥ 20</div>
      <pre className="pre">{JSON.stringify(props.data, null, 2)}</pre>
    </div>
  );
}

export function Tab3View(props: any) {
  const d = props.data || {};
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="sectionHead">
        <div>
          <h2 className="h2">Sales MTD Calendar</h2>
          <div className="hint">
            范围：{d?.range?.start} ~ {d?.range?.end}（工作日）
          </div>
        </div>
        <div className="hint">Top3：{(d.top3 || []).map((x: any, i: number) => `${medal(i)} ${x.sales} (${fmt(x.gmv)})`).join("  ")}</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 12 }}>
        <div className="kpiCard">
          <div className="kpiTitle">组别 MTD GMV（排序）</div>
          <div style={{ marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.75 }}>
                  <th style={{ padding: "8px 0" }}>sales_group</th>
                  <th style={{ padding: "8px 0" }}>orders</th>
                  <th style={{ padding: "8px 0" }}>gmv</th>
                </tr>
              </thead>
              <tbody>
                {(d.groupTable || []).map((r: any, idx: number) => (
                  <tr key={idx} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "8px 0", fontWeight: 900 }}>{r.sales_group}</td>
                    <td style={{ padding: "8px 0" }}>{fmt(r.orders)}</td>
                    <td style={{ padding: "8px 0", fontWeight: 900 }}>{fmt(r.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="kpiCard">
          <div className="kpiTitle">Debug</div>
          <pre className="pre">{JSON.stringify(d.debug, null, 2)}</pre>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="kpiTitle">工作日日历（把销售放到“最后一次成单日期”的格子里）</div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 10,
            marginTop: 10,
          }}
        >
          {(d.workdays || []).map((day: string) => {
            const cells = (d.cells && d.cells[day]) ? d.cells[day] : [];
            return (
              <div key={day} className="kpiCard" style={{ minHeight: 120 }}>
                <div style={{ fontWeight: 900, opacity: 0.9 }}>{day}</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {cells.slice(0, 6).map((x: any, i: number) => (
                    <div key={i} style={{ fontSize: 12, fontWeight: 800 }}>
                      {x.group === "001" ? "🔵" : x.group === "002" ? "🟡" : "⚪"} {x.sales} · {fmt(x.orders)}单 · {fmt(x.gmv)}
                    </div>
                  ))}
                  {cells.length === 0 ? <div style={{ fontSize: 12, opacity: 0.55 }}>—</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <pre className="pre" style={{ marginTop: 14 }}>{JSON.stringify(d, null, 2)}</pre>
    </div>
  );
}