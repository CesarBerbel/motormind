import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { dateInputValue, formatDate, money } from "../workshopOptions";

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function KpiCard({ label, value, tone = "primary", hint }) {
  return (
    <Col sm={6} xl={3}>
      <Card className={`report-kpi report-kpi-${tone} h-100`}>
        <Card.Body>
          <div className="text-muted small">{label}</div>
          <div className="display-6 fw-bold">{value}</div>
          {hint ? <div className="small text-muted mt-1">{hint}</div> : null}
        </Card.Body>
      </Card>
    </Col>
  );
}

function SimpleBarList({ title, rows, valueKey = "count", labelKey = "label", moneyValue = false }) {
  const max = Math.max(...(rows || []).map((row) => Number(row[valueKey] || 0)), 1);
  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-white fw-semibold">{title}</Card.Header>
      <Card.Body>
        {(rows || []).length === 0 ? <EmptyState text="Sem dados no período." /> : (rows || []).map((row) => {
          const value = Number(row[valueKey] || 0);
          return (
            <div className="report-bar-row" key={`${title}-${row[labelKey] || row.description || row.key}`}>
              <div className="d-flex justify-content-between gap-2 small mb-1">
                <span className="fw-semibold text-truncate">{row[labelKey] || row.description || row.key}</span>
                <span>{moneyValue ? money(value) : value}</span>
              </div>
              <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${Math.max(6, (value / max) * 100)}%` }} /></div>
            </div>
          );
        })}
      </Card.Body>
    </Card>
  );
}

export default function ReportsExecutivePage() {
  const [filters, setFilters] = useState({ start_date: dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), end_date: dateInputValue(addDays(0)) });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/reports/executive-summary/", { params: filters });
      setData(response.data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => {
    const c = data?.cards || {};
    return [
      ["Recebido no período", money(c.revenue_period), "success"],
      ["Despesas no período", money(c.expenses_period), "danger"],
      ["Resultado líquido", money(c.net_period), Number(c.net_period || 0) >= 0 ? "success" : "danger"],
      ["Ticket médio OS", money(c.ticket_average), "primary"],
      ["Total em OS", money(c.work_order_total_period), "primary"],
      ["A receber em aberto", money(c.receivable_open), "warning"],
      ["A pagar em aberto", money(c.payable_open), "warning"],
      ["Estoque baixo", c.low_stock_parts || 0, "danger"],
      ["OS abertas", c.open_work_orders || 0, "primary"],
      ["OS do período", c.work_order_count_period || 0, "primary"],
      ["OS entregues", c.delivered_work_orders_period || 0, "success"],
      ["Aprovações pendentes", c.pending_approvals || 0, "warning"],
    ];
  }, [data]);

  return (
    <>
      <PageHeader
        title="Dashboard executivo"
        subtitle="Visão gerencial consolidada de OS, financeiro, estoque e aprovações."
        actions={<div className="d-flex gap-2 flex-wrap"><Link className="btn btn-outline-primary" to="/reports/work-orders">Relatório de OS</Link><Link className="btn btn-outline-primary" to="/reports/finance">Financeiro</Link><Link className="btn btn-outline-primary" to="/reports/inventory">Estoque</Link></div>}
      />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col md={3}><Form.Label>Data inicial</Form.Label><Form.Control type="date" value={filters.start_date} onChange={(e) => setFilters((old) => ({ ...old, start_date: e.target.value }))} /></Col>
            <Col md={3}><Form.Label>Data final</Form.Label><Form.Control type="date" value={filters.end_date} onChange={(e) => setFilters((old) => ({ ...old, end_date: e.target.value }))} /></Col>
            <Col md="auto"><Button onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</Button></Col>
          </Row>
        </Card.Body>
      </Card>
      <Row className="g-3 mb-4">{cards.map(([label, value, tone]) => <KpiCard key={label} label={label} value={value} tone={tone} />)}</Row>
      <Row className="g-3 mb-4">
        <Col lg={4}><SimpleBarList title="OS por status" rows={data?.work_order_status || []} /></Col>
        <Col lg={4}><SimpleBarList title="Serviços mais vendidos" rows={(data?.top_services || []).map((row) => ({ ...row, label: row.description }))} valueKey="total" moneyValue /></Col>
        <Col lg={4}><SimpleBarList title="Peças mais usadas" rows={(data?.top_parts || []).map((row) => ({ ...row, label: row.description }))} valueKey="quantity" /></Col>
      </Row>
      <Row className="g-3">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold">OS recentes</Card.Header>
            <Card.Body className="p-0">
              {(data?.recent_work_orders || []).length === 0 ? <EmptyState text="Nenhuma OS encontrada." /> : <Table responsive hover className="mb-0">
                <thead><tr><th>Número</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Total</th><th></th></tr></thead>
                <tbody>{(data?.recent_work_orders || []).map((row) => <tr key={row.id}>
                  <td className="fw-semibold">{row.number}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.vehicle_display || "-"}</td>
                  <td><StatusBadge value={row.status} label={row.status_label} /></td>
                  <td>{money(row.grand_total)}</td>
                  <td><Link to={`/work-orders/${row.id}`}>Abrir</Link></td>
                </tr>)}</tbody>
              </Table>}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white fw-semibold">Peças em baixo estoque</Card.Header>
            <Card.Body className="p-0">
              {(data?.low_stock_parts || []).length === 0 ? <EmptyState text="Nenhuma peça em baixo estoque." /> : <Table responsive hover className="mb-0">
                <tbody>{(data?.low_stock_parts || []).map((part) => <tr key={part.id}><td><div className="fw-semibold">{part.name}</div><div className="small text-muted">{part.sku}</div></td><td className="text-end"><Badge bg="danger">{part.stock_quantity} {part.unit}</Badge></td></tr>)}</tbody>
              </Table>}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
