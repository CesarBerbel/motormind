import React from "react";
import { Card } from "react-bootstrap";
import PageHeader from "./PageHeader";

export default function CrudPageLayout({ title, subtitle, actions, filters, children, className = "" }) {
  return (
    <div className={`crud-page-layout ${className}`.trim()}>
      <PageHeader title={title} subtitle={subtitle}>{actions}</PageHeader>
      {filters ? <Card className="border-0 shadow-sm mb-3"><Card.Body>{filters}</Card.Body></Card> : null}
      {children}
    </div>
  );
}
