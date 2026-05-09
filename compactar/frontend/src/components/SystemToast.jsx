import React from "react";
import { Toast, ToastContainer } from "react-bootstrap";

const AUTO_HIDE_DELAYS = {
  success: 3000,
  danger: 5000,
  error: 5000,
  warning: 5000,
  info: 3000,
};

function titleForVariant(variant) {
  if (variant === "success") return "Sucesso";
  if (variant === "danger" || variant === "error") return "Erro";
  if (variant === "warning") return "Atenção";
  return "Informação";
}

export default function SystemToast({ message, variant = "info", delay, onClose }) {
  if (!message) return null;
  const normalizedVariant = variant === "error" ? "danger" : variant;
  const autoHideDelay = delay || AUTO_HIDE_DELAYS[variant] || AUTO_HIDE_DELAYS[normalizedVariant] || 3000;

  return (
    <ToastContainer className="system-toast-container" position="top-end">
      <Toast
        show={Boolean(message)}
        onClose={onClose}
        autohide={Boolean(onClose)}
        delay={autoHideDelay}
        className={`system-toast system-toast-${normalizedVariant}`}
      >
        <Toast.Header closeButton={Boolean(onClose)}>
          <strong className="me-auto">{titleForVariant(normalizedVariant)}</strong>
          <small>{autoHideDelay / 1000}s</small>
        </Toast.Header>
        <Toast.Body>{message}</Toast.Body>
      </Toast>
    </ToastContainer>
  );
}
