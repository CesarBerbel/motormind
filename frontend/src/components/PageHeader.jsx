import React from "react";
export default function PageHeader({ title, subtitle, actions, children }) {
  const rightContent = actions || children;
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 className="page-title h3 mb-1">{title}</h1>
        {subtitle && <div className="text-muted">{subtitle}</div>}
      </div>
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
}
