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
import { buildSearchSuggestions } from "../utils/search";

export default function WorkOrdersPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (priority) params.priority = priority;
      setItems(results((await api.get("/workshop/work-orders/", { params })).data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status, priority]);

  return <>
    <PageHeader title="Ordens de serviço" subtitle="Entrada, diagnóstico, aprovação, execução, entrega e financeiro.">
      <Button as={Link} to="/work-orders/kanban" variant="outline-primary" className="me-2">Kanban</Button>
      <Button as={Link} to="/work-orders/new">Nova OS</Button>
    </PageHeader>
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2">
          <Col lg={6}><SearchAutocompleteInput placeholder="Buscar por número, cliente, placa ou descrição" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["number", "customer_name", "vehicle_display", "title", "complaint", "status_label"])} /></Col>
          <Col lg={2}>
            <Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Status</option>
              {workOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col lg={2}>
            <Form.Select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">Prioridade</option>
              {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col lg={2}><Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button></Col>
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
