import React from "react";
import { Form } from "react-bootstrap";
import { formatMoneyInput, parseMoneyInput } from "../workshopOptions";

export default function MoneyInput({ value, onChange, ...props }) {
  function handleChange(event) {
    onChange(parseMoneyInput(event.target.value));
  }

  return (
    <Form.Control
      {...props}
      type="text"
      inputMode="decimal"
      value={formatMoneyInput(value)}
      onChange={handleChange}
      onFocus={(event) => event.target.select()}
    />
  );
}
