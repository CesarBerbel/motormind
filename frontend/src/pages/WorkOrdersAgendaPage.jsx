import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, ButtonGroup, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import StatusBadge from "../components/StatusBadge";
import { money, priorities, workOrderStatuses } from "../workshopOptions";

const FINAL_STATUSES = new Set(["delivered", "rejected", "cancelled"]);
const VIEW_MODES = [
  ["day", "Dia"],
  ["week", "Semana"],
  ["month", "M\u00eas"],
];
const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "S\u00e1b", "Dom"];

async function fetchAllWorkOrders(params = {}) {
  const all = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const response = await api.get("/workshop/work-orders/", { params: { ...params, page } });
    all.push(...results(response.data));
    hasNext = Boolean(response.data?.next);
    page += 1;
  }

  return all;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function cloneDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(value) {
  const date = parseDate(value);
  if (!date) return "without-date";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = cloneDate(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = cloneDate(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfWeek(date) {
  const base = cloneDate(date);
  const day = base.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + offset);
  return base;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateHeading(key) {
  if (key === "without-date") return "Sem previs\u00e3o de entrega";
  const date = new Date(`${key}T00:00:00`);
  const today = dateOnly(new Date());
  const target = dateOnly(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

  if (diffDays === 0) return `Hoje \u2022 ${label}`;
  if (diffDays === 1) return `Amanh\u00e3 \u2022 ${label}`;
  if (diffDays === -1) return `Ontem \u2022 ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatMonthYear(date) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "Sem previs\u00e3o";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function isSameDate(a, b) {
  return dateOnly(a).getTime() === dateOnly(b).getTime();
}

function isOverdue(order) {
  const promisedAt = parseDate(order.promised_at);
  if (!promisedAt || FINAL_STATUSES.has(order.status)) return false;
  return promisedAt.getTime() < Date.now();
}

function isToday(order) {
  const promisedAt = parseDate(order.promised_at);
  if (!promisedAt) return false;
  return isSameDate(promisedAt, new Date());
}

function buildAgendaSuggestion(order) {
  const title = [order.number, order.customer_name].filter(Boolean).join(" - ") || "Ordem de servi\u00e7o";
  const vehicle = order.vehicle_display || "Sem ve\u00edculo";
  const status = order.status_label || order.status || "Sem status";
  const priority = order.priority_label || order.priority || "Sem prioridade";
  const promisedAt = `Previs\u00e3o: ${formatDateTime(order.promised_at)}`;

  return {
    key: order.id,
    label: title,
    value: title,
    description: [vehicle, order.title || "Sem t\u00edtulo", status, priority].filter(Boolean).join(" \u2022 "),
    meta: [promisedAt, `Total: ${money(order.grand_total)}`, `Saldo: ${money(order.balance_due)}`].join(" \u2022 "),
    payload: order,
    searchText: [
      order.number,
      order.customer_name,
      order.vehicle_display,
      order.title,
      order.complaint,
      order.status,
      order.status_label,
      order.priority,
      order.priority_label,
      order.promised_at,
    ].filter(Boolean).join(" "),
  };
}

function sortOrdersByPromisedAt(a, b) {
  const aDate = parseDate(a.promised_at);
  const bDate = parseDate(b.promised_at);
  if (!aDate && !bDate) return String(a.number || "").localeCompare(String(b.number || ""));
  if (!aDate) return 1;
  if (!bDate) return -1;
  return aDate.getTime() - bDate.getTime();
}

function buildPeriodDays(viewMode, referenceDate) {
  if (viewMode === "week") {
    const first = startOfWeek(referenceDate);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }
  return [cloneDate(referenceDate)];
}

function buildMonthCells(referenceDate) {
  const first = startOfMonth(referenceDate);
  const lastExclusive = endOfMonth(referenceDate);
  const leadingBlanks = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: leadingBlanks }, () => null);
  for (let day = cloneDate(first); day < lastExclusive; day = addDays(day, 1)) {
    cells.push(cloneDate(day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getPeriodLabel(viewMode, referenceDate) {
  if (viewMode === "month") return formatMonthYear(referenceDate);
  if (viewMode === "week") {
    const first = startOfWeek(referenceDate);
    const last = addDays(first, 6);
    return `${formatShortDate(first)} a ${formatShortDate(last)}`;
  }
  const label = formatLongDate(referenceDate);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getPeriodStep(viewMode) {
  if (viewMode === "month") return "month";
  if (viewMode === "week") return "week";
  return "day";
}

function orderCard(order) {
  const overdue = isOverdue(order);
  return <Card key={order.id} className={`agenda-order-card border-0 shadow-sm ${overdue ? "agenda-order-overdue" : ""}`}>
    <Card.Body>
      <div className="d-flex flex-wrap justify-content-between gap-3">
        <div className="min-width-0">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <Link to={`/work-orders/${order.id}`} className="fw-semibold text-decoration-none">{order.number}</Link>
            {overdue ? <Badge bg="danger">Atrasada</Badge> : null}
            <StatusBadge value={order.status} label={order.status_label} />
            <StatusBadge value={order.priority} label={order.priority_label} />
          </div>
          <div className="fw-semibold text-truncate">{order.title || "Sem t\u00edtulo"}</div>
          <div className="text-muted small">{order.customer_name || "Cliente n\u00e3o informado"}</div>
          <div className="text-muted small">{order.vehicle_display || "Sem ve\u00edculo"}</div>
        </div>
        <div className="agenda-order-meta text-lg-end">
          <div className="small text-muted">Previs\u00e3o</div>
          <div className="fw-semibold">{order.promised_at ? formatTime(order.promised_at) : "Sem hor\u00e1rio"}</div>
          <div className="small text-muted mt-2">Total / saldo</div>
          <div className="fw-semibold">{money(order.grand_total)} / {money(order.balance_due)}</div>
        </div>
      </div>
      {order.complaint ? <div className="agenda-order-complaint small text-muted mt-3">{order.complaint}</div> : null}
    </Card.Body>
  </Card>;
}

export default function WorkOrdersAgendaPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [viewMode, setViewMode] = useState("week");
  const [referenceDate, setReferenceDate] = useState(() => dateOnly(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextSearch = search, nextStatus = status, nextPriority = priority) {
    setLoading(true);
    setError("");
    try {
      const params = {};
      const normalizedSearch = String(nextSearch || "").trim();
      if (normalizedSearch) params.search = normalizedSearch;
      if (nextStatus) params.status = nextStatus;
      if (nextPriority) params.priority = nextPriority;
      const data = await fetchAllWorkOrders(params);
      setOrders(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => includeFinished || !FINAL_STATUSES.has(order.status))
      .filter((order) => !overdueOnly || isOverdue(order))
      .sort(sortOrdersByPromisedAt);
  }, [orders, includeFinished, overdueOnly]);

  const ordersWithDate = useMemo(() => filteredOrders.filter((order) => Boolean(order.promised_at)), [filteredOrders]);

  const ordersByDate = useMemo(() => {
    const map = new Map();
    ordersWithDate.forEach((order) => {
      const key = dateKey(order.promised_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(order);
    });
    return map;
  }, [ordersWithDate]);

  const periodDays = useMemo(() => buildPeriodDays(viewMode, referenceDate), [viewMode, referenceDate]);
  const monthCells = useMemo(() => buildMonthCells(referenceDate), [referenceDate]);
  const periodLabel = useMemo(() => getPeriodLabel(viewMode, referenceDate), [viewMode, referenceDate]);

  const periodOrderCount = useMemo(() => {
    if (viewMode === "month") {
      const month = referenceDate.getMonth();
      const year = referenceDate.getFullYear();
      return ordersWithDate.filter((order) => {
        const promisedAt = parseDate(order.promised_at);
        return promisedAt && promisedAt.getMonth() === month && promisedAt.getFullYear() === year;
      }).length;
    }

    return periodDays.reduce((total, day) => total + (ordersByDate.get(formatDateInput(day))?.length || 0), 0);
  }, [ordersByDate, ordersWithDate, periodDays, referenceDate, viewMode]);

  const summary = useMemo(() => {
    const activeOrders = orders.filter((order) => !FINAL_STATUSES.has(order.status));
    const scheduled = activeOrders.filter((order) => Boolean(order.promised_at));
    return {
      active: activeOrders.length,
      scheduled: scheduled.length,
      overdue: activeOrders.filter(isOverdue).length,
      today: scheduled.filter(isToday).length,
      withoutDate: activeOrders.filter((order) => !order.promised_at).length,
    };
  }, [orders]);

  function clearSearch() {
    setSearch("");
    setStatus("");
    setPriority("");
    setOverdueOnly(false);
    setIncludeFinished(false);
    load("", "", "");
  }

  function selectSuggestion(suggestion, nextValue) {
    const selectedOrder = suggestion?.payload;
    setSearch(nextValue || "");
    if (selectedOrder?.id) {
      setOrders([selectedOrder]);
      const promisedAt = parseDate(selectedOrder.promised_at);
      if (promisedAt) setReferenceDate(dateOnly(promisedAt));
      return;
    }
    load(nextValue, status, priority);
  }

  function handleStatusChange(value) {
    setStatus(value);
    load(search, value, priority);
  }

  function handlePriorityChange(value) {
    setPriority(value);
    load(search, status, value);
  }

  function movePeriod(direction) {
    const step = getPeriodStep(viewMode);
    if (step === "month") {
      setReferenceDate((current) => addMonths(current, direction));
      return;
    }
    setReferenceDate((current) => addDays(current, step === "week" ? direction * 7 : direction));
  }

  function renderDaySection(day) {
    const key = formatDateInput(day);
    const items = ordersByDate.get(key) || [];
    const overdueCount = items.filter(isOverdue).length;
    return <section key={key} className={`agenda-day ${overdueCount ? "agenda-day-overdue" : ""}`}>
      <div className="agenda-day-header">
        <div>
          <h5 className="mb-1">{formatDateHeading(key)}</h5>
          <div className="text-muted small">{items.length} OS prevista(s){overdueCount ? ` \u2022 ${overdueCount} atrasada(s)` : ""}</div>
        </div>
        <Badge bg={overdueCount ? "danger" : "secondary"}>{items.length}</Badge>
      </div>

      {items.length ? <div className="agenda-order-list">{items.map(orderCard)}</div> : <Card className="border-0 shadow-sm agenda-empty-day"><Card.Body className="text-muted small">Nenhuma OS prevista para este dia.</Card.Body></Card>}
    </section>;
  }

  function renderMonthView() {
    return <Card className="border-0 shadow-sm">
      <Card.Body>
        <div className="agenda-month-grid agenda-month-weekdays mb-2">
          {WEEKDAY_LABELS.map((label) => <div key={label} className="agenda-month-weekday">{label}</div>)}
        </div>
        <div className="agenda-month-grid">
          {monthCells.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} className="agenda-month-cell agenda-month-cell-empty" />;
            const key = formatDateInput(date);
            const count = ordersByDate.get(key)?.length || 0;
            const overdueCount = ordersByDate.get(key)?.filter(isOverdue).length || 0;
            const today = isSameDate(date, new Date());
            return <button
              key={key}
              type="button"
              className={`agenda-month-cell ${count ? "agenda-month-cell-has-orders" : ""} ${today ? "agenda-month-cell-today" : ""}`}
              onClick={() => {
                if (!count) return;
                setReferenceDate(dateOnly(date));
                setViewMode("day");
              }}
              disabled={!count}
              title={count ? `${count} OS prevista(s)` : "Sem OS prevista"}
            >
              <span className="agenda-month-day-number">{date.getDate()}</span>
              <span className={`agenda-month-count ${overdueCount ? "agenda-month-count-overdue" : ""}`}>{count} OS</span>
            </button>;
          })}
        </div>
        <div className="text-muted small mt-3">Na vis\u00e3o mensal, cada dia mostra apenas a quantidade de OS prevista. Clique em um dia com OS para abrir a vis\u00e3o di\u00e1ria.</div>
      </Card.Body>
    </Card>;
  }

  const showEmptyPeriod = !loading && periodOrderCount === 0;

  return <>
    <PageHeader title="Agenda de ordens de servi\u00e7o" subtitle="Visualize as OS por dia, semana ou m\u00eas conforme a data de previs\u00e3o de entrega.">
      <Button as={Link} to="/work-orders" variant="outline-secondary" className="me-2">Lista</Button>
      <Button as={Link} to="/work-orders/kanban" variant="outline-primary" className="me-2">Kanban</Button>
      <Button as={Link} to="/work-orders/new">Nova OS</Button>
    </PageHeader>
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Row className="g-3 mb-3">
      <Col sm={6} xl={3}>
        <Card className="border-0 shadow-sm h-100"><Card.Body><div className="text-muted small">OS ativas</div><div className="fs-3 fw-semibold">{summary.active}</div></Card.Body></Card>
      </Col>
      <Col sm={6} xl={3}>
        <Card className="border-0 shadow-sm h-100"><Card.Body><div className="text-muted small">Com previs\u00e3o</div><div className="fs-3 fw-semibold">{summary.scheduled}</div></Card.Body></Card>
      </Col>
      <Col sm={6} xl={3}>
        <Card className="border-0 shadow-sm h-100"><Card.Body><div className="text-muted small">Atrasadas</div><div className="fs-3 fw-semibold text-danger">{summary.overdue}</div></Card.Body></Card>
      </Col>
      <Col sm={6} xl={3}>
        <Card className="border-0 shadow-sm h-100"><Card.Body><div className="text-muted small">Previs\u00e3o para hoje</div><div className="fs-3 fw-semibold">{summary.today}</div><div className="small text-muted">Sem previs\u00e3o: {summary.withoutDate}</div></Card.Body></Card>
      </Col>
    </Row>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col xl={4} lg={6}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput
              placeholder="Buscar por n\u00famero, cliente, placa, t\u00edtulo, relato, status ou prioridade"
              value={search}
              onChange={setSearch}
              onSearch={(value) => load(value, status, priority)}
              onSelect={selectSuggestion}
              suggestions={filteredOrders.map(buildAgendaSuggestion)}
            />
          </Col>
          <Col xl={2} lg={3} sm={6}>
            <Form.Label>Status</Form.Label>
            <Form.Select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
              <option value="">Todos</option>
              {workOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col xl={2} lg={3} sm={6}>
            <Form.Label>Prioridade</Form.Label>
            <Form.Select value={priority} onChange={(event) => handlePriorityChange(event.target.value)}>
              <option value="">Todas</option>
              {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col xl={4}>
            <div className="d-flex flex-wrap gap-3 align-items-center justify-content-xl-end">
              <Form.Check
                type="switch"
                id="agenda-overdue-only"
                label="Somente atrasadas"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              <Form.Check
                type="switch"
                id="agenda-include-finished"
                label="Incluir entregues/canceladas"
                checked={includeFinished}
                onChange={(event) => setIncludeFinished(event.target.checked)}
              />
              <Button variant="outline-secondary" onClick={clearSearch} disabled={!search && !status && !priority && !overdueOnly && !includeFinished}>Limpar pesquisa</Button>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-center">
          <Col lg={4}>
            <ButtonGroup className="agenda-view-toggle" aria-label="Tipo de vis\u00e3o da agenda">
              {VIEW_MODES.map(([value, label]) => <Button key={value} variant={viewMode === value ? "primary" : "outline-primary"} onClick={() => setViewMode(value)}>{label}</Button>)}
            </ButtonGroup>
          </Col>
          <Col lg={4} className="text-lg-center">
            <div className="fw-semibold fs-5">{periodLabel}</div>
            <div className="text-muted small">{periodOrderCount} OS prevista(s) no per\u00edodo</div>
          </Col>
          <Col lg={4}>
            <div className="d-flex flex-wrap gap-2 justify-content-lg-end">
              <Button variant="outline-secondary" onClick={() => movePeriod(-1)}>Anterior</Button>
              <Button variant="outline-secondary" onClick={() => setReferenceDate(dateOnly(new Date()))}>Hoje</Button>
              <Button variant="outline-secondary" onClick={() => movePeriod(1)}>Pr\u00f3ximo</Button>
              <Form.Control
                type="date"
                value={formatDateInput(referenceDate)}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setReferenceDate(new Date(`${event.target.value}T00:00:00`));
                }}
                className="agenda-date-picker"
              />
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    {loading ? <Card className="border-0 shadow-sm"><Card.Body className="text-center text-muted py-5"><Spinner size="sm" className="me-2" />Carregando agenda...</Card.Body></Card> : null}

    {showEmptyPeriod ? <Card className="border-0 shadow-sm mb-3"><Card.Body><EmptyState title="Nenhuma OS encontrada" description="N\u00e3o h\u00e1 ordens de servi\u00e7o previstas para o per\u00edodo e filtros selecionados." /></Card.Body></Card> : null}

    {!loading && viewMode === "month" ? renderMonthView() : null}

    {!loading && viewMode !== "month" ? <div className={`agenda-timeline agenda-timeline-${viewMode}`}>
      {periodDays.map(renderDaySection)}
    </div> : null}
  </>;
}
