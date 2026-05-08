import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { dateInputValue, formatDate, fromDatetimeLocal, money, paymentMethods, todayDatetimeLocalValue } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";

const emptySale = () => ({ customer_id: "", customer_name: "Cliente balcão", due_date: dateInputValue(), discount_amount: "", notes: "", items: [] });
const emptyLine = () => ({ local_id: crypto.randomUUID(), part_id: "", description: "", quantity: "", unit_price: "", cost_price: "", discount_amount: "", notes: "" });
const emptyPayment = (amount = "0.00") => ({ payment_amount: amount, payment_method: "cash", payment_reference: "", payment_notes: "" });
const emptyReceive = (amount = "0.00") => ({ amount, method: "cash", paid_at: todayDatetimeLocalValue(), reference: "", notes: "" });

const statusVariant = { draft: "secondary", finalized: "success", cancelled: "danger" };
const statusOptions = [["", "Todas"], ["draft", "Rascunho"], ["finalized", "Finalizada"], ["cancelled", "Cancelada"]];

function decimal(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function lineSubtotal(line) { return decimal(line.quantity) * decimal(line.unit_price); }
function lineTotal(line) { return Math.max(lineSubtotal(line) - decimal(line.discount_amount), 0); }

export default function CounterSalesPage() {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptySale());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [payment, setPayment] = useState(emptyPayment());
  const [receiving, setReceiving] = useState(null);
  const [receive, setReceive] = useState(emptyReceive());
  const [error, setError] = useState("");

  const subtotal = useMemo(() => form.items.reduce((total, line) => total + lineSubtotal(line), 0), [form.items]);
  const lineDiscount = useMemo(() => form.items.reduce((total, line) => total + decimal(line.discount_amount), 0), [form.items]);
  const finalTotal = Math.max(subtotal - lineDiscount - decimal(form.discount_amount), 0);

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const [salesRes, contactsRes, partsRes] = await Promise.all([
        api.get("/attendance/counter-sales/", { params }),
        api.get("/contacts/"),
        api.get("/workshop/parts/", { params: { active: "true" } }),
      ]);
      setItems(results(salesRes.data));
      setContacts(results(contactsRes.data));
      setParts(results(partsRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status]);

  function open(item = null) {
    setEditing(item);
    setForm(item ? {
      customer_id: item.customer?.id || "",
      customer_name: item.customer_name || "Cliente balcão",
      due_date: item.due_date || dateInputValue(),
      discount_amount: item.discount_amount || "0.00",
      notes: item.notes || "",
      items: (item.items || []).map((line) => ({ ...line, local_id: crypto.randomUUID(), part_id: line.part || "" })),
    } : emptySale());
    setShow(true);
  }

  function addLine() { setForm((current) => ({ ...current, items: [...current.items, emptyLine()] })); }
  function removeLine(localId) { setForm((current) => ({ ...current, items: current.items.filter((line) => line.local_id !== localId) })); }
  function updateLine(localId, patch) { setForm((current) => ({ ...current, items: current.items.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function selectPart(localId, partId) {
    const part = parts.find((item) => String(item.id) === String(partId));
    if (!part) return updateLine(localId, { part_id: partId });
    updateLine(localId, { part_id: partId, description: part.name, unit_price: part.sale_price || "0.00", cost_price: part.cost_price || "0.00" });
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id || null,
        items: form.items.map(({ local_id, part, part_name, part_sku, stock_available, subtotal_amount, total_amount, ...line }) => ({ ...line, part_id: line.part_id || null })),
      };
      if (editing) await api.put(`/attendance/counter-sales/${editing.id}/`, payload);
      else await api.post("/attendance/counter-sales/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openFinalize(item) {
    setFinalizing(item);
    setPayment(emptyPayment(item.balance_amount || item.total_amount));
  }

  async function finalize(event) {
    event.preventDefault();
    try {
      await api.post(`/attendance/counter-sales/${finalizing.id}/finalize/`, payment);
      setFinalizing(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openReceive(item) {
    setReceiving(item);
    setReceive(emptyReceive(item.balance_amount));
  }

  async function registerPayment(event) {
    event.preventDefault();
    try {
      await api.post(`/attendance/counter-sales/${receiving.id}/register-payment/`, { ...receive, paid_at: fromDatetimeLocal(receive.paid_at) });
      setReceiving(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Venda de peça avulsa" subtitle="Venda direta de balcão com baixa automática de estoque e geração de conta a receber." actions={<Button className="btn btn-primary" onClick={() => open()}>Nova venda avulsa</Button>} />
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3"><Card.Body><Row className="g-2"><Col md={6}><SearchAutocompleteInput placeholder="Buscar venda, cliente, peça ou SKU" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["number", "customer_display_name", "customer_name", "status_label", (sale) => (sale.items || []).flatMap((line) => [line.part_name, line.part_sku, line.description])])} /></Col><Col md={3}><Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col><Col md={3}><Button variant="outline-primary" className="w-100" onClick={load}>Buscar</Button></Col></Row></Card.Body></Card>

    <Card className="border-0 shadow-sm"><Card.Body className="p-0">
      {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="fw-semibold">{item.number}</td><td>{item.customer_display_name}</td><td>{money(item.total_amount)}</td><td>{money(item.paid_amount)}</td><td>{money(item.balance_amount)}</td><td><Badge bg={statusVariant[item.status] || "secondary"}>{item.status_label}</Badge></td><td className="text-end"><Button size="sm" variant="outline-secondary" className="me-2" onClick={() => open(item)}>Ver</Button>{item.status === "draft" && <Button size="sm" className="me-2" onClick={() => openFinalize(item)}>Finalizar</Button>}{item.status === "finalized" && Number(item.balance_amount || 0) > 0 && <Button size="sm" onClick={() => openReceive(item)}>Receber</Button>}</td></tr>)}</tbody></Table>}
    </Card.Body></Card>

    <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal">
      <Form onSubmit={save}>
        <Modal.Header closeButton><Modal.Title>{editing ? `Venda ${editing.number}` : "Nova venda avulsa"}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-3 mb-3"><Col md={4}><Form.Label>Cliente cadastrado</Form.Label><Form.Select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">Cliente balcão / não cadastrado</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}</Form.Select></Col><Col md={4}><Form.Label>Nome do cliente balcão</Form.Label><Form.Control value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} /></Col><Col md={2}><Form.Label>Vencimento</Form.Label><Form.Control type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Col><Col md={2}><Form.Label>Desconto geral</Form.Label><MoneyInput value={form.discount_amount} onChange={(value) => setForm({ ...form, discount_amount: value })} /></Col></Row>
          <div className="d-flex justify-content-between align-items-center mb-2"><h6 className="mb-0">Peças vendidas</h6><Button size="sm" variant="outline-primary" onClick={addLine}>Adicionar peça</Button></div>
          <Table responsive bordered><thead><tr><th style={{minWidth: 220}}>Peça</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desconto</th><th>Total</th><th></th></tr></thead><tbody>{form.items.map((line) => <tr key={line.local_id}><td><Form.Select value={line.part_id || ""} onChange={(event) => selectPart(line.local_id, event.target.value)}><option value="">Selecione</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} - {part.name} ({part.stock_quantity})</option>)}</Form.Select></td><td><Form.Control value={line.description} onChange={(event) => updateLine(line.local_id, { description: event.target.value })} /></td><td><Form.Control type="number" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.local_id, { quantity: event.target.value })} /></td><td><MoneyInput value={line.unit_price} onChange={(value) => updateLine(line.local_id, { unit_price: value })} /></td><td><MoneyInput value={line.discount_amount} onChange={(value) => updateLine(line.local_id, { discount_amount: value })} /></td><td>{money(lineTotal(line))}</td><td><Button size="sm" variant="outline-danger" onClick={() => removeLine(line.local_id)}>Remover</Button></td></tr>)}</tbody></Table>
          <Row className="g-3"><Col md={4}><Card className="bg-light border-0"><Card.Body><div className="text-muted small">Subtotal</div><strong>{money(subtotal)}</strong></Card.Body></Card></Col><Col md={4}><Card className="bg-light border-0"><Card.Body><div className="text-muted small">Descontos</div><strong>{money(lineDiscount + decimal(form.discount_amount))}</strong></Card.Body></Card></Col><Col md={4}><Card className="bg-light border-0"><Card.Body><div className="text-muted small">Valor final</div><strong>{money(finalTotal)}</strong></Card.Body></Card></Col></Row>
          <Form.Label className="mt-3">Observações</Form.Label><Form.Control as="textarea" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setShow(false)}>Fechar</Button>{(!editing || editing.status === "draft") && <Button type="submit">Salvar</Button>}</Modal.Footer>
      </Form>
    </Modal>

    <Modal show={!!finalizing} onHide={() => setFinalizing(null)}><Form onSubmit={finalize}><Modal.Header closeButton><Modal.Title>Finalizar venda</Modal.Title></Modal.Header><Modal.Body><p className="text-muted">Ao finalizar, o estoque será baixado e a conta a receber será criada.</p><Form.Label>Valor recebido agora</Form.Label><MoneyInput className="mb-3" value={payment.payment_amount} onChange={(value) => setPayment({ ...payment, payment_amount: value })} /><Form.Label>Forma de pagamento</Form.Label><Form.Select className="mb-3" value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select><Form.Label>Referência</Form.Label><Form.Control value={payment.payment_reference} onChange={(event) => setPayment({ ...payment, payment_reference: event.target.value })} /></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setFinalizing(null)}>Cancelar</Button><Button type="submit">Finalizar</Button></Modal.Footer></Form></Modal>

    <Modal show={!!receiving} onHide={() => setReceiving(null)}><Form onSubmit={registerPayment}><Modal.Header closeButton><Modal.Title>Receber venda avulsa</Modal.Title></Modal.Header><Modal.Body><Form.Label>Valor</Form.Label><MoneyInput className="mb-3" value={receive.amount} onChange={(value) => setReceive({ ...receive, amount: value })} /><Form.Label>Forma</Form.Label><Form.Select className="mb-3" value={receive.method} onChange={(event) => setReceive({ ...receive, method: event.target.value })}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select><Form.Label>Data</Form.Label><Form.Control className="mb-3" type="datetime-local" value={receive.paid_at} onChange={(event) => setReceive({ ...receive, paid_at: event.target.value })} /><Form.Label>Referência</Form.Label><Form.Control value={receive.reference} onChange={(event) => setReceive({ ...receive, reference: event.target.value })} /></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setReceiving(null)}>Cancelar</Button><Button type="submit">Receber</Button></Modal.Footer></Form></Modal>
  </>;
}
