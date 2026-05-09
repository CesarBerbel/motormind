import React from "react";
const variantTitles = {
  info: "Aviso",
  success: "Tudo certo",
  warning: "Atenção",
  danger: "Ação necessária",
};

export default function NoticeBox({ variant = "info", title, children, className = "" }) {
  const normalizedVariant = ["info", "success", "warning", "danger"].includes(variant) ? variant : "info";

  return (
    <div className={`notice-box notice-box-${normalizedVariant} ${className}`.trim()}>
      <div className="notice-box-marker" aria-hidden="true" />
      <div>
        <div className="notice-box-title">{title || variantTitles[normalizedVariant]}</div>
        <div className="notice-box-content">{children}</div>
      </div>
    </div>
  );
}
