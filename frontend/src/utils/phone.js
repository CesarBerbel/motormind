export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function localBrazilPhoneDigits(value) {
  const compact = String(value || "").trim().replace(/\s+/g, "");
  if (compact.startsWith("+") && !compact.startsWith("+55")) return onlyDigits(compact).slice(0, 15);
  let digits = onlyDigits(value);
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

export function maskBrazilPhone(value) {
  const compact = String(value || "").trim().replace(/\s+/g, "");
  if (compact.startsWith("+") && !compact.startsWith("+55")) return compact;
  const digits = localBrazilPhoneDigits(value);
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);

  if (!ddd) return "";
  if (digits.length <= 2) return `(${ddd}`;
  if (number.length <= 4) return `(${ddd}) ${number}`;
  if (number.length <= 8) return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5, 9)}`;
}

export function normalizeBrazilPhoneToE164(value) {
  const compact = String(value || "").trim().replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.startsWith("+") && !compact.startsWith("+55")) return compact;

  let digits = onlyDigits(compact);
  if (!digits) return "";

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  digits = digits.slice(0, 11);
  return `+55${digits}`;
}

export function isCompleteBrazilPhone(value) {
  const digits = localBrazilPhoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}
