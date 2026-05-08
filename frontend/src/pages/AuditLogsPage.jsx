import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";

const actionOptions = [
  ["", "Todas as ações"],
  ["create", "Criação"],
  ["update", "Alteração"],
  ["delete", "Exclusão"],
  ["status_change", "Alteração de status"],
  ["login", "Login"],
  ["logout", "Logout"],
  ["permission", "Permissão"],
  ["system", "Sistema"],
];

function actionVariant(action) {
  if (action === "create") return "success";
  if (action === "delete") return "danger";
  if (action === "update" || action === "status_change") return "warning";
  return "secondary";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function userName(user) {
  if (!user) return "Sistema";
  return user.full_name || user.username || user.email || `Usuário #${user.id}`;
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState({ search: "", action: "", app_label: "", model_name: "", date_from: "", date_to: "" });
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadLogs(nextFilters = filters) {
    setError("");
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value));
      const { data } = await api.get("/accounts/audit-logs/", { params: { ...params, ordering: "-created_at" } });
      setLogs(results(data));
      setCount(data?.count ?? results(data).length);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    loadLogs();
  }

  function clearFilters() {
    const empty = { search: "", action: "", app_label: "", model_name: "", date_from: "", date_to: "" };
    setFilters(empty);
    loadLogs(empty);
  }

  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Consulta de ações relevantes executadas no sistema." />
      <ErrorAlert error={error} onClose={() => setError("")} />

      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Form onSubmit={submit}>
            <Row className="g-3 align-items-end">
              <Col md={4}>
                <Form.Label>Buscar</Form.Label>
                <Form.Control value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} placeholder="Usuário, objeto, descrição, módulo..." />
              </Col>
              <Col md={2}>
                <Form.Label>Ação</Form.Label>
                <Form.Select value={filters.action} onChange={(e) => updateFilter("action", e.target.value)}>
                  {actionOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Label>App</Form.Label>
                <Form.Control value={filters.app_label} onChange={(e) => updateFilter("app_label", e.target.value)} placeholder="workshop" />
              </Col>
              <Col md={2}>
                <Form.Label>Modelo</Form.Label>
                <Form.Control value={filters.model_name} onChange={(e) => updateFilter("model_name", e.target.value)} placeholder="WorkOrder" />
              </Col>
              <Col md={2} className="d-flex gap-2">
                <Button type="submit" disabled={loading}>{loading ? "Buscando..." : "Filtrar"}</Button>
                <Button type="button" variant="outline-secondary" onClick={clearFilters}>Limpar</Button>
              </Col>
              <Col md={2}>
                <Form.Label>De</Form.Label>
                <Form.Control type="date" value={filters.date_from} onChange={(e) => updateFilter("date_from", e.target.value)} />
              </Col>
              <Col md={2}>
                <Form.Label>Até</Form.Label>
                <Form.Control type="date" value={filters.date_to} onChange={(e) => updateFilter("date_to", e.target.value)} />
              </Col>
              <Col md={8} className="text-muted small">
                {count} registro(s) encontrado(s). A auditoria ajuda a rastrear alterações de dados sensíveis, principalmente financeiro, estoque, OS e configurações.
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ação</th>
                  <th>Usuário</th>
                  <th>Objeto</th>
                  <th>Descrição</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan="6" className="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-nowrap">{formatDate(log.created_at)}</td>
                    <td><Badge bg={actionVariant(log.action)}>{log.action_label || log.action}</Badge></td>
                    <td>{userName(log.user)}</td>
                    <td>
                      <div className="fw-semibold">{log.object_repr || log.object_id || "-"}</div>
                      <div className="text-muted small">{[log.app_label, log.model_name].filter(Boolean).join(" / ") || "-"}</div>
                    </td>
                    <td className="audit-description">{log.description || "-"}</td>
                    <td className="text-muted small">{log.ip_address || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
