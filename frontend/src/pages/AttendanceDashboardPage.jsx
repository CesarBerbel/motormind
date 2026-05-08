import React, { useEffect, useMemo, useState } from "react";
import { Badge, Card, Col, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { money } from "../workshopOptions";

const badge = {
  draft: "secondary",
  sent: "info",
  approved: "success",
  rejected: "danger",
  converted: "primary",
  finalized: "success",
  open: "primary",
  ready: "success",
  awaiting_approval: "warning",
};

export default function AttendanceDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await api.get("/attendance/dashboard/");
      setData(response.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => {
    const counts = data?.counts || {};
    return [
      ["OS abertas", counts.open_work_orders || 0],
      ["OS aguardando aprovação", counts.awaiting_approval_work_orders || 0],
      ["Orçamentos em aberto", counts.estimates_open || 0],
      ["Vendas avulsas hoje", counts.counter_sales_today || 0],
      ["Venda avulsa no mês", money(counts.counter_sales_month_amount || 0)],
      ["Saldo avulso a receber", money(counts.counter_sales_month_balance || 0)],
      ["Orçamentos do mês", money(counts.estimates_month_amount || 0)],
      ["Peças em estoque baixo", counts.low_stock_parts || 0],
    ];
  }, [data]);

  return <>
    <PageHeader title="Dashboard do atendimento" subtitle="Visão operacional de OS, orçamentos, vendas avulsas, clientes e pendências do balcão." />
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Row className="g-3 mb-3">
      {cards.map(([label, value]) => <Col md={3} key={label}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>)}
    </Row>

    <Row className="g-3">
      <Col lg={6}>
        <Card className="border-0 shadow-sm h-100">
          <Card.Header className="bg-white fw-semibold">Orçamentos recentes</Card.Header>
          <Card.Body className="p-0">
            {!data?.recent_estimates?.length ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead><tbody>{data.recent_estimates.map((item) => <tr key={item.id}><td><Link to="/attendance/estimates">{item.number}</Link></td><td>{item.customer_name}</td><td>{money(item.total_amount)}</td><td><Badge bg={badge[item.status] || "secondary"}>{item.status_label}</Badge></td></tr>)}</tbody></Table>}
          </Card.Body>
        </Card>
      </Col>
      <Col lg={6}>
        <Card className="border-0 shadow-sm h-100">
          <Card.Header className="bg-white fw-semibold">Vendas avulsas recentes</Card.Header>
          <Card.Body className="p-0">
            {!data?.recent_counter_sales?.length ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Status</th></tr></thead><tbody>{data.recent_counter_sales.map((item) => <tr key={item.id}><td><Link to="/attendance/counter-sales">{item.number}</Link></td><td>{item.customer_display_name}</td><td>{money(item.total_amount)}</td><td><Badge bg={badge[item.status] || "secondary"}>{item.status_label}</Badge></td></tr>)}</tbody></Table>}
          </Card.Body>
        </Card>
      </Col>
      <Col lg={6}>
        <Card className="border-0 shadow-sm h-100">
          <Card.Header className="bg-white fw-semibold">OS prontas para atendimento</Card.Header>
          <Card.Body className="p-0">
            {!data?.ready_work_orders?.length ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>OS</th><th>Cliente</th><th>Veículo</th><th>Total</th></tr></thead><tbody>{data.ready_work_orders.map((item) => <tr key={item.id}><td><Link to={`/work-orders/${item.id}`}>{item.number}</Link></td><td>{item.customer_name}</td><td>{item.vehicle_display}</td><td>{money(item.grand_total)}</td></tr>)}</tbody></Table>}
          </Card.Body>
        </Card>
      </Col>
      <Col lg={6}>
        <Card className="border-0 shadow-sm h-100">
          <Card.Header className="bg-white fw-semibold">Peças em estoque baixo</Card.Header>
          <Card.Body className="p-0">
            {!data?.low_stock_parts?.length ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>SKU</th><th>Peça</th><th>Estoque</th><th>Mínimo</th></tr></thead><tbody>{data.low_stock_parts.map((item) => <tr key={item.id}><td>{item.sku}</td><td>{item.name}</td><td>{item.stock_quantity}</td><td>{item.minimum_stock}</td></tr>)}</tbody></Table>}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  </>;
}
