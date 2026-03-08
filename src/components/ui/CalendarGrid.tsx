// src/components/ui/CalendarGrid.tsx
import React from "react";

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

export type CalendarItem = {
  sales_name: string;
  sales_group?: string; // "001"/"002"
  orders: number;
  gmv: number;
  rank?: number; // optional (1/2/3)
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  items: CalendarItem[];
};

export function CalendarGrid({
  days,
  top3,
}: {
  days: CalendarDay[];
  top3?: CalendarItem[];
}) {
  return (
    <>
      {top3?.length ? (
        <div className="hint" style={{ fontWeight: 900 }}>
          Top3：
          {top3.map((x, i) => (
            <span key={x.sales_name} style={{ marginLeft: 10 }}>
              <span className={`medal m${i + 1}`}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
              </span>{" "}
              {x.sales_name} ({fmt(x.gmv)})
            </span>
          ))}
        </div>
      ) : null}

      <div className="calendarGrid">
        {days.map((d) => (
          <div key={d.date} className="dayCell">
            <div className="dayTitle">{d.date}</div>

            {d.items?.length ? (
              d.items.map((it) => (
                <div
                  key={it.sales_name}
                  className={`miniRow g${it.sales_group || "0"}`}
                  title={`${it.sales_name} | orders=${it.orders} | gmv=${it.gmv}`}
                >
                  <span className="dot" />
                  <span className="name">{it.sales_name}</span>
                  <span className="meta">
                    {fmt(it.orders)} 单 · {fmt(it.gmv)}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty">—</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}