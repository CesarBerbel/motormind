import React from "react";
import { Button } from "react-bootstrap";

export default function FormActions({ onCancel, cancelLabel = "Cancelar", submitLabel = "Salvar", loading = false, children }) {
  return (
    <div className="form-actions">
      {children}
      {onCancel ? <Button type="button" variant="outline-secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button> : null}
      <Button type="submit" variant="primary" disabled={loading}>{loading ? "Salvando..." : submitLabel}</Button>
    </div>
  );
}
