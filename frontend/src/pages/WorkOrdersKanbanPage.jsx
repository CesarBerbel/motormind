import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import StatusBadge from "../components/StatusBadge";
import { kanbanWorkOrderStatuses, money, priorities } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";

const HIDDEN_KANBAN_STATUSES = new Set(["draft", "delivered", "rejected", "cancelled"]);
const VISUAL_KANBAN_STATUS = { waiting_parts: "awaiting_approval" };
const visualKanbanStatus = (status) => VISUAL_KANBAN_STATUS[status] || status;

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

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem previsão";
}

function workOrderSearchSuggestion(order) {
  const title = [order.number, order.customer_name].filter(Boolean).join(" - ") || "Ordem de serviço";
  const status = order.status_label || order.status || "Sem status";
  const priority = order.priority_label || order.priority || "Sem prioridade";
  const vehicle = order.vehicle_display || "Sem veículo";
  const orderTitle = order.title || "Sem título";
  const total = `Total: ${money(order.grand_total)}`;
  const balance = `Saldo: ${money(order.balance_due)}`;
  const promisedAt = `Previsão: ${formatDateTime(order.promised_at)}`;

  return {
    key: order.id,
    label: title,
    value: title,
    description: [vehicle, orderTitle, status, priority].filter(Boolean).join(" • "),
    meta: [promisedAt, total, balance, order.complaint].filter(Boolean).join(" • "),
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
      order.grand_total,
      order.balance_due,
      order.promised_at,
    ].filter(Boolean).join(" "),
  };
}

function buildWorkOrderSearchSuggestions(items) {
  return (items || []).map(workOrderSearchSuggestion);
}

