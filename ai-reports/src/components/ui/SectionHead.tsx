// src/components/ui/SectionHead.tsx
import React from "react";

export function SectionHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="sectionHead">
      <div>
        <h2 className="h2">{title}</h2>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}