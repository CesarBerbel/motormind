import React, { useState } from "react";
import { Form, Spinner } from "react-bootstrap";

export default function AutocompleteInput({
  id,
  label,
  value,
  onChange,
  options = [],
  onSearch,
  placeholder = "Digite para pesquisar",
  loading = false,
  helpText = "",
  emptyMessage = "Nenhuma sugestão encontrada.",
  required = false,
}) {
  const [open, setOpen] = useState(false);

  function handleInputChange(event) {
    const nextValue = event.target.value;
    onChange(nextValue);
    onSearch?.(nextValue);
    setOpen(true);
  }

  function selectOption(option) {
    onChange(option.name || option.label || "");
    setOpen(false);
  }

  return (
    <Form.Group className="autocomplete-box">
      {label ? <Form.Label htmlFor={id}>{label}</Form.Label> : null}
      <div className="position-relative">
        <Form.Control
          id={id}
          required={required}
          value={value || ""}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            onSearch?.(value || "");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onChange={handleInputChange}
          autoComplete="off"
        />
        {loading ? <Spinner animation="border" size="sm" className="autocomplete-spinner" /> : null}
      </div>
      {helpText ? <div className="form-text">{helpText}</div> : null}
      {open ? (
        <div className="autocomplete-menu shadow-sm">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-muted small">{loading ? "Carregando sugestões..." : emptyMessage}</div>
          ) : (
            options.map((option) => (
              <button
                key={option.id || option.normalized_name || option.name || option.label}
                type="button"
                className="autocomplete-item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {option.name || option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </Form.Group>
  );
}
