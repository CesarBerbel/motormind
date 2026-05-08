import React, { useEffect, useState } from "react";
import { Card, Col, Row, Table } from "react-bootstrap";
import api, { apiError } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import StatusBadge from "../components/StatusBadge";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await api.get("/dashboard/");
      setData(res.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = data?.counts || {};
  const cards = [
    ["Contatos", counts.contacts || 0],
    ["Templates", counts.templates || 0],
    ["Automacoes ativas", counts.automations_active || 0],
    ["Enviados hoje", counts.sent_today || 0],
    ["Falhas hoje", counts.failed_today || 0],
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Resumo operacional de envios e automacoes." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Row className="g-3 mb-4">
        {cards.map(([label, value]) => (
          <Col md={4} xl key={label}>
            <Card className="card-kpi">
              <Card.Body>
                <div className="text-muted small">{label}</div>
                <div className="display-6 fw-bold">{value}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <Row className="g-3">
        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white fw-semibold">Ultimos envios</Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="mb-0">
                <thead><tr><th>Canal</th><th>Destino</th><th>Status</th><th>Data</th></tr></thead>
                <tbody>
                  {(data?.recent_logs || []).map((log) => (
                    <tr key={log.id}>
                      <td><StatusBadge value={log.channel} /></td>
                      <td>{log.to_email || log.to_phone || log.recipient_name}</td>
                      <td><StatusBadge value={log.status} /></td>
                      <td>{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white fw-semibold">Proximas automacoes</Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="mb-0">
                <thead><tr><th>Nome</th><th>Canal</th><th>Proxima execucao</th></tr></thead>
                <tbody>
                  {(data?.next_automations || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td><StatusBadge value={item.channel} /></td>
                      <td>{item.next_run_at ? new Date(item.next_run_at).toLocaleString("pt-BR") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
