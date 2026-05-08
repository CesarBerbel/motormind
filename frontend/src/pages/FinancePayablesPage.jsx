import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import SearchableSelect from "../components/SearchableSelect";
import AutocompleteInput from "../components/AutocompleteInput";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions, compactSearchOptions } from "../utils/search";
import { dateInputValue, formatDate, money, payablePaymentMethods, payableRecurrenceTypes, payableStatuses, todayDatetimeLocalValue } from "../workshopOptions";
import { confirmDialog } from "../components/ConfirmDialog";

const statusOptions = [["", "Todos"], ...payableStatuses];
const recurrenceOptions = payableRecurrenceTypes;
const statusVariant = {
  open: "primary",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "secondary",
};

const payableFormTabs = [
  { key: "document", label: "Documento", description: "Fornecedor, categoria e descrição" },
  { key: "values", label: "Valores", description: "Datas, valor e recorrência" },
  { key: "notes", label: "Observações", description: "Controle interno" },
];

function today() {
  return dateInputValue();
}

const emptyForm = () => ({
  supplier_id: "",
  category: "",
  description: "",
  issue_date: today(),
  due_date: today(),
  amount: "",
  recurrence_type: "cash",
  installment_total: "",
  notes: "",
});

const emptyPayment = () => ({
  method: "pix",
  amount: "",
  paid_at: todayDatetimeLocalValue(),
  reference: "",
  notes: "",
});

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function FinancePayablesPage() {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [recurrenceType, setRecurrenceType] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [payment, setPayment] = useState(emptyPayment());
  const [activeTab, setActiveTab] = useState("document");

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (recurrenceType) params.recurrence_type = recurrenceType;
      const [accountsRes, suppliersRes] = await Promise.all([
        api.get("/finance/accounts-payable/", { params }),
        api.get("/purchasing/suppliers/", { params: { active: "true" } }),
      ]);
      setItems(results(accountsRes.data));
      setSuppliers(results(suppliersRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status, recurrenceType]);

  const cards = useMemo(() => {
    const open = items.filter((item) => ["open", "partial", "overdue"].includes(item.status));
    const overdue = items.filter((item) => item.status === "overdue");
    const paid = items.filter((item) => item.status === "paid");
    const openTotal = open.reduce((total, item) => total + Number(item.balance_amount || 0), 0);
    const paidTotal = paid.reduce((total, item) => total + Number(item.paid_amount || 0), 0);
    return [
      ["Em aberto", open.length],
      ["Vencidas", overdue.length],
      ["Saldo em aberto", money(openTotal)],
      ["Pago", money(paidTotal)],
    ];
  }, [items]);

  const supplierOptions = [
    { value: "", label: "Despesa sem fornecedor" },
    ...suppliers.map((supplier) => ({
      value: supplier.id,
      label: [supplier.display_name || supplier.name, supplier.document, supplier.phone].filter(Boolean).join(" - "),
    })),
  ];
  const recurrenceSelectOptions = recurrenceOptions.map(([value, label]) => ({ value, label }));
  const categoryOptions = compactSearchOptions(items.map((item) => item.category)).map((category) => ({ id: category, name: category }));
  const previewInstallments = form.recurrence_type === "installment" ? Math.max(Number(form.installment_total || 1), 1) : 1;
  const previewAmount = decimal(form.amount);
  const previewInstallmentAmount = previewInstallments > 1 ? previewAmount / previewInstallments : previewAmount;

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setActiveTab("document");
    setShow(true);
  }

  function openEdit(item) {
    setEditing(item);
    setActiveTab("document");
    setForm({
      supplier_id: item.supplier || "",
      category: item.category || "",
      description: item.description || "",
      issue_date: item.issue_date || today(),
      due_date: item.due_date || today(),
      amount: item.amount || "0.00",
      recurrence_type: item.recurrence_type || "cash",
      installment_total: item.installment_total || 1,
      notes: item.notes || "",
    });
    setShow(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        category: (form.category || "").trim(),
        description: (form.description || "").trim(),
        installment_total: form.recurrence_type === "installment" ? Number(form.installment_total || 1) : 1,
      };
      if (editing) await api.patch(`/finance/accounts-payable/${editing.id}/`, payload);
      else await api.post("/finance/accounts-payable/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openPayment(item) {
    setPaying(item);
    setPayment({ ...emptyPayment(), amount: item.balance_amount || "0.00" });
  }

  async function savePayment(event) {
    event.preventDefault();
    try {
      const payload = { ...payment, paid_at: payment.paid_at || undefined };
      await api.post(`/finance/accounts-payable/${paying.id}/register_payment/`, payload);
      setPaying(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function refresh(item) {
    try {
      await api.post(`/finance/accounts-payable/${item.id}/refresh/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function generateNextFixed(item) {
    try {
      await api.post(`/finance/accounts-payable/${item.id}/generate_next_fixed/`, {});
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function cancel(item) {
    if (!(await confirmDialog(`Cancelar a conta ${item.number}?`))) return;
    try {
      await api.post(`/finance/accounts-payable/${item.id}/cancel/`, {});
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Financeiro - contas a pagar" subtitle="Despesas de fornecedores, aluguel, luz, funcionários, contas parceladas e contas fixas mensais.">
      <Button onClick={openCreate}>Nova conta a pagar</Button>
    </PageHeader>
    <AreaTabs area="finance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Row className="g-3 mb-3">
      {cards.map(([label, value]) => <Col md={3} key={label}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>)}
    </Row>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-center">
          <Col md={5}>
            <SearchAutocompleteInput
              placeholder="Buscar por conta, fornecedor, categoria ou descrição"
              value={search}
              onChange={setSearch}
              onSearch={load}
              suggestions={buildSearchSuggestions(items, ["number", "supplier_name", "category", "description", "origin_label", "status_label"])}
            />
          </Col>
          <Col md={2}><Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col>
          <Col md={3}><Form.Select value={recurrenceType} onChange={(event) => setRecurrenceType(event.target.value)}><option value="">Todos os tipos</option>{recurrenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col>
          <Col md={2}><Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button></Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0 align-middle">
          <thead><tr><th>Conta</th><th>Origem</th><th>Tipo</th><th>Fornecedor</th><th>Descrição</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th></th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td className="fw-semibold">{item.number}</td>
            <td>{item.origin_label}</td>
            <td>{item.recurrence_type_label}{item.installment_total > 1 ? ` ${item.installment_number}/${item.installment_total}` : ""}</td>
            <td>{item.supplier_name || "-"}</td>
            <td>{item.purchase_order ? <Link to="/purchasing/purchase-orders">{item.description}</Link> : item.description}</td>
            <td>{formatDate(item.due_date)}</td>
            <td>{money(item.amount)}</td>
            <td>{money(item.paid_amount)}</td>
            <td>{money(item.balance_amount)}</td>
            <td><Badge bg={statusVariant[item.status] || "secondary"}>{item.status_label}</Badge></td>
            <td className="text-end text-nowrap">
              <Button size="sm" variant="outline-secondary" className="me-2" onClick={() => refresh(item)}>Atualizar</Button>
              {item.origin !== "purchase_order" && <Button size="sm" variant="outline-primary" className="me-2" onClick={() => openEdit(item)}>Editar</Button>}
              {Number(item.balance_amount || 0) > 0 && item.status !== "cancelled" && <Button size="sm" className="me-2" onClick={() => openPayment(item)}>Pagar</Button>}
              {item.recurrence_type === "fixed_monthly" && <Button size="sm" variant="outline-success" className="me-2" onClick={() => generateNextFixed(item)}>Gerar próxima</Button>}
              {item.status !== "cancelled" && Number(item.paid_amount || 0) === 0 && <Button size="sm" variant="outline-danger" onClick={() => cancel(item)}>Cancelar</Button>}
            </td>
          </tr>)}</tbody>
        </Table>}
      </Card.Body>
    </Card>

    <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal">
      <Form onSubmit={save}>
        <Modal.Header closeButton><Modal.Title>{editing ? "Editar" : "Nova"} conta a pagar</Modal.Title></Modal.Header>
        <Modal.Body>
          <FormTabs tabs={payableFormTabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />

          <TabPanel activeKey={activeTab} eventKey="document">
            <Card className="form-section-card mb-3">
              <Card.Body>
                <div className="form-section-title">Documento financeiro</div>
                <Row className="g-3">
                  <Col md={6}>
                    <SearchableSelect
                      label="Fornecedor opcional"
                      value={form.supplier_id || ""}
                      options={supplierOptions}
                      onChange={(value) => update({ supplier_id: value })}
                      placeholder="Pesquisar fornecedor"
                    />
                  </Col>
                  <Col md={6}>
                    <AutocompleteInput
                      label="Categoria"
                      value={form.category}
                      options={categoryOptions}
                      onChange={(value) => update({ category: value })}
                      placeholder="Ex.: aluguel, luz, funcionário, imposto"
                      emptyMessage="Digite uma nova categoria ou escolha uma já usada."
                    />
                  </Col>
                  <Col md={12}>
                    <Form.Label>Descrição</Form.Label>
                    <Form.Control required value={form.description} onChange={(event) => update({ description: event.target.value })} placeholder="Ex.: Aluguel da oficina, compra de material, imposto mensal" />
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="values">
            <Card className="form-section-card mb-3">
              <Card.Body>
                <div className="form-section-title">Valores e recorrência</div>
                <Row className="g-3">
                  <Col md={3}><Form.Label>Emissão</Form.Label><Form.Control type="date" value={form.issue_date} onChange={(event) => update({ issue_date: event.target.value })} /></Col>
                  <Col md={3}><Form.Label>Vencimento inicial</Form.Label><Form.Control type="date" value={form.due_date} onChange={(event) => update({ due_date: event.target.value })} /></Col>
                  <Col md={3}><Form.Label>Valor total</Form.Label><MoneyInput value={form.amount} onChange={(value) => update({ amount: value })} /></Col>
                  <Col md={3}>
                    <SearchableSelect
                      label="Tipo"
                      value={form.recurrence_type}
                      options={recurrenceSelectOptions}
                      onChange={(value) => update({ recurrence_type: value, installment_total: value === "installment" ? form.installment_total : "" })}
                      disabled={!!editing}
                      placeholder="Pesquisar tipo"
                    />
                  </Col>
                  {form.recurrence_type === "installment" && <Col md={4}><Form.Label>Quantidade de parcelas</Form.Label><Form.Control disabled={!!editing} type="number" min="2" value={form.installment_total} onChange={(event) => update({ installment_total: event.target.value })} /></Col>}
                  <Col md={form.recurrence_type === "installment" ? 8 : 12}>
                    <div className="finance-total-box total h-100"><span>{form.recurrence_type === "installment" ? `Prévia por parcela (${previewInstallments}x)` : "Valor previsto"}</span><strong>{money(previewInstallmentAmount)}</strong></div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="notes">
            <Card className="form-section-card mb-3">
              <Card.Body>
                <div className="form-section-title">Observações internas</div>
                <Form.Control as="textarea" rows={5} value={form.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Histórico, referência interna, combinado com fornecedor ou contexto administrativo." />
              </Card.Body>
            </Card>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={payableFormTabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar conta a pagar" />
      </Form>
    </Modal>

    <Modal show={!!paying} onHide={() => setPaying(null)}>
      <Form onSubmit={savePayment}>
        <Modal.Header closeButton><Modal.Title>Registrar pagamento</Modal.Title></Modal.Header>
        <Modal.Body>
          {paying && <div className="form-muted-box mb-3 small">Conta {paying.number} - saldo {money(paying.balance_amount)}</div>}
          <Row className="g-3">
            <Col md={6}><Form.Label>Valor pago</Form.Label><MoneyInput value={payment.amount} onChange={(value) => setPayment({ ...payment, amount: value })} /></Col>
            <Col md={6}><Form.Label>Forma de pagamento</Form.Label><Form.Select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>{payablePaymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col>
            <Col md={6}><Form.Label>Data do pagamento</Form.Label><Form.Control type="datetime-local" value={payment.paid_at} onChange={(event) => setPayment({ ...payment, paid_at: event.target.value })} /></Col>
            <Col md={6}><Form.Label>Referência</Form.Label><Form.Control value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></Col>
            <Col md={12}><Form.Label>Observações</Form.Label><Form.Control as="textarea" rows={3} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} /></Col>
          </Row>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setPaying(null)}>Cancelar</Button><Button type="submit">Salvar pagamento</Button></Modal.Footer>
      </Form>
    </Modal>
  </>;
}
