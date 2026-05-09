export const workOrderStatuses = [["draft", "Rascunho"], ["open", "Aberta"], ["diagnosis", "Diagnóstico"], ["awaiting_approval", "Aguardando aprovação"], ["approved", "Aprovada"], ["in_progress", "Em execução"], ["quality_check", "Conferência"], ["ready", "Pronta para entrega"], ["delivered", "Entregue"], ["cancelled", "Cancelada"]];
export const kanbanWorkOrderStatuses = workOrderStatuses.filter(([value]) => !["draft", "delivered", "cancelled"].includes(value));
export const priorities = [["low", "Baixa"], ["normal", "Normal"], ["high", "Alta"], ["urgent", "Urgente"]];
export const workOrderTypes = [["standard", "Normal"], ["return", "Retorno"], ["warranty", "Garantia"]];
export const paymentMethods = [["cash", "Dinheiro"], ["card", "Cartão"], ["bank_transfer", "Transferência"], ["mbway", "MB Way"], ["pix", "Pix"], ["other", "Outro"]];
export const categoryTypes = [["general", "Geral"], ["service", "Serviço"], ["part", "Peça / estoque"], ["vehicle", "Veículo"], ["work_order", "Ordem de serviço"]];
export const receivableStatuses = [["open", "Aberta"], ["partial", "Parcial"], ["paid", "Paga"], ["overdue", "Vencida"], ["cancelled", "Cancelada"]];
export const purchaseOrderStatuses = [["draft", "Rascunho"], ["requested", "Solicitado"], ["approved", "Aprovado"], ["ordered", "Pedido enviado"], ["partially_received", "Recebido parcial"], ["received", "Recebido"], ["cancelled", "Cancelado"]];
export const payableStatuses = [["open", "Aberta"], ["partial", "Parcial"], ["paid", "Paga"], ["overdue", "Vencida"], ["cancelled", "Cancelada"]];
export const payableRecurrenceTypes = [["cash", "À vista"], ["installment", "Parcelada"], ["fixed_monthly", "Fixa mensal"]];
export const counterSaleStatuses = [["draft", "Rascunho"], ["finalized", "Finalizada"], ["cancelled", "Cancelada"]];
export const estimateStatuses = [["draft", "Rascunho"], ["sent", "Enviado ao cliente"], ["approved", "Aprovado"], ["rejected", "Rejeitado"], ["expired", "Expirado"], ["converted", "Convertido em OS"], ["cancelled", "Cancelado"]];
export const payablePaymentMethods = [["cash", "Dinheiro"], ["pix", "PIX"], ["bank_transfer", "Transferência bancária"], ["debit_card", "Cartão de débito"], ["credit_card", "Cartão de crédito"], ["boleto", "Boleto"], ["other", "Outro"]];

export function decimalNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value) {
  return decimalNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatMoneyInput(value) {
  if (value === "" || value === null || value === undefined) return "";
  return money(value);
}

export function parseMoneyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

export function datetimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value) {
  return value ? new Date(value).toISOString() : null;
}

export function todayDatetimeLocalValue() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function formatDate(value) {
  if (!value) return "-";
  const source = String(value);
  const date = source.includes("T") ? new Date(source) : new Date(`${source}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function maskCpfCnpj(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskCep(value) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}


export const partUnitOptions = [
  ["un", "Unidade"],
  ["pc", "Peça"],
  ["kit", "Kit"],
  ["par", "Par"],
  ["jogo", "Jogo"],
  ["cx", "Caixa"],
  ["pct", "Pacote"],
  ["m", "Metro"],
  ["cm", "Centímetro"],
  ["l", "Litro"],
  ["ml", "Mililitro"],
  ["kg", "Quilograma"],
  ["g", "Grama"],
];

export function normalizePartUnit(value) {
  const aliases = {
    "": "un",
    und: "un",
    unid: "un",
    unidade: "un",
    unidades: "un",
    unit: "un",
    units: "un",
    peca: "pc",
    pecas: "pc",
    peça: "pc",
    peças: "pc",
    pcs: "pc",
    "pç": "pc",
    "pçs": "pc",
    caixa: "cx",
    caixas: "cx",
    pacote: "pct",
    pacotes: "pct",
    quilo: "kg",
    quilograma: "kg",
    quilogramas: "kg",
    metro: "m",
    metros: "m",
    centimetro: "cm",
    centimetros: "cm",
    centímetros: "cm",
    litro: "l",
    litros: "l",
  };
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const mapped = aliases[normalized] || normalized || "un";
  return partUnitOptions.some(([unit]) => unit === mapped) ? mapped : "un";
}
