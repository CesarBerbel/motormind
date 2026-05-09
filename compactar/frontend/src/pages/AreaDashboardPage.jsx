import React, { useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasPermission } from "../auth/permissions";
import api, { apiError } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { money } from "../workshopOptions";



const areaActions = {
  dono: [
    ["/users", "Usuários", "Controle de acessos, setores e permissões.", "users.manage"],
    ["/settings", "Cadastro da oficina", "Logo, dados fiscais, endereço e impressões.", "settings.manage"],
    ["/finance/dashboard", "Financeiro", "Indicadores financeiros consolidados.", "finance.view"],
    ["/work-orders", "Ordens de serviço", "Operação geral da oficina.", "work_orders.view"],
  ],
  administrativo: [
    ["/settings", "Cadastro da oficina", "Dados usados em documentos imprimíveis.", "settings.manage"],
    ["/users", "Usuários", "Cadastro de funcionários e setores.", "users.manage"],
    ["/contacts", "Clientes", "Cadastro de clientes e contatos.", "contacts.view"],
    ["/work-orders", "OS", "Acompanhamento administrativo das ordens.", "work_orders.view"],
  ],
  atendimento: [
    ["/attendance/estimates", "Orçamentos", "Criar e acompanhar propostas para clientes.", "estimates.view"],
    ["/work-orders", "Ordens de serviço", "Abrir e acompanhar OS.", "work_orders.view"],
    ["/vehicles", "Veículos", "Cadastrar e editar veículos por cliente.", "vehicles.view"],
    ["/contacts", "Clientes", "Pesquisar e cadastrar clientes.", "contacts.view"],
  ],
  estoque: [
    ["/parts", "Peças", "Cadastro, marcas, categorias e estoque.", "parts.view"],
    ["/stock-movements", "Movimentos", "Entradas, ajustes e rastreabilidade.", "stock.view"],
    ["/purchasing/purchase-orders", "Pedidos de compra", "Comprar e receber peças.", "purchases.view"],
    ["/purchasing/suppliers", "Fornecedores", "Base de fornecedores.", "suppliers.view"],
  ],
  tecnico: [
    ["/technical/workbench", "Bancada técnica", "Execução dos serviços atribuídos.", ["technical.dashboard", "dashboard.technical"]],
    ["/work-orders", "OS em andamento", "Consultar detalhes da ordem.", "work_orders.view"],
    ["/workshop-services", "Serviços", "Catálogo técnico de serviços.", "services.view"],
    ["/service-packages", "Pacotes", "Combos e pacotes técnicos.", "service_packages.view"],
  ],
  financeiro: [
    ["/finance/accounts-receivable", "Contas a receber", "Recebimentos, baixas e vencimentos.", "finance.view"],
    ["/finance/accounts-payable", "Contas a pagar", "Pagamentos e fornecedores.", "finance.view"],
    ["/finance/cash-flow", "Fluxo de caixa", "Saldo previsto por período.", "finance.view"],
    ["/purchasing/purchase-orders", "Compras", "Impactos financeiros dos pedidos.", "purchases.view"],
  ],
};

const dashboardLabels = {
  dono: { title: "Dashboard do Dono", subtitle: "Visão completa da operação, estoque, atendimento, técnica e financeiro." },
  administrativo: { title: "Dashboard administrativo", subtitle: "Visão geral da oficina e dos processos administrativos." },
  atendimento: { title: "Dashboard atendimento", subtitle: "Clientes, veículos, abertura e acompanhamento das ordens de serviço." },
  estoque: { title: "Dashboard estoque", subtitle: "Peças, baixo estoque e movimentações de inventário." },
  tecnico: { title: "Dashboard técnico", subtitle: "Serviços pendentes, em execução e concluídos pela equipe técnica." },
  financeiro: { title: "Dashboard financeiro", subtitle: "Recebimentos, pagamentos e saldo previsto das ordens de serviço." },
};

function valueFor(label, value) {
  if (["Recebido no mês", "Saldo em aberto", "Contas a pagar", "Saldo previsto", "Total aberto em compras"].includes(label)) return money(value || 0);
  return value || 0;
}

