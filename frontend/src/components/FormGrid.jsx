import React from "react";
export default function FormGrid({ children, columns = 2, className = "" }) {
  return <div className={`form-grid form-grid-${columns} ${className}`.trim()}>{children}</div>;
}
