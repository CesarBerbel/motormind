import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Form } from "react-bootstrap";
import { normalizeSearchText } from "../utils/search";

export default function SearchAutocompleteInput({
  id,
  value,
  onChange,
  onSearch,
  suggestions = [],
  placeholder = "Buscar",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const controlRef = useRef(null);

  const filteredSuggestions = useMemo(() => {
    const term = normalizeSearchText(value);
    const unique = [];
    const seen = new Set();

    suggestions.forEach((suggestion) => {
      const text = String(suggestion || "").trim();
      const key = normalizeSearchText(text);
      if (!text || seen.has(key)) return;
      if (term && !key.includes(term)) return;
      seen.add(key);
      unique.push(text);
    });

    return unique.slice(0, 10);
  }, [suggestions, value]);

  const updateMenuPosition = useCallback(() => {
    if (!controlRef.current) return;
    const rect = controlRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(140, openUp ? spaceAbove : spaceBelow));

    setMenuStyle({
      position: "fixed",
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    return undefined;
  }, [open, updateMenuPosition, filteredSuggestions.length]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  function selectSuggestion(suggestion) {
    onChange(suggestion);
    setOpen(false);
  }

  const menu = open && filteredSuggestions.length > 0 && menuStyle ? (
    <div className="autocomplete-menu autocomplete-menu-portal shadow-lg" style={menuStyle}>
      {filteredSuggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="autocomplete-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`autocomplete-box ${className}`.trim()}>
      <Form.Control
        ref={controlRef}
        id={id}
        placeholder={placeholder}
        value={value || ""}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 140)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setOpen(false);
            onSearch?.(value || "");
          }
        }}
        autoComplete="off"
      />

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
