export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function compactSearchOptions(values, limit = 80) {
  const seen = new Set();
  const output = [];

  values.flat().forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = normalizeSearchText(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(text);
  });

  return output.slice(0, limit);
}

export function buildSearchSuggestions(items, fields, limit = 80) {
  const values = [];

  (items || []).forEach((item) => {
    fields.forEach((field) => {
      if (typeof field === "function") {
        values.push(field(item));
        return;
      }
      values.push(item?.[field]);
    });
  });

  return compactSearchOptions(values, limit);
}
