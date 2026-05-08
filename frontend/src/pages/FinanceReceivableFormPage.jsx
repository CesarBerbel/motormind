import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import { dateInputValue, money } from "../workshopOptions";
import SearchableSelect from "../components/SearchableSelect";

const today = () => dateInputValue();
const emptyForm = () => ({
  customer_id: "",
  description: "",
  issue_date: today(),
  due_date: today(),
  amount: "",
  discount_amount: "",
  notes: "",
});

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function FinanceReceivableFormPage({ embedded = false }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [activeTab, setActiveTab] = useState("document");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const finalAmount = Math.max(decimal(form.amount), 0);
  const customerOptions = [
    { value: "", label: "Cliente não cadastrado / cobrança geral" },
    ...contacts.map((contact) => ({
      value: contact.id,
      label: [contact.display_name || contact.full_name, contact.document_number, contact.phone_e164].filter(Boolean).join(" - "),
    })),
  ];

  const tabs = [ 
    { key: "document", label: "Documento", description: "Cliente e descrição" },
    { key: "values", label: "Valores", description: "Datas e cobrança" },
    { key: "notes", label: "Observações", description: "Controle interno" },
  ];

  async function loadReferences() {
    try {
      const { data } = await api.get("/contacts/");
      setContacts(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { loadReferences(); }, []);

  function validateBeforeSave() {
    if (!form.description.trim()) {
      setActiveTab("document");
      setError("Informe a descrição da conta a receber.");
      return false;
    }
    if (finalAmount <= 0) {
      setActiveTab("values");
      setError("Informe um valor maior que zero para a conta a receber.");
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
      const { data } = await api.post("/finance/accounts-receivable/", {
        ...form,
        customer_id: form.customer_id || null,
      });
      navigate("/finance/accounts-receivable");
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
          title="Nova conta a receber"
          subtitle="Crie uma cobrança manual organizada por abas para melhorar a conferência antes de salvar."
          actions={<Link className="btn btn-outline-secondary" to="/finance/accounts-receivable">Voltar para contas</Link>}
        />
        <AreaTabs area="finance" />
      </>
    ) : null}
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Form onSubmit={save} noValidate>
      <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

      <TabPanel activeKey={activeTab} eventKey="document">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Documento de cobrança</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <SearchableSelect
                  label="Cliente"
                  value={form.customer_id}
                  options={customerOptions}
                  onChange={(value) => setForm({ ...form, customer_id: value })}
                  placeholder="Pesquisar cliente"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Descrição</Form.Label>
                <Form.Control required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Sinal de serviço, cobrança manual, ajuste financeiro" />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="values">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Valores e vencimento</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={3}>
                <Form.Label>Emissão</Form.Label>
                <Form.Control required type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} />
              </Col>
              <Col md={3}>
                <Form.Label>Vencimento</Form.Label>
                <Form.Control required type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
              </Col>
              <Col md={3}>
                <Form.Label>Valor da conta</Form.Label>
                <MoneyInput value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
              </Col>
              <Col md={3}>
                <Form.Label>Desconto informativo</Form.Label>
                <MoneyInput value={form.discount_amount} onChange={(value) => setForm({ ...form, discount_amount: value })} />
              </Col>
              <Col md={12}>
                <div className="finance-total-box total"><span>Valor em aberto previsto</span><strong>{money(finalAmount)}</strong></div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="notes">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Observações</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Label>Observações</Form.Label>
                <Form.Control as="textarea" rows={5} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Col>
            </Row>
            <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/finance/accounts-receivable")} saveLabel={saving ? "Salvando..." : "Salvar conta a receber"} saveDisabled={saving} />
          </Card.Body>
        </Card>
      </TabPanel>
    </Form>
  </>;
}
