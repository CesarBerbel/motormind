import React from "react";
import { Form } from "react-bootstrap";
import { maskBrazilPhone } from "../utils/phone";

export default function PhoneInputBR({
  id,
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  helpText = "Será salvo em padrão WhatsApp/E.164. Ex.: +5511999999999.",
  placeholder = "(11) 99999-9999",
  className = "",
}) {
  function handleChange(event) {
    onChange(maskBrazilPhone(event.target.value));
  }

  return (
    <Form.Group className={className}>
      {label ? <Form.Label htmlFor={id}>{label}</Form.Label> : null}
      <Form.Control
        id={id}
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={maskBrazilPhone(value)}
        onChange={handleChange}
        disabled={disabled}
        required={required}
      />
      {helpText ? <div className="small text-muted mt-1">{helpText}</div> : null}
    </Form.Group>
  );
}
