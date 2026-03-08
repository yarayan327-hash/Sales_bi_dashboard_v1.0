// src/components/ui/DebugPanel.tsx
import React from "react";

export function DebugPanel({
  data,
  title = "Debug",
  defaultOpen = false,
}: {
  data: any;
  title?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details style={{ marginTop: 16 }} open={defaultOpen}>
      <summary style={{ cursor: "pointer", fontWeight: 900 }}>{title}</summary>
      <pre className="pre">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}