export default function WorkOrdersKanbanPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visibleStatuses = useMemo(() => {
    if (!status) return kanbanWorkOrderStatuses;
    return kanbanWorkOrderStatuses.filter(([value]) => value === status);
  }, [status]);

  const groupedOrders = useMemo(() => {
    return visibleStatuses.reduce((acc, [currentStatus]) => {
      acc[currentStatus] = orders.filter((order) => visualKanbanStatus(order.status) === currentStatus);
      return acc;
    }, {});
  }, [orders, visibleStatuses]);

  async function load(nextSearch = search, nextStatus = status, nextPriority = priority) {
    const normalizedSearch = String(nextSearch || "").trim();
    const normalizedStatus = String(nextStatus || "").trim();
    const normalizedPriority = String(nextPriority || "").trim();

    setLoading(true);
    setError("");

    try {
      const params = {};
      if (normalizedSearch) params.search = normalizedSearch;
      if (normalizedStatus && normalizedStatus !== "awaiting_approval") params.status = normalizedStatus;
      if (normalizedPriority) params.priority = normalizedPriority;

      const data = await fetchAllWorkOrders(params);
      let visible = data.filter((order) => !HIDDEN_KANBAN_STATUSES.has(order.status));
      if (normalizedStatus) visible = visible.filter((order) => visualKanbanStatus(order.status) === normalizedStatus);
      setOrders(visible);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setSearch("");
    setStatus("");
    setPriority("");
    load("", "", "");
  }

  function selectWorkOrderSuggestion(suggestion, nextValue) {
    const selectedOrder = suggestion?.payload;
    setSearch(nextValue || "");

    if (selectedOrder?.id && !HIDDEN_KANBAN_STATUSES.has(selectedOrder.status)) {
      setOrders([selectedOrder]);
      if (selectedOrder.status) setStatus(visualKanbanStatus(selectedOrder.status));
      if (selectedOrder.priority) setPriority(selectedOrder.priority);
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

  useEffect(() => {
    load("", "", "");
  }, []);

  function onDragStart(event, orderId) {
    setDraggingId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(orderId));
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget("");
  }

  async function moveOrder(orderId, newStatus) {
    const order = orders.find((item) => String(item.id) === String(orderId));
    if (!order || order.status === newStatus) return;

    const allowed = order.available_status_transitions || [];
    if (!allowed.some((item) => item.status === newStatus)) {
      const allowedLabels = allowed.map((item) => item.status_label).join(", ") || "nenhuma etapa";
      setError(`${order.number} não pode ir de ${order.status_label || order.status} para esta coluna. Próximas etapas permitidas: ${allowedLabels}.`);
      setDropTarget("");
      return;
    }

    const previousOrders = orders;
    setSaving(true);
    setError("");
    setNotice("");
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: newStatus } : item));

    try {
      const response = await api.post(`/workshop/work-orders/${order.id}/change_status/`, {
        status: newStatus,
        note: "Status alterado pelo quadro Kanban.",
        send_notifications: true,
      });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...response.data.work_order } : item));
      setNotice(`${order.number} movida para ${kanbanWorkOrderStatuses.find(([value]) => value === newStatus)?.[1] || newStatus}.`);
    } catch (err) {
      setOrders(previousOrders);
      setError(apiError(err));
    } finally {
      setSaving(false);
      setDraggingId(null);
      setDropTarget("");
    }
  }

  function onDrop(event, currentStatus) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    if (orderId) moveOrder(orderId, currentStatus);
  }

  return <div className="kanban-page">
    <PageHeader title="Kanban de ordens de serviço" subtitle="Arraste a OS entre as colunas para alterar o status.">
      <Button as={Link} to="/work-orders/new" className="me-2">Nova OS</Button>
      <Button as={Link} to="/work-orders/agenda" variant="outline-primary" className="me-2">Agenda</Button>
      <Button as={Link} to="/work-orders" variant="outline-secondary">Lista</Button>
    </PageHeader>

    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")}/>
    <SystemToast message={notice} variant="success" delay={3000} onClose={() => setNotice("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col xl={5} lg={6}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput
              placeholder="Buscar por número, cliente, placa, título, relato, status ou prioridade"
              value={search}
              onChange={setSearch}
              onSearch={(value) => load(value, status, priority)}
              onSelect={selectWorkOrderSuggestion}
              suggestions={buildWorkOrderSearchSuggestions(orders)}
              disabled={loading || saving}
            />
          </Col>
          <Col xl={2} lg={3} sm={6}>
            <Form.Label>Status</Form.Label>
            <Form.Select value={status} onChange={(event) => handleStatusChange(event.target.value)} disabled={loading || saving}>
              <option value="">Todos</option>
              {kanbanWorkOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col xl={2} lg={3} sm={6}>
            <Form.Label>Prioridade</Form.Label>
            <Form.Select value={priority} onChange={(event) => handlePriorityChange(event.target.value)} disabled={loading || saving}>
              <option value="">Todas</option>
              {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col xl={3} className="d-flex gap-2">
            <Button className="w-100" variant="outline-primary" onClick={() => load(search, status, priority)} disabled={loading || saving}>
              {loading ? "Carregando..." : "Atualizar"}
            </Button>
            <Button className="w-100" variant="outline-secondary" onClick={clearSearch} disabled={loading || saving || (!search && !status && !priority)}>
              Limpar pesquisa
            </Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    {saving && <Alert variant="info" className="py-2">Salvando alteração de status...</Alert>}

    <div className="kanban-board">
      {visibleStatuses.map(([currentStatus, label]) => {
        const columnOrders = groupedOrders[currentStatus] || [];
        return <section
          key={currentStatus}
          className={`kanban-column ${dropTarget === currentStatus ? "kanban-column-target" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(currentStatus);
          }}
          onDragLeave={() => setDropTarget("")}
          onDrop={(event) => onDrop(event, currentStatus)}
        >
          <div className="kanban-column-header">
            <span>{currentStatus === "awaiting_approval" ? "Aguardando aprovação / peça" : label}</span>
            <Badge bg="secondary">{columnOrders.length}</Badge>
          </div>

          {loading ? <div className="text-center text-muted py-4"><Spinner size="sm"/> Carregando</div> : columnOrders.length === 0 ? <div className="kanban-empty">Sem OS nesta etapa</div> : columnOrders.map((order) => {
            const canDrag = Boolean(order.available_status_transitions?.length);
            return <Card
            key={order.id}
            className={`kanban-card ${String(draggingId) === String(order.id) ? "kanban-card-dragging" : ""} ${canDrag ? "" : "opacity-75"}`}
            draggable={canDrag}
            onDragStart={(event) => canDrag ? onDragStart(event, order.id) : event.preventDefault()}
            onDragEnd={onDragEnd}
          >
            <Card.Body>
              <div className="d-flex justify-content-between gap-2 mb-2">
                <Link to={`/work-orders/${order.id}`} className="fw-semibold text-decoration-none">{order.number}</Link>
                <StatusBadge value={order.priority} label={order.priority_label}/>
              </div>
              <div className="fw-semibold small mb-1">{order.title || "Sem título"}</div>
              <div className="small text-muted">{order.customer_name || "Cliente não informado"}</div>
              <div className="small text-muted">{order.vehicle_display || "Sem veículo"}</div>
              <div className="d-flex justify-content-between mt-2 small">
                <span>Previsão</span>
                <strong>{order.promised_at ? new Date(order.promised_at).toLocaleDateString() : "-"}</strong>
              </div>
              <div className="d-flex justify-content-between small">
                <span>Total</span>
                <strong>{money(order.grand_total)}</strong>
              </div>
              <div className="small text-muted mt-2">
                {canDrag ? `Próxima etapa: ${order.available_status_transitions.map((item) => item.status_label).join(" ou ")}` : "Sem transição disponível"}
              </div>
            </Card.Body>
          </Card>;})}
        </section>;
      })}
    </div>
  </div>;
}
