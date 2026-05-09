import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { money, priorities, workOrderStatuses } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";

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

export default function WorkOrdersPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState("");

  async function load(nextSearch = search, nextStatus = status, nextPriority = priority) {
    const normalizedSearch = String(nextSearch || "").trim();
    const normalizedStatus = String(nextStatus || "").trim();
    const normalizedPriority = String(nextPriority || "").trim();

    try {
      const params = {};
      if (normalizedSearch) params.search = normalizedSearch;
      if (normalizedStatus) params.status = normalizedStatus;
      if (normalizedPriority) params.priority = normalizedPriority;
      setItems(results((await api.get("/workshop/work-orders/", { params })).data));
    } catch (err) {
      setError(apiError(err));
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

    if (selectedOrder?.id) {
      setItems([selectedOrder]);
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

  useEffect(() => { load(); }, []);

  return <>
    <PageHeader title="Ordens de serviço" subtitle="Entrada, diagnóstico, aprovação, execução, entrega e financeiro.">
      <Button as={Link} to="/work-orders/agenda" variant="outline-primary" className="me-2">Agenda</Button>
      <Button as={Link} to="/work-orders/kanban" variant="outline-primary" className="me-2">Kanban</Button>
      <Button as={Link} to="/work-orders/new">Nova OS</Button>
    </PageHeader>
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col lg={6}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput
              placeholder="Buscar por número, cliente, placa, título, relato, status ou prioridade"
              value={search}
              onChange={setSearch}
              onSearch={(value) => load(value, status, priority)}
              onSelect={selectWorkOrderSuggestion}
              suggestions={buildWorkOrderSearchSuggestions(items)}
            />
          </Col>
          <Col lg={2}>
            <Form.Label>Status</Form.Label>
            <Form.Select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
              <option value="">Todos</option>
              {workOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col lg={2}>
            <Form.Label>Prioridade</Form.Label>
            <Form.Select value={priority} onChange={(event) => handlePriorityChange(event.target.value)}>
              <option value="">Todas</option>
              {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col lg={2}><Button className="w-100" variant="outline-secondary" onClick={clearSearch} disabled={!search && !status && !priority}>Limpar pesquisa</Button></Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0">
          <thead>
            <tr><th>Número</th><th>Cliente</th><th>Veículo</th><th>Título</th><th>Status</th><th>Prioridade</th><th>Previsão</th><th>Total</th><th>Saldo</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((order) => <tr key={order.id}>
              <td className="fw-semibold">{order.number}</td>
              <td>{order.customer_name}</td>
              <td>{order.vehicle_display || "-"}</td>
              <td>{order.title || "-"}</td>
              <td><StatusBadge value={order.status} label={order.status_label} /></td>
              <td><StatusBadge value={order.priority} label={order.priority_label} /></td>
              <td>{order.promised_at ? new Date(order.promised_at).toLocaleString("pt-BR") : "-"}</td>
              <td>{money(order.grand_total)}</td>
              <td>{money(order.balance_due)}</td>
              <td><Button size="sm" as={Link} to={`/work-orders/${order.id}`} variant="outline-primary">Abrir</Button></td>
            </tr>)}
          </tbody>
        </Table>}
      </Card.Body>
    </Card>
  </>;
}
