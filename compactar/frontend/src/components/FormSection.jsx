import React from "react";
export default function FormSection({ title, description, children, className = "" }) {
  return (
    <section className={`form-section ${className}`.trim()}>
      {title || description ? (
        <div className="form-section-header">
          {title ? <h6 className="form-section-title">{title}</h6> : null}
          {description ? <p className="form-section-description">{description}</p> : null}
        </div>
      ) : null}
      <div className="form-section-body">{children}</div>
    </section>
  );
}
