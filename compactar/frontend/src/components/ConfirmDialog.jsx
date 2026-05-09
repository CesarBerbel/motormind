import React, { useEffect, useState } from "react";
import { Button, Modal } from "react-bootstrap";

let openConfirmDialog = null;

const DEFAULT_OPTIONS = {
  title: "Confirmação necessária",
  message: "Confirma esta ação?",
  confirmLabel: "Confirmar",
  cancelLabel: "Cancelar",
  variant: "danger",
};

function normalizeOptions(options) {
  if (typeof options === "string") return { ...DEFAULT_OPTIONS, message: options };
  return { ...DEFAULT_OPTIONS, ...(options || {}) };
}

export function confirmDialog(options) {
  if (typeof openConfirmDialog !== "function") {
    return Promise.resolve(window.confirm(typeof options === "string" ? options : options?.message || DEFAULT_OPTIONS.message));
  }
  return openConfirmDialog(normalizeOptions(options));
}

export default function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState({ show: false, options: DEFAULT_OPTIONS, resolve: null });

  useEffect(() => {
    openConfirmDialog = (options) => new Promise((resolve) => {
      setState({ show: true, options: normalizeOptions(options), resolve });
    });
    return () => {
      openConfirmDialog = null;
    };
  }, []);

  function close(result) {
    const resolver = state.resolve;
    setState({ show: false, options: DEFAULT_OPTIONS, resolve: null });
    if (typeof resolver === "function") resolver(result);
  }

  const { title, message, confirmLabel, cancelLabel, variant } = state.options;

  return (
    <>
      {children}
      <Modal show={state.show} onHide={() => close(false)} centered backdrop="static" className="confirm-dialog-modal">
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0 confirm-dialog-message">{message}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => close(false)}>
            {cancelLabel}
          </Button>
          <Button variant={variant || "primary"} onClick={() => close(true)}>
            {confirmLabel}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
