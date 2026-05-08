import React, { useEffect, useMemo, useState } from "react";
import { Badge, Card, Col, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { formatDate, money } from "../workshopOptions";

const statusVariant = {
  open: "primary",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "secondary",
};

function KpiCard({ label, value }) {
  return <Col md={3}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>;
}

function FinanceTable({ title, rows, type }) {
  return <Card className="border-0 shadow-sm h-100">
    <Card.Header className="bg-white fw-semibold">{title}</Card.Header>
    <Card.Body className="p-0">
      {rows.length === 0 ? <EmptyState text="Nenhum registro encontrado." /> : <Table responsive hover className="mb-0">
        <thead><tr><th>Número</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${type}-${row.id}`}>
          <td className="fw-semibold"><Link to={type === "receivable" ? "/finance/accounts-receivable" : "/finance/accounts-payable"}>{row.number}</Link></td>
          <td>{row.description}</td>
          <td>{formatDate(row.due_date)}</td>
          <td>{money(row.amount)}</td>
          <td>{money(row.balance_amount)}</td>
          <td><Badge bg={statusVariant[row.status] || "secondary"}>{row.status_label}</Badge></td>
        </tr>)}</tbody>
      </Table>}
    </Card.Body>
  </Card>;
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData((await api.get("/finance/dashboard/")).data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => {
    const counts = data?.counts || {};
    return [
      ["A receber em aberto", money(counts.receivable_total_open || 0)],
      ["A pagar em aberto", money(counts.payable_total_open || 0)],
      ["Saldo previsto", money(counts.projected_balance || 0)],
      ["Recebidos no mês", money(counts.receivable_total_paid || 0)],
      ["Contas a receber abertas", counts.open_receivables || 0],
      ["Contas a pagar abertas", counts.open_payables || 0],
      ["Recebíveis vencidos", counts.overdue_receivables || 0],
      ["Pagáveis vencidos", counts.overdue_payables || 0],
    ];
  }, [data]);

  return <>
    <PageHeader title="Dashboard financeiro" subtitle="Visão consolidada de contas a receber, contas a pagar, vencimentos e saldo previsto." actions={<Link className="btn btn-outline-primary" to="/finance/cash-flow">Abrir fluxo de caixa</Link>} />
    <AreaTabs area="finance" />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Row className="g-3 mb-4">{cards.map(([label, value]) => <KpiCard key={label} label={label} value={value} />)}</Row>
    <Row className="g-3 mb-4">
      <Col lg={6}><FinanceTable title="Recebíveis vencidos" rows={data?.overdue_receivables || []} type="receivable" /></Col>
      <Col lg={6}><FinanceTable title="Pagáveis vencidos" rows={data?.overdue_payables || []} type="payable" /></Col>
    </Row>
    <Row className="g-3">
      <Col lg={6}><FinanceTable title="Recebíveis vencendo hoje" rows={data?.receivables_due_today || []} type="receivable" /></Col>
      <Col lg={6}><FinanceTable title="Pagáveis vencendo hoje" rows={data?.payables_due_today || []} type="payable" /></Col>
    </Row>
  </>;
}
