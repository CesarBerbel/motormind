import React from "react";
import { Button } from "react-bootstrap";

export default function FormTabs({ tabs, activeKey, onSelect, className = "" }) {
  return (
    <div className={`form-tabs ${className}`.trim()}>
      {tabs.map((tab, index) => {
        const active = tab.key === activeKey;
        return (
          <Button
            key={tab.key}
            type="button"
            variant="link"
            className={`form-tab-button ${active ? "active" : ""}`.trim()}
            onClick={() => onSelect(tab.key)}
          >
            <span className="form-tab-index">{index + 1}</span>
            <span>
              <strong>{tab.label}</strong>
              {tab.description ? <small>{tab.description}</small> : null}
            </span>
            {tab.badge ? <span className="form-tab-badge">{tab.badge}</span> : null}
          </Button>
        );
      })}
    </div>
  );
}

export function TabPanel({ activeKey, eventKey, children }) {
  if (activeKey !== eventKey) return null;
  return <div className="tab-panel">{children}</div>;
}
