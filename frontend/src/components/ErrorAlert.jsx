import React from "react";
import SystemToast from "./SystemToast";

export default function ErrorAlert({ error, onClose }) {
  return <SystemToast message={error} variant="danger" delay={5000} onClose={onClose} />;
}
