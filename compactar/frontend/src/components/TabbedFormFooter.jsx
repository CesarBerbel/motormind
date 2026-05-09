import React from "react";
import { Button, Modal } from "react-bootstrap";

function currentIndex(tabs, activeKey) {
  return Math.max(0, tabs.findIndex((tab) => tab.key === activeKey));
}

export function isLastTab(tabs, activeKey) {
  const index = currentIndex(tabs, activeKey);
  return tabs.length === 0 || index === tabs.length - 1;
}

export default function TabbedFormFooter({
  tabs = [],
  activeKey,
  onSelect,
  onCancel,
  cancelLabel = "Cancelar",
  saveLabel = "Salvar",
  saveDisabled = false,
  saveVisible,
  nextLabel = "Próximo",
  previousLabel = "Anterior",
  closeVariant = "secondary",
  className = "",
}) {
  const index = currentIndex(tabs, activeKey);
  const last = isLastTab(tabs, activeKey);
  const canGoPrevious = index > 0;
  const canGoNext = tabs.length > 0 && !last;
  const shouldShowSave = typeof saveVisible === "boolean" ? saveVisible : last;

  function goTo(offset) {
    const target = tabs[index + offset];
    if (target && onSelect) onSelect(target.key);
  }

  return (
    <Modal.Footer className={`tabbed-form-footer ${className}`.trim()}>
      <div className="tabbed-form-footer-status me-auto">
        {tabs.length ? `Etapa ${index + 1} de ${tabs.length}` : null}
      </div>
      <Button variant={closeVariant} onClick={onCancel}>{cancelLabel}</Button>
      {canGoPrevious ? <Button type="button" variant="outline-secondary" onClick={() => goTo(-1)}>{previousLabel}</Button> : null}
      {canGoNext ? <Button type="button" variant="primary" onClick={() => goTo(1)}>{nextLabel}</Button> : null}
      {shouldShowSave ? <Button type="submit" disabled={saveDisabled}>{saveLabel}</Button> : null}
    </Modal.Footer>
  );
}

export function InlineTabbedFormFooter(props) {
  const {
    tabs = [],
    activeKey,
    onSelect,
    onCancel,
    cancelLabel = "Cancelar",
    saveLabel = "Salvar",
    saveDisabled = false,
    saveVisible,
    nextLabel = "Próximo",
    previousLabel = "Anterior",
    className = "",
  } = props;
  const index = currentIndex(tabs, activeKey);
  const last = isLastTab(tabs, activeKey);
  const canGoPrevious = index > 0;
  const canGoNext = tabs.length > 0 && !last;
  const shouldShowSave = typeof saveVisible === "boolean" ? saveVisible : last;

  function goTo(offset) {
    const target = tabs[index + offset];
    if (target && onSelect) onSelect(target.key);
  }

  return (
    <div className={`tabbed-form-footer inline ${className}`.trim()}>
      <div className="tabbed-form-footer-status me-auto">
        {tabs.length ? `Etapa ${index + 1} de ${tabs.length}` : null}
      </div>
      <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
      {canGoPrevious ? <Button type="button" variant="outline-secondary" onClick={() => goTo(-1)}>{previousLabel}</Button> : null}
      {canGoNext ? <Button type="button" variant="primary" onClick={() => goTo(1)}>{nextLabel}</Button> : null}
      {shouldShowSave ? <Button type="submit" disabled={saveDisabled}>{saveLabel}</Button> : null}
    </div>
  );
}
