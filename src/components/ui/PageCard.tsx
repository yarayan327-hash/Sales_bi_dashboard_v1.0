// src/components/ui/PageCard.tsx
import React from "react";

export function PageCard({
  children,
  style,
  className = "",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={`content ${className}`.trim()}>
      <div className="card" style={{ padding: 18, ...(style || {}) }}>
        {children}
      </div>
    </div>
  );
}