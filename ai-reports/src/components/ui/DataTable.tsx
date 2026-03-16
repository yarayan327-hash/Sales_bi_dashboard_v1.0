// src/components/ui/DataTable.tsx
import React from "react";

export type Column<T> = {
  key: string;
  title: string;
  align?: "left" | "right" | "center";
  render?: (row: T, index: number) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyText = "—",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  emptyText?: string;
}) {
  return (
    <table className="table" style={{ width: "100%" }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: c.align || "left",
              }}
            >
              {c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows?.length ? (
          rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : String(i)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left" }}>
                  {c.render ? c.render(r, i) : (r as any)?.[c.key] ?? ""}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length} style={{ padding: 14, opacity: 0.8 }}>
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}