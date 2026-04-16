import type { ReactNode } from "react";

export interface StatePanelProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function StatePanel({ title, description, action }: StatePanelProps) {
  return (
    <div className="state-panel">
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="state-panel-action">{action}</div> : null}
    </div>
  );
}
