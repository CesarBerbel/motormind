import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { formatDate, money, paymentMethods } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";

const statusOptions = [
  ["", "Todos"],
  ["open", "Aberta"],
  ["partial", "Parcial"],
  ["paid", "Paga"],
  ["overdue", "Vencida"],
  ["cancelled", "Cancelada"],
];

const statusVariant = {
  open: "primary",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "secondary",
};

function todayDateTimeLocal() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function emptyPayment(balance = "0.00") {
  return {
    amount: balance || "0.00",
    method: "cash",
    paid_at: todayDateTimeLocal(),
    reference: "",
    notes: "",
  };
}

export default function FinanceReceivablesPage() {
  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [receiving, setReceiving] = useState(null);
  const [payment, setPayment] = useState(emptyPayment());

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const [dashboardRes, accountsRes] = await Promise.all([
        api.get("/finance/dashboard/"),
        api.get("/finance/accounts-receivable/", { params }),
      ]);
      setDashboard(dashboardRes.data);
      setItems(results(accountsRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status]);

  const cards = useMemo(() => {
    const counts = dashboard?.counts || {};
    return [
      ["Contas abertas", counts.open_receivables || 0],
      ["Contas vencidas", counts.overdue_receivables || 0],
      ["Total em aberto", money(counts.total_open || 0)],
      ["Total recebido", money(counts.total_paid || 0)],
    ];
  }, [dashboard]);

  function openPayment(item) {
    setReceiving(item);
    setPayment(emptyPayment(item.balance_amount));
  }

  async function savePayment(event) {
    event.preventDefault();
    try {
      await api.post(`/finance/accounts-receivable/${receiving.id}/register_payment/`, {
        ...payment,
        paid_at: toIso(payment.paid_at),
      });
      setReceiving(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function refresh(item) {
    try {
      await api.post(`/finance/accounts-receivable/${item.id}/refresh/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Financeiro - contas a receber" subtitle="Contas geradas automaticamente por OS entregue, venda avulsa finalizada ou lançamento financeiro manual." actions={<Link className="btn btn-primary" to="/finance/accounts-receivable/new">Nova conta a receber</Link>} />
    <AreaTabs area="finance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Row className="g-3 mb-3">
      {cards.map(([label, value]) => <Col md={3} key={label}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>)}
    </Row>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-center">
          <Col md={6}><SearchAutocompleteInput placeholder="Buscar por conta, OS ou cliente" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["number", "work_order_number", "counter_sale_number", "customer_name", "description", "status_label"])} /></Col>
          <Col md={3}><Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col>
          <Col md={3}><Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button></Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0">
          <thead><tr><th>Conta</th><th>Origem</th><th>Cliente</th><th>Vencimento</th><th>Total</th><th>Recebido</th><th>Saldo</th><th>Status</th><th></th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td className="fw-semibold">{item.number}</td>
            <td>{item.work_order ? <Link to={`/work-orders/${item.work_order}`}>{item.work_order_number}</Link> : item.counter_sale ? `Venda ${item.counter_sale_number}` : "-"}</td>
            <td>{item.customer_name}</td>
            <td>{formatDate(item.due_date)}</td>
            <td>{money(item.amount)}</td>
            <td>{money(item.paid_amount)}</td>
            <td>{money(item.balance_amount)}</td>
            <td><Badge bg={statusVariant[item.status] || "secondary"}>{item.status_label}</Badge></td>
            <td className="text-end">
              <Button size="sm" variant="outline-secondary" onClick={() => refresh(item)} className="me-2">Atualizar</Button>
              {Number(item.balance_amount || 0) > 0 && <Button size="sm" onClick={() => openPayment(item)}>Receber</Button>}
            </td>
          </tr>)}</tbody>
        </Table>}
      </Card.Body>
    </Card>

    <Modal show={!!receiving} onHide={() => setReceiving(null)}>
      <Form onSubmit={savePayment}>
        <Modal.Header closeButton><Modal.Title>Registrar recebimento</Modal.Title></Modal.Header>
        <Modal.Body>
          {receiving && <div className="mb-3 small text-muted">Conta {receiving.number} - saldo {money(receiving.balance_amount)}</div>}
          <Form.Label>Valor recebido</Form.Label>
          <MoneyInput className="mb-3" value={payment.amount} onChange={(value) => setPayment({ ...payment, amount: value })} />
          <Form.Label>Forma de pagamento</Form.Label>
          <Form.Select className="mb-3" value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select>
          <Form.Label>Data do recebimento</Form.Label>
          <Form.Control className="mb-3" type="datetime-local" value={payment.paid_at} onChange={(event) => setPayment({ ...payment, paid_at: event.target.value })} />
          <Form.Label>Referência</Form.Label>
          <Form.Control className="mb-3" value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} />
          <Form.Label>Observações</Form.Label>
          <Form.Control as="textarea" rows={3} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} />
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setReceiving(null)}>Cancelar</Button><Button type="submit">Salvar recebimento</Button></Modal.Footer>
      </Form>
    </Modal>
  </>;
}
