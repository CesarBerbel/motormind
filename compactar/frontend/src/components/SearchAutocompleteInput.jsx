import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Form } from "react-bootstrap";
import { normalizeSearchText } from "../utils/search";

function normalizeSuggestion(suggestion) {
  if (suggestion && typeof suggestion === "object") {
    const label = String(suggestion.label || suggestion.value || "").trim();
    const value = String(suggestion.value || label).trim();
    const description = String(suggestion.description || "").trim();
    const meta = String(suggestion.meta || "").trim();
    const searchText = String(suggestion.searchText || [label, value, description, meta].filter(Boolean).join(" ")).trim();

    return {
      key: suggestion.key || suggestion.id || searchText || value || label,
      label,
      value,
      description,
      meta,
      searchText,
      payload: suggestion.payload ?? suggestion.item ?? null,
    };
  }

  const text = String(suggestion || "").trim();
  return {
    key: text,
    label: text,
    value: text,
    description: "",
    meta: "",
    searchText: text,
  };
}

export default function SearchAutocompleteInput({
  id,
  value,
  onChange,
  onSearch,
  onSelect,
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
      const option = normalizeSuggestion(suggestion);
      const searchable = normalizeSearchText(option.searchText);
      const key = String(option.key || searchable).trim();
      if (!option.label || !searchable || seen.has(key)) return;
      if (term && !searchable.includes(term)) return;
      seen.add(key);
      unique.push(option);
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

  function runSearch(nextValue) {
    setOpen(false);
    onSearch?.(String(nextValue || "").trim());
  }

  function selectSuggestion(suggestion) {
    const nextValue = suggestion.value || suggestion.label || "";
    onChange(nextValue);
    setOpen(false);

    if (onSelect) {
      onSelect(suggestion, nextValue);
      return;
    }

    runSearch(nextValue);
  }

  const menu = open && filteredSuggestions.length > 0 && menuStyle ? (
    <div className="autocomplete-menu autocomplete-menu-portal shadow-lg" style={menuStyle}>
      {filteredSuggestions.map((suggestion) => (
        <button
          key={suggestion.key}
          type="button"
          className="autocomplete-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectSuggestion(suggestion)}
        >
          <span className="autocomplete-item-main">{suggestion.label}</span>
          {suggestion.description ? <span className="autocomplete-item-description">{suggestion.description}</span> : null}
          {suggestion.meta ? <span className="autocomplete-item-meta">{suggestion.meta}</span> : null}
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
            runSearch(event.currentTarget.value);
          }
        }}
        autoComplete="off"
      />

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
