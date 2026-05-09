import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { dateInputValue, formatDate, money } from "../workshopOptions";

function today() {
  return dateInputValue();
}
function firstDayOfMonth() {
  const d = new Date();
  return dateInputValue(new Date(d.getFullYear(), d.getMonth(), 1));
}
function lastDayOfMonth() {
  const d = new Date();
  return dateInputValue(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function amountClass(value) {
  const n = numberValue(value);
  if (n > 0) return "text-success fw-semibold";
  if (n < 0) return "text-danger fw-semibold";
  return "text-muted";
}

function Kpi({ label, value, variant }) {
  return <Col md={3}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className={`display-6 fw-bold ${variant || ""}`}>{value}</div></Card.Body></Card></Col>;
}

export default function FinanceCashFlowPage() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await api.get("/finance/cash-flow/", { params: { start_date: startDate, end_date: endDate } });
      setData(response.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  const totals = data?.totals || {};
  const rows = data?.rows || [];
  const kpis = useMemo(() => [
    ["Entradas realizadas", money(totals.received_amount), "text-success"],
    ["Saídas realizadas", money(totals.paid_amount), "text-danger"],
    ["Saldo realizado", money(totals.net_actual), numberValue(totals.net_actual) >= 0 ? "text-success" : "text-danger"],
    ["Saldo previsto", money(totals.net_forecast), numberValue(totals.net_forecast) >= 0 ? "text-success" : "text-danger"],
  ], [totals]);

  function setCurrentMonth() {
    setStartDate(firstDayOfMonth());
    setEndDate(lastDayOfMonth());
  }
  function setNext30Days() {
    const start = today();
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setStartDate(start);
    setEndDate(dateInputValue(d));
  }

  return <>
    <PageHeader title="Fluxo de caixa" subtitle="Entradas e saídas realizadas, recebíveis e pagáveis previstos por dia." />
    <AreaTabs area="finance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-3 align-items-end">
          <Col md={3}>
            <Form.Label>Data inicial</Form.Label>
            <Form.Control type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Col>
          <Col md={3}>
            <Form.Label>Data final</Form.Label>
            <Form.Control type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </Col>
          <Col md={2}><Button className="w-100" onClick={load}>Atualizar</Button></Col>
          <Col md={2}><Button className="w-100" variant="outline-secondary" onClick={setCurrentMonth}>Mês atual</Button></Col>
          <Col md={2}><Button className="w-100" variant="outline-secondary" onClick={setNext30Days}>Próx. 30 dias</Button></Col>
        </Row>
      </Card.Body>
    </Card>

    <Row className="g-3 mb-3">
      {kpis.map(([label, value, variant]) => <Kpi key={label} label={label} value={value} variant={variant} />)}
    </Row>

    <Card className="border-0 shadow-sm">
      <Card.Header className="bg-white fw-semibold">Movimento diário</Card.Header>
      <Card.Body className="p-0">
        {rows.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0 align-middle">
          <thead>
            <tr>
              <th>Data</th>
              <th>Entradas realizadas</th>
              <th>Saídas realizadas</th>
              <th>Saldo realizado</th>
              <th>Recebíveis previstos</th>
              <th>Pagáveis previstos</th>
              <th>Saldo previsto</th>
              <th>Acumulado realizado</th>
              <th>Acumulado previsto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.date}>
              <td className="fw-semibold">{formatDate(row.date)}</td>
              <td className="text-success">{money(row.received_amount)}</td>
              <td className="text-danger">{money(row.paid_amount)}</td>
              <td className={amountClass(row.net_actual)}>{money(row.net_actual)}</td>
              <td>{money(row.receivable_forecast)}</td>
              <td>{money(row.payable_forecast)}</td>
              <td className={amountClass(row.net_forecast)}>{money(row.net_forecast)}</td>
              <td className={amountClass(row.running_actual_balance)}>{money(row.running_actual_balance)}</td>
              <td className={amountClass(row.running_forecast_balance)}>{money(row.running_forecast_balance)}</td>
            </tr>)}
          </tbody>
        </Table>}
      </Card.Body>
    </Card>
  </>;
}