export default function AreaDashboardPage() {
  const { area } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData((await api.get(`/workshop/dashboards/${area}/`)).data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [area]);

  const meta = dashboardLabels[area] || dashboardLabels.administrativo;
  const actions = (areaActions[area] || []).filter(([, , , permission]) => hasPermission(user, permission));
  const counts = data?.counts || {};
  const cards = useMemo(() => {
    const base = [];
    if (counts.open_work_orders !== undefined) base.push(["OS abertas", counts.open_work_orders]);
    if (counts.awaiting_approval !== undefined) base.push(["Aguardando aprovação", counts.awaiting_approval]);
    if (counts.delivered_today !== undefined) base.push(["Entregues hoje", counts.delivered_today]);
    if (counts.vehicles !== undefined) base.push(["Veículos", counts.vehicles]);
    if (counts.contacts !== undefined) base.push(["Clientes", counts.contacts]);
    if (counts.parts !== undefined) base.push(["Peças cadastradas", counts.parts]);
    if (counts.low_stock_parts !== undefined) base.push(["Peças baixo estoque", counts.low_stock_parts]);
    if (counts.stock_movements_today !== undefined) base.push(["Movimentos hoje", counts.stock_movements_today]);
    if (counts.services_pending !== undefined) base.push(["Serviços pendentes", counts.services_pending]);
    if (counts.services_in_progress !== undefined) base.push(["Serviços em execução", counts.services_in_progress]);
    if (counts.services_done !== undefined) base.push(["Serviços concluídos", counts.services_done]);
    if (counts.paid_month !== undefined) base.push(["Recebido no mês", counts.paid_month]);
    if (counts.payments_today !== undefined) base.push(["Pagamentos hoje", counts.payments_today]);
    if (counts.balance_due !== undefined) base.push(["Saldo em aberto", counts.balance_due]);
    if (counts.open_receivables !== undefined) base.push(["Contas a receber abertas", counts.open_receivables]);
    if (counts.overdue_receivables !== undefined) base.push(["Recebíveis vencidos", counts.overdue_receivables]);
    if (counts.payables_due !== undefined) base.push(["Contas a pagar", counts.payables_due]);
    if (counts.projected_balance !== undefined) base.push(["Saldo previsto", counts.projected_balance]);
    if (counts.open_payables !== undefined) base.push(["Contas a pagar abertas", counts.open_payables]);
    if (counts.overdue_payables !== undefined) base.push(["Pagáveis vencidos", counts.overdue_payables]);
    if (counts.open_purchase_orders !== undefined) base.push(["Compras abertas", counts.open_purchase_orders]);
    if (counts.auto_purchase_orders !== undefined) base.push(["Compras automáticas", counts.auto_purchase_orders]);
    return base;
  }, [counts]);

  return <>
    <PageHeader title={meta.title} subtitle={meta.subtitle} />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Row className="g-3 mb-4">{cards.map(([label, value]) => <Col md={3} xl key={label}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{valueFor(label, value)}</div></Card.Body></Card></Col>)}</Row>
    {actions.length ? <Row className="g-3 mb-4">{actions.map(([to, label, description]) => <Col md={3} key={`${area}-${to}`}><Link to={to} className="sector-action-card bg-white"><div className="fw-bold mb-1">{label}</div><div className="text-muted small">{description}</div></Link></Col>)}</Row> : null}
    <Row className="g-3">
      <Col lg={8}><Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">Ordens recentes</Card.Header><Card.Body className="p-0"><Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>{(data?.recent_work_orders || []).map((order) => <tr key={order.id}><td className="fw-semibold">{order.number}</td><td>{order.customer_name}</td><td>{order.vehicle_display || "-"}</td><td><StatusBadge value={order.status} label={order.status_label} /></td><td>{money(order.grand_total)}</td><td><Link to={`/work-orders/${order.id}`}>Abrir</Link></td></tr>)}</tbody></Table></Card.Body></Card></Col>
      <Col lg={4}><Card className="border-0 shadow-sm mb-3"><Card.Header className="bg-white fw-semibold">Baixo estoque</Card.Header><Card.Body className="p-0"><Table responsive hover className="mb-0"><tbody>{(data?.low_stock_parts || []).map((part) => <tr key={part.id}><td>{part.sku}</td><td>{part.name}</td><td>{part.stock_quantity} {part.unit}</td></tr>)}</tbody></Table></Card.Body></Card><Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">Pagamentos recentes</Card.Header><Card.Body className="p-0"><Table responsive hover className="mb-0"><tbody>{(data?.recent_payments || []).map((payment) => <tr key={payment.id}><td>{payment.work_order_number}</td><td>{payment.method_label || payment.method}</td><td>{money(payment.amount)}</td></tr>)}</tbody></Table></Card.Body></Card></Col>
    </Row>
  </>;
}
