import React from "react";

export function Table<T extends Record<string, any>>(props: {
  columns: { key: keyof T; title: string; render?: (v: any, row: T) => React.ReactNode }[];
  rows: T[];
  emptyText?: string;
}) {
  const { columns, rows } = props;

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {columns.map(c => <th key={String(c.key)}>{c.title}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{props.emptyText ?? "No data"}</td></tr>
          ) : rows.map((r, idx) => (
            <tr key={idx}>
              {columns.map(c => (
                <td key={String(c.key)}>
                  {c.render ? c.render(r[c.key], r) : String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
