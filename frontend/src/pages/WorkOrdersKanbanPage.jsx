import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import StatusBadge from "../components/StatusBadge";
import { kanbanWorkOrderStatuses, money } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";

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

export default function WorkOrdersKanbanPage() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const groupedOrders = useMemo(() => {
    return kanbanWorkOrderStatuses.reduce((acc, [status]) => {
      acc[status] = orders.filter((order) => order.status === status);
      return acc;
    }, {});
  }, [orders]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllWorkOrders(search ? { search } : {});
      setOrders(data.filter((order) => !["draft", "delivered", "cancelled"].includes(order.status)));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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

  function onDrop(event, status) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    if (orderId) moveOrder(orderId, status);
  }

  return <>
    <PageHeader title="Kanban de ordens de serviço" subtitle="Arraste a OS entre as colunas para alterar o status.">
      <Button as={Link} to="/work-orders/new" className="me-2">Nova OS</Button>
      <Button as={Link} to="/work-orders" variant="outline-secondary">Lista</Button>
    </PageHeader>

    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")}/>
    <SystemToast message={notice} variant="success" delay={3000} onClose={() => setNotice("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-center">
          <Col md={9}>
            <SearchAutocompleteInput placeholder="Buscar por número, cliente, veículo ou relato" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(orders, ["number", "customer_name", "vehicle_display", "title", "complaint", "status_label"])} />
          </Col>
          <Col md={3}>
            <Button className="w-100" variant="outline-primary" onClick={load} disabled={loading || saving}>
              {loading ? "Carregando..." : "Buscar / atualizar"}
            </Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    {saving && <Alert variant="info" className="py-2">Salvando alteração de status...</Alert>}

    <div className="kanban-board">
      {kanbanWorkOrderStatuses.map(([status, label]) => {
        const columnOrders = groupedOrders[status] || [];
        return <section
          key={status}
          className={`kanban-column ${dropTarget === status ? "kanban-column-target" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(status);
          }}
          onDragLeave={() => setDropTarget("")}
          onDrop={(event) => onDrop(event, status)}
        >
          <div className="kanban-column-header">
            <span>{label}</span>
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
  </>;
}
