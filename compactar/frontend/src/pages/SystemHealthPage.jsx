import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import api, { apiError } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import NoticeBox from "../components/NoticeBox";
import PageHeader from "../components/PageHeader";

function statusVariant(status) {
  if (status === "ok") return "success";
  if (status === "warning") return "warning";
  return "danger";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [deep, setDeep] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadHealth(nextDeep = deep) {
    setError("");
    setLoading(true);
    try {
      const { data } = await api.get(`/health/${nextDeep ? "?deep=true" : ""}`);
      setHealth(data);
    } catch (err) {
      if (err.response?.data) {
        setHealth(err.response.data);
      }
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth(true);
  }, []);

  const checks = health?.checks || {};

  return (
    <div>
      <PageHeader title="Saúde do sistema" subtitle="Diagnóstico rápido de backend, banco, migrations, armazenamento e serviços assíncronos." />
      <ErrorAlert error={error} onClose={() => setError("")} />

      <Card className="border-0 shadow-sm mb-3">
        <Card.Body className="d-flex flex-wrap gap-3 align-items-center justify-content-between">
          <div>
            <div className="text-muted small">Status geral</div>
            <div className="d-flex align-items-center gap-2">
              <Badge bg={statusVariant(health?.status)} className="text-uppercase">{health?.status || "carregando"}</Badge>
              <span className="text-muted small">Versão {health?.version || "-"}</span>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Form.Check
              type="switch"
              id="deep-health-check"
              label="Verificação profunda"
              checked={deep}
              onChange={(event) => {
                const checked = event.target.checked;
                setDeep(checked);
                loadHealth(checked);
              }}
            />
            <Button variant="outline-primary" onClick={() => loadHealth()} disabled={loading}>
              {loading ? "Verificando..." : "Atualizar diagnóstico"}
            </Button>
          </div>
        </Card.Body>
      </Card>

      <NoticeBox variant="info" title="Como interpretar">
        Status <strong>ok</strong> permite operação normal. Status <strong>warning</strong> indica atenção, como Redis desligado em ambiente local. Status <strong>error</strong> deve ser corrigido antes de usar o sistema em produção.
      </NoticeBox>

      <Row className="g-3 mt-1">
        {Object.entries(checks).map(([name, check]) => (
          <Col md={6} xl={4} key={name}>
            <Card className="border-0 shadow-sm h-100 health-check-card">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <div>
                    <div className="text-muted small text-uppercase">{name.replaceAll("_", " ")}</div>
                    <h2 className="h6 mb-0">{check.message}</h2>
                  </div>
                  <Badge bg={statusVariant(check.status)}>{check.status}</Badge>
                </div>
                <Table size="sm" borderless className="mb-0 health-check-table">
                  <tbody>
                    {Object.entries(check)
                      .filter(([key]) => !["status", "message"].includes(key))
                      .map(([key, value]) => (
                        <tr key={key}>
                          <th>{key}</th>
                          <td><pre>{formatValue(value)}</pre></td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
