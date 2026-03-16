import React from "react";
import clsx from "clsx";

export function Tabs(props: { value: string; onChange: (v: string) => void; items: { key: string; label: string }[] }) {
  return (
    <div className="pills">
      {props.items.map(it => (
        <button
          key={it.key}
          className={clsx(it.key === props.value ? "primary" : "")}
          onClick={() => props.onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
