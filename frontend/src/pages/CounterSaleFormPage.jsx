import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import { dateInputValue, money, paymentMethods } from "../workshopOptions";

const today = () => dateInputValue();
const emptySale = () => ({ customer_id: "", customer_name: "Cliente balcão", due_date: today(), discount_amount: "", notes: "", items: [] });
const emptyLine = () => ({ local_id: crypto.randomUUID(), part_id: "", description: "", quantity: "", unit_price: "", cost_price: "", discount_amount: "", notes: "" });
const emptyPayment = () => ({ receive_now: false, payment_amount: "", payment_method: "cash", payment_reference: "", payment_notes: "" });

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function lineSubtotal(line) { return decimal(line.quantity) * decimal(line.unit_price); }
function lineTotal(line) { return Math.max(lineSubtotal(line) - decimal(line.discount_amount), 0); }

export default function CounterSaleFormPage({ embedded = false }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptySale());
  const [payment, setPayment] = useState(emptyPayment());
  const [activeTab, setActiveTab] = useState("customer");
  const [finalizeAfterSave, setFinalizeAfterSave] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(() => form.items.reduce((total, line) => total + lineSubtotal(line), 0), [form.items]);
  const lineDiscount = useMemo(() => form.items.reduce((total, line) => total + decimal(line.discount_amount), 0), [form.items]);
  const finalTotal = Math.max(subtotal - lineDiscount - decimal(form.discount_amount), 0);

  const tabs = [
    { key: "customer", label: "Cliente", description: "Dados da venda" },
    { key: "items", label: "Peças", description: "Itens vendidos", badge: form.items.length || "" },
    { key: "payment", label: "Pagamento", description: "Finalização" },
  ];

  async function loadReferences() {
    try {
      const [contactsRes, partsRes] = await Promise.all([
        api.get("/contacts/"),
        api.get("/workshop/parts/", { params: { active: "true" } }),
      ]);
      setContacts(results(contactsRes.data));
      setParts(results(partsRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { loadReferences(); }, []);

  function addLine() { setForm((current) => ({ ...current, items: [...current.items, emptyLine()] })); }
  function removeLine(localId) { setForm((current) => ({ ...current, items: current.items.filter((line) => line.local_id !== localId) })); }
  function updateLine(localId, patch) { setForm((current) => ({ ...current, items: current.items.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function selectPart(localId, partId) {
    const part = parts.find((item) => String(item.id) === String(partId));
    updateLine(localId, part ? { part_id: partId, description: part.name, unit_price: part.sale_price || "0.00", cost_price: part.cost_price || "0.00" } : { part_id: partId });
  }

  function validateBeforeSave() {
    if (form.items.length === 0) {
      setActiveTab("items");
      setError("Inclua pelo menos uma peça antes de salvar a venda avulsa.");
      return false;
    }
    const incomplete = form.items.some((line) => !line.part_id || !line.description || decimal(line.quantity) <= 0);
    if (incomplete) {
      setActiveTab("items");
      setError("Revise as peças: cada linha precisa ter peça, descrição e quantidade maior que zero.");
      return false;
    }
    return true;
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    if (!validateBeforeSave()) {
      setSaving(false);
      return;
    }
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id || null,
        items: form.items.map(({ local_id, ...line }) => ({ ...line, part_id: line.part_id || null })),
      };
      const { data } = await api.post("/attendance/counter-sales/", payload);
      if (finalizeAfterSave) {
        await api.post(`/attendance/counter-sales/${data.id}/finalize/`, {
          payment_amount: payment.receive_now ? payment.payment_amount : "0.00",
          payment_method: payment.payment_method,
          payment_reference: payment.payment_reference,
          payment_notes: payment.payment_notes,
        });
      }
      navigate("/attendance/counter-sales");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  return <>
    {!embedded ? (
      <>
        <PageHeader
          title="Nova venda avulsa"
          subtitle="Venda direta de balcão organizada por abas: cliente, peças e pagamento."
          actions={<Link className="btn btn-outline-secondary" to="/attendance/counter-sales">Voltar para vendas</Link>}
        />
        <AreaTabs area="attendance" />
      </>
    ) : null}
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Form onSubmit={save} noValidate>
      <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

      <TabPanel activeKey={activeTab} eventKey="customer">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Dados da venda</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Cliente cadastrado</Form.Label>
                <Form.Select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}>
                  <option value="">Cliente balcão / não cadastrado</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Nome do cliente balcão</Form.Label>
                <Form.Control value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label>Vencimento</Form.Label>
                <Form.Control type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label>Desconto geral</Form.Label>
                <MoneyInput value={form.discount_amount} onChange={(value) => setForm({ ...form, discount_amount: value })} />
              </Col>
              <Col md={12}>
                <Form.Label>Observações</Form.Label>
                <Form.Control as="textarea" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="items">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Peças vendidas</span>
            <Button size="sm" variant="outline-primary" type="button" onClick={addLine}>Adicionar peça</Button>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive bordered className="mb-0 align-middle">
              <thead><tr><th style={{ minWidth: 260 }}>Peça</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desconto</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {form.items.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Nenhuma peça adicionada.</td></tr>}
                {form.items.map((line) => <tr key={line.local_id}>
                  <td><Form.Select required value={line.part_id || ""} onChange={(event) => selectPart(line.local_id, event.target.value)}><option value="">Selecione</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} - {part.name} | estoque: {part.stock_quantity}</option>)}</Form.Select></td>
                  <td><Form.Control required value={line.description} onChange={(event) => updateLine(line.local_id, { description: event.target.value })} /></td>
                  <td><Form.Control required type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.local_id, { quantity: event.target.value })} /></td>
                  <td><MoneyInput value={line.unit_price} onChange={(value) => updateLine(line.local_id, { unit_price: value })} /></td>
                  <td><MoneyInput value={line.discount_amount} onChange={(value) => updateLine(line.local_id, { discount_amount: value })} /></td>
                  <td>{money(lineTotal(line))}</td>
                  <td><Button size="sm" variant="outline-danger" type="button" onClick={() => removeLine(line.local_id)}>Remover</Button></td>
                </tr>)}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="payment">
        <Row className="g-3 mb-3">
          <Col md={3}><div className="finance-total-box"><span>Subtotal</span><strong>{money(subtotal)}</strong></div></Col>
          <Col md={3}><div className="finance-total-box"><span>Descontos</span><strong>{money(lineDiscount + decimal(form.discount_amount))}</strong></div></Col>
          <Col md={3}><div className="finance-total-box total"><span>Total da venda</span><strong>{money(finalTotal)}</strong></div></Col>
          <Col md={3}><div className="finance-total-box"><span>Saldo se não receber agora</span><strong>{money(finalTotal)}</strong></div></Col>
        </Row>

        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Finalização e recebimento</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={3}>
                <Form.Check type="switch" label="Finalizar venda ao salvar" checked={finalizeAfterSave} onChange={(event) => setFinalizeAfterSave(event.target.checked)} />
                <Form.Check type="switch" label="Receber valor agora" checked={payment.receive_now} onChange={(event) => setPayment({ ...payment, receive_now: event.target.checked, payment_amount: event.target.checked ? String(finalTotal.toFixed(2)) : "0.00" })} disabled={!finalizeAfterSave} />
              </Col>
              <Col md={3}>
                <Form.Label>Valor recebido agora</Form.Label>
                <MoneyInput value={payment.payment_amount} disabled={!payment.receive_now || !finalizeAfterSave} onChange={(value) => setPayment({ ...payment, payment_amount: value })} />
              </Col>
              <Col md={3}>
                <Form.Label>Forma de pagamento</Form.Label>
                <Form.Select value={payment.payment_method} disabled={!payment.receive_now || !finalizeAfterSave} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })}>
                  {paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Form.Select>
              </Col>
              <Col md={3}>
                <Form.Label>Referência</Form.Label>
                <Form.Control value={payment.payment_reference} disabled={!payment.receive_now || !finalizeAfterSave} onChange={(event) => setPayment({ ...payment, payment_reference: event.target.value })} />
              </Col>
            </Row>
            <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/attendance/counter-sales")} saveLabel={saving ? "Salvando..." : "Salvar venda"} saveDisabled={saving || form.items.length === 0} />
          </Card.Body>
        </Card>
      </TabPanel>
    </Form>
  </>;
}
