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
import { dateInputValue, money } from "../workshopOptions";

const emptyEstimate = () => ({
  customer_id: "",
  vehicle_id: "",
  title: "",
  complaint: "",
  diagnosis: "",
  internal_notes: "",
  customer_notes: "",
  valid_until: dateInputValue(),
  discount_amount: "",
  services: [],
  parts: [],
});
const emptyService = () => ({ local_id: crypto.randomUUID(), service_id: "", description: "", quantity: "", unit_price: "", discount_amount: "", notes: "" });
const emptyPart = () => ({ local_id: crypto.randomUUID(), part_id: "", description: "", quantity: "", unit_price: "", cost_price: "", discount_amount: "", notes: "" });

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function lineSubtotal(line) { return decimal(line.quantity) * decimal(line.unit_price); }
function lineTotal(line) { return Math.max(lineSubtotal(line) - decimal(line.discount_amount), 0); }

export default function EstimateFormPage({ embedded = false }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptyEstimate());
  const [activeTab, setActiveTab] = useState("customer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const vehiclesForCustomer = useMemo(
    () => vehicles.filter((vehicle) => String(vehicle.customer?.id) === String(form.customer_id)),
    [vehicles, form.customer_id]
  );
  const subtotalServices = useMemo(() => form.services.reduce((total, line) => total + lineSubtotal(line), 0), [form.services]);
  const subtotalParts = useMemo(() => form.parts.reduce((total, line) => total + lineSubtotal(line), 0), [form.parts]);
  const itemDiscounts = useMemo(() => [...form.services, ...form.parts].reduce((total, line) => total + decimal(line.discount_amount), 0), [form.services, form.parts]);
  const finalTotal = Math.max(subtotalServices + subtotalParts - itemDiscounts - decimal(form.discount_amount), 0);

  const tabs = [
    { key: "customer", label: "Cliente", description: "Dados principais" },
    { key: "services", label: "Serviços", description: "Mão de obra", badge: form.services.length || "" },
    { key: "parts", label: "Peças", description: "Materiais e peças", badge: form.parts.length || "" },
    { key: "summary", label: "Resumo", description: "Valores e observações" },
  ];

  async function loadReferences() {
    try {
      const [contactRes, vehicleRes, serviceRes, partRes] = await Promise.all([
        api.get("/contacts/"),
        api.get("/workshop/vehicles/", { params: { active: "true" } }),
        api.get("/workshop/services/", { params: { active: "true" } }),
        api.get("/workshop/parts/", { params: { active: "true" } }),
      ]);
      setContacts(results(contactRes.data));
      setVehicles(results(vehicleRes.data));
      setServices(results(serviceRes.data));
      setParts(results(partRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { loadReferences(); }, []);

  function addService() { setForm((current) => ({ ...current, services: [...current.services, emptyService()] })); }
  function addPart() { setForm((current) => ({ ...current, parts: [...current.parts, emptyPart()] })); }
  function removeService(localId) { setForm((current) => ({ ...current, services: current.services.filter((line) => line.local_id !== localId) })); }
  function removePart(localId) { setForm((current) => ({ ...current, parts: current.parts.filter((line) => line.local_id !== localId) })); }
  function updateService(localId, patch) { setForm((current) => ({ ...current, services: current.services.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function updatePart(localId, patch) { setForm((current) => ({ ...current, parts: current.parts.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function selectService(localId, serviceId) {
    const service = services.find((item) => String(item.id) === String(serviceId));
    updateService(localId, service ? { service_id: serviceId, description: service.name, unit_price: service.default_unit_price || "0.00" } : { service_id: serviceId });
  }
  function selectPart(localId, partId) {
    const part = parts.find((item) => String(item.id) === String(partId));
    updatePart(localId, part ? { part_id: partId, description: part.name, unit_price: part.sale_price || "0.00", cost_price: part.cost_price || "0.00" } : { part_id: partId });
  }

  function validateBeforeSave() {
    if (!form.customer_id) {
      setActiveTab("customer");
      setError("Selecione o cliente antes de salvar o orçamento.");
      return false;
    }
    if (!form.title.trim()) {
      setActiveTab("customer");
      setError("Informe o título do orçamento antes de salvar.");
      return false;
    }
    if (form.services.length === 0 && form.parts.length === 0) {
      setActiveTab("services");
      setError("Inclua pelo menos um serviço ou uma peça no orçamento.");
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
        vehicle_id: form.vehicle_id || null,
        services: form.services.map(({ local_id, ...line }) => ({ ...line, service_id: line.service_id || null })),
        parts: form.parts.map(({ local_id, ...line }) => ({ ...line, part_id: line.part_id || null })),
      };
      const { data } = await api.post("/attendance/estimates/", payload);
      navigate("/attendance/estimates");
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
          title="Novo orçamento"
          subtitle="Monte o orçamento por abas: cliente, serviços, peças e resumo financeiro."
          actions={<Link className="btn btn-outline-secondary" to="/attendance/estimates">Voltar para orçamentos</Link>}
        />
        <AreaTabs area="attendance" />
      </>
    ) : null}
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Form onSubmit={save} noValidate>
      <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

      <TabPanel activeKey={activeTab} eventKey="customer">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Dados principais</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Cliente</Form.Label>
                <Form.Select required value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value, vehicle_id: "" })}>
                  <option value="">Selecione</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Veículo</Form.Label>
                <Form.Select value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })} disabled={!form.customer_id}>
                  <option value="">Sem veículo / selecionar depois</option>
                  {vehiclesForCustomer.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.display_name}</option>)}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Validade</Form.Label>
                <Form.Control type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Label>Título do orçamento</Form.Label>
                <Form.Control required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Revisão completa com troca de peças" />
              </Col>
              <Col md={6}>
                <Form.Label>Queixa / solicitação do cliente</Form.Label>
                <Form.Control as="textarea" rows={4} value={form.complaint} onChange={(event) => setForm({ ...form, complaint: event.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Diagnóstico prévio</Form.Label>
                <Form.Control as="textarea" rows={4} value={form.diagnosis} onChange={(event) => setForm({ ...form, diagnosis: event.target.value })} />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="services">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Serviços do orçamento</span>
            <Button size="sm" variant="outline-primary" type="button" onClick={addService}>Adicionar serviço</Button>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive bordered className="mb-0 align-middle">
              <thead><tr><th style={{ minWidth: 240 }}>Serviço</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desconto</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {form.services.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Nenhum serviço adicionado.</td></tr>}
                {form.services.map((line) => <tr key={line.local_id}>
                  <td><Form.Select value={line.service_id || ""} onChange={(event) => selectService(line.local_id, event.target.value)}><option value="">Serviço manual</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Form.Select></td>
                  <td><Form.Control value={line.description} onChange={(event) => updateService(line.local_id, { description: event.target.value })} /></td>
                  <td><Form.Control type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateService(line.local_id, { quantity: event.target.value })} /></td>
                  <td><MoneyInput value={line.unit_price} onChange={(value) => updateService(line.local_id, { unit_price: value })} /></td>
                  <td><MoneyInput value={line.discount_amount} onChange={(value) => updateService(line.local_id, { discount_amount: value })} /></td>
                  <td>{money(lineTotal(line))}</td>
                  <td><Button size="sm" variant="outline-danger" type="button" onClick={() => removeService(line.local_id)}>Remover</Button></td>
                </tr>)}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="parts">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Peças do orçamento</span>
            <Button size="sm" variant="outline-primary" type="button" onClick={addPart}>Adicionar peça</Button>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive bordered className="mb-0 align-middle">
              <thead><tr><th style={{ minWidth: 240 }}>Peça</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desconto</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {form.parts.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Nenhuma peça adicionada.</td></tr>}
                {form.parts.map((line) => <tr key={line.local_id}>
                  <td><Form.Select value={line.part_id || ""} onChange={(event) => selectPart(line.local_id, event.target.value)}><option value="">Peça manual</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} - {part.name} ({part.stock_quantity})</option>)}</Form.Select></td>
                  <td><Form.Control value={line.description} onChange={(event) => updatePart(line.local_id, { description: event.target.value })} /></td>
                  <td><Form.Control type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updatePart(line.local_id, { quantity: event.target.value })} /></td>
                  <td><MoneyInput value={line.unit_price} onChange={(value) => updatePart(line.local_id, { unit_price: value })} /></td>
                  <td><MoneyInput value={line.discount_amount} onChange={(value) => updatePart(line.local_id, { discount_amount: value })} /></td>
                  <td>{money(lineTotal(line))}</td>
                  <td><Button size="sm" variant="outline-danger" type="button" onClick={() => removePart(line.local_id)}>Remover</Button></td>
                </tr>)}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      </TabPanel>

      <TabPanel activeKey={activeTab} eventKey="summary">
        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Resumo financeiro e observações</Card.Header>
          <Card.Body>
            <Row className="g-3 mb-3">
              <Col md={3}><div className="finance-total-box"><span>Subtotal serviços</span><strong>{money(subtotalServices)}</strong></div></Col>
              <Col md={3}><div className="finance-total-box"><span>Subtotal peças</span><strong>{money(subtotalParts)}</strong></div></Col>
              <Col md={3}><Form.Label>Desconto geral</Form.Label><MoneyInput value={form.discount_amount} onChange={(value) => setForm({ ...form, discount_amount: value })} /></Col>
              <Col md={3}><div className="finance-total-box total"><span>Total previsto</span><strong>{money(finalTotal)}</strong></div></Col>
              <Col md={6}><Form.Label>Observações internas</Form.Label><Form.Control as="textarea" rows={3} value={form.internal_notes} onChange={(event) => setForm({ ...form, internal_notes: event.target.value })} /></Col>
              <Col md={6}><Form.Label>Observações para o cliente</Form.Label><Form.Control as="textarea" rows={3} value={form.customer_notes} onChange={(event) => setForm({ ...form, customer_notes: event.target.value })} /></Col>
            </Row>
            <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/attendance/estimates")} saveLabel={saving ? "Salvando..." : "Salvar orçamento"} saveDisabled={saving} />
          </Card.Body>
        </Card>
      </TabPanel>
    </Form>
  </>;
}
