// src/components/ui/Kpi.tsx
import React from "react";

function fmt(n: number) {
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

export function KpiCard({
  title,
  value,
  sub,
  delta,
  isPct,
}: {
  title: string;
  value: number;
  sub?: string;
  delta?: number;
  isPct?: boolean;
}) {
  const display = isPct ? fmtPct(value) : fmt(value);

  return (
    <div className="kpiCard">
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{display}</div>
      {sub ? <div className="kpiSub">{sub}</div> : null}
      {typeof delta === "number" ? (
        <div className={`delta ${deltaClass(delta)}`}>
          vs LM: {delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
        </div>
      ) : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid kpi">{children}</div>;
}