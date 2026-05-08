import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { dateInputValue, formatDate, money } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";

const emptyEstimate = () => ({ customer_id: "", vehicle_id: "", title: "", complaint: "", diagnosis: "", internal_notes: "", customer_notes: "", valid_until: dateInputValue(), discount_amount: "", services: [], parts: [] });
const emptyService = () => ({ local_id: crypto.randomUUID(), service_id: "", description: "", quantity: "", unit_price: "", discount_amount: "", notes: "" });
const emptyPart = () => ({ local_id: crypto.randomUUID(), part_id: "", description: "", quantity: "", unit_price: "", cost_price: "", discount_amount: "", notes: "" });
const statusOptions = [["", "Todos"], ["draft", "Rascunho"], ["sent", "Enviado"], ["approved", "Aprovado"], ["rejected", "Rejeitado"], ["converted", "Convertido"], ["cancelled", "Cancelado"]];
const statusVariant = { draft: "secondary", sent: "info", approved: "success", rejected: "danger", expired: "warning", converted: "primary", cancelled: "dark" };
function decimal(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function lineSubtotal(line) { return decimal(line.quantity) * decimal(line.unit_price); }
function lineTotal(line) { return Math.max(lineSubtotal(line) - decimal(line.discount_amount), 0); }

export default function EstimatesPage() {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyEstimate());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const vehiclesForCustomer = useMemo(() => vehicles.filter((vehicle) => String(vehicle.customer?.id) === String(form.customer_id)), [vehicles, form.customer_id]);
  const subtotalServices = useMemo(() => form.services.reduce((total, line) => total + lineSubtotal(line), 0), [form.services]);
  const subtotalParts = useMemo(() => form.parts.reduce((total, line) => total + lineSubtotal(line), 0), [form.parts]);
  const itemDiscounts = useMemo(() => [...form.services, ...form.parts].reduce((total, line) => total + decimal(line.discount_amount), 0), [form.services, form.parts]);
  const finalTotal = Math.max(subtotalServices + subtotalParts - itemDiscounts - decimal(form.discount_amount), 0);

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const [estimateRes, contactRes, vehicleRes, serviceRes, partRes] = await Promise.all([
        api.get("/attendance/estimates/", { params }),
        api.get("/contacts/"),
        api.get("/workshop/vehicles/", { params: { active: "true" } }),
        api.get("/workshop/services/", { params: { active: "true" } }),
        api.get("/workshop/parts/", { params: { active: "true" } }),
      ]);
      setItems(results(estimateRes.data));
      setContacts(results(contactRes.data));
      setVehicles(results(vehicleRes.data));
      setServices(results(serviceRes.data));
      setParts(results(partRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status]);

  function open(item = null) {
    setEditing(item);
    setForm(item ? {
      customer_id: item.customer?.id || "",
      vehicle_id: item.vehicle?.id || "",
      title: item.title || "",
      complaint: item.complaint || "",
      diagnosis: item.diagnosis || "",
      internal_notes: item.internal_notes || "",
      customer_notes: item.customer_notes || "",
      valid_until: item.valid_until || "",
      discount_amount: item.discount_amount || "0.00",
      services: (item.services || []).map((line) => ({ ...line, local_id: crypto.randomUUID(), service_id: line.service || "" })),
      parts: (item.parts || []).map((line) => ({ ...line, local_id: crypto.randomUUID(), part_id: line.part || "" })),
    } : emptyEstimate());
    setShow(true);
  }

  function addService() { setForm((current) => ({ ...current, services: [...current.services, emptyService()] })); }
  function addPart() { setForm((current) => ({ ...current, parts: [...current.parts, emptyPart()] })); }
  function removeService(localId) { setForm((current) => ({ ...current, services: current.services.filter((line) => line.local_id !== localId) })); }
  function removePart(localId) { setForm((current) => ({ ...current, parts: current.parts.filter((line) => line.local_id !== localId) })); }
  function updateService(localId, patch) { setForm((current) => ({ ...current, services: current.services.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function updatePart(localId, patch) { setForm((current) => ({ ...current, parts: current.parts.map((line) => line.local_id === localId ? { ...line, ...patch } : line) })); }
  function selectService(localId, serviceId) { const service = services.find((item) => String(item.id) === String(serviceId)); updateService(localId, service ? { service_id: serviceId, description: service.name, unit_price: service.default_unit_price || "0.00" } : { service_id: serviceId }); }
  function selectPart(localId, partId) { const part = parts.find((item) => String(item.id) === String(partId)); updatePart(localId, part ? { part_id: partId, description: part.name, unit_price: part.sale_price || "0.00", cost_price: part.cost_price || "0.00" } : { part_id: partId }); }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        vehicle_id: form.vehicle_id || null,
        services: form.services.map(({ local_id, service, service_name, subtotal_amount, total_amount, ...line }) => ({ ...line, service_id: line.service_id || null })),
        parts: form.parts.map(({ local_id, part, part_name, part_sku, stock_available, subtotal_amount, total_amount, ...line }) => ({ ...line, part_id: line.part_id || null })),
      };
      if (editing) await api.put(`/attendance/estimates/${editing.id}/`, payload);
      else await api.post("/attendance/estimates/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function changeStatus(item, newStatus) {
    try {
      await api.post(`/attendance/estimates/${item.id}/change-status/`, { status: newStatus });
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function convert(item) {
    try {
      const { data } = await api.post(`/attendance/estimates/${item.id}/convert-to-work-order/`, {});
      await load();
      window.location.href = `/work-orders/${data.id}`;
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Orçamentos" subtitle="Fluxo comercial do atendimento: montar orçamento, enviar, aprovar, rejeitar e converter em OS." actions={<Button className="btn btn-primary" onClick={() => open()}>Novo orçamento</Button>} />
    <AreaTabs area="attendance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3"><Card.Body><Row className="g-2"><Col md={6}><SearchAutocompleteInput placeholder="Buscar orçamento, cliente, placa ou descrição" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["number", "customer_name", "vehicle_display", "title", "complaint", "status_label"])} /></Col><Col md={3}><Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Col><Col md={3}><Button variant="outline-primary" className="w-100" onClick={load}>Buscar</Button></Col></Row></Card.Body></Card>

    <Card className="border-0 shadow-sm"><Card.Body className="p-0">
      {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Cliente</th><th>Veículo</th><th>Total</th><th>Validade</th><th>Status</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="fw-semibold">{item.number}</td><td>{item.customer_name}</td><td>{item.vehicle_display}</td><td>{money(item.total_amount)}</td><td>{formatDate(item.valid_until)}</td><td><Badge bg={statusVariant[item.status] || "secondary"}>{item.status_label}</Badge></td><td className="text-end"><Button size="sm" variant="outline-secondary" className="me-2" onClick={() => open(item)}>Ver</Button>{["draft"].includes(item.status) && <Button size="sm" variant="outline-info" className="me-2" onClick={() => changeStatus(item, "sent")}>Enviar</Button>}{["draft", "sent"].includes(item.status) && <Button size="sm" variant="outline-success" className="me-2" onClick={() => changeStatus(item, "approved")}>Aprovar</Button>}{["draft", "sent", "approved"].includes(item.status) && <Button size="sm" className="me-2" onClick={() => convert(item)}>Converter em OS</Button>}{item.converted_work_order && <Link className="btn btn-sm btn-outline-primary" to={`/work-orders/${item.converted_work_order}`}>Abrir OS</Link>}</td></tr>)}</tbody></Table>}
    </Card.Body></Card>

    <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal"><Form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editing ? `Orçamento ${editing.number}` : "Novo orçamento"}</Modal.Title></Modal.Header><Modal.Body>
      <Row className="g-3"><Col md={4}><Form.Label>Cliente</Form.Label><Form.Select required value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value, vehicle_id: "" })}><option value="">Selecione</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}</Form.Select></Col><Col md={4}><Form.Label>Veículo</Form.Label><Form.Select value={form.vehicle_id} onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })}><option value="">Sem veículo</option>{vehiclesForCustomer.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.display_name}</option>)}</Form.Select></Col><Col md={2}><Form.Label>Validade</Form.Label><Form.Control type="date" value={form.valid_until || ""} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></Col><Col md={2}><Form.Label>Desconto geral</Form.Label><MoneyInput value={form.discount_amount} onChange={(value) => setForm({ ...form, discount_amount: value })} /></Col></Row>
      <Row className="g-3 mt-1"><Col md={6}><Form.Label>Título</Form.Label><Form.Control required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Col><Col md={6}><Form.Label>Queixa / solicitação</Form.Label><Form.Control value={form.complaint} onChange={(event) => setForm({ ...form, complaint: event.target.value })} /></Col></Row>
      <Form.Label className="mt-3">Diagnóstico/observação preliminar</Form.Label><Form.Control as="textarea" rows={2} value={form.diagnosis} onChange={(event) => setForm({ ...form, diagnosis: event.target.value })} />

      <div className="d-flex justify-content-between align-items-center mt-4 mb-2"><h6 className="mb-0">Serviços</h6><Button size="sm" variant="outline-primary" onClick={addService}>Adicionar serviço</Button></div>
      <Table responsive bordered><thead><tr><th>Serviço</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desc.</th><th>Total</th><th></th></tr></thead><tbody>{form.services.map((line) => <tr key={line.local_id}><td><Form.Select value={line.service_id || ""} onChange={(event) => selectService(line.local_id, event.target.value)}><option value="">Selecione</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Form.Select></td><td><Form.Control value={line.description} onChange={(event) => updateService(line.local_id, { description: event.target.value })} /></td><td><Form.Control type="number" step="0.01" value={line.quantity} onChange={(event) => updateService(line.local_id, { quantity: event.target.value })} /></td><td><MoneyInput value={line.unit_price} onChange={(value) => updateService(line.local_id, { unit_price: value })} /></td><td><MoneyInput value={line.discount_amount} onChange={(value) => updateService(line.local_id, { discount_amount: value })} /></td><td>{money(lineTotal(line))}</td><td><Button size="sm" variant="outline-danger" onClick={() => removeService(line.local_id)}>Remover</Button></td></tr>)}</tbody></Table>

      <div className="d-flex justify-content-between align-items-center mt-4 mb-2"><h6 className="mb-0">Peças</h6><Button size="sm" variant="outline-primary" onClick={addPart}>Adicionar peça</Button></div>
      <Table responsive bordered><thead><tr><th>Peça</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Desc.</th><th>Total</th><th></th></tr></thead><tbody>{form.parts.map((line) => <tr key={line.local_id}><td><Form.Select value={line.part_id || ""} onChange={(event) => selectPart(line.local_id, event.target.value)}><option value="">Selecione</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} - {part.name} ({part.stock_quantity})</option>)}</Form.Select></td><td><Form.Control value={line.description} onChange={(event) => updatePart(line.local_id, { description: event.target.value })} /></td><td><Form.Control type="number" step="0.01" value={line.quantity} onChange={(event) => updatePart(line.local_id, { quantity: event.target.value })} /></td><td><MoneyInput value={line.unit_price} onChange={(value) => updatePart(line.local_id, { unit_price: value })} /></td><td><MoneyInput value={line.discount_amount} onChange={(value) => updatePart(line.local_id, { discount_amount: value })} /></td><td>{money(lineTotal(line))}</td><td><Button size="sm" variant="outline-danger" onClick={() => removePart(line.local_id)}>Remover</Button></td></tr>)}</tbody></Table>
      <Row className="g-3"><Col md={3}><Card className="bg-light border-0"><Card.Body><div className="small text-muted">Serviços</div><strong>{money(subtotalServices)}</strong></Card.Body></Card></Col><Col md={3}><Card className="bg-light border-0"><Card.Body><div className="small text-muted">Peças</div><strong>{money(subtotalParts)}</strong></Card.Body></Card></Col><Col md={3}><Card className="bg-light border-0"><Card.Body><div className="small text-muted">Descontos</div><strong>{money(itemDiscounts + decimal(form.discount_amount))}</strong></Card.Body></Card></Col><Col md={3}><Card className="bg-light border-0"><Card.Body><div className="small text-muted">Total previsto</div><strong>{money(finalTotal)}</strong></Card.Body></Card></Col></Row>
      <Row className="g-3 mt-1"><Col md={6}><Form.Label>Observações internas</Form.Label><Form.Control as="textarea" rows={3} value={form.internal_notes} onChange={(event) => setForm({ ...form, internal_notes: event.target.value })} /></Col><Col md={6}><Form.Label>Observações para o cliente</Form.Label><Form.Control as="textarea" rows={3} value={form.customer_notes} onChange={(event) => setForm({ ...form, customer_notes: event.target.value })} /></Col></Row>
    </Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setShow(false)}>Fechar</Button>{(!editing || ["draft", "sent"].includes(editing.status)) && <Button type="submit">Salvar</Button>}</Modal.Footer></Form></Modal>
  </>;
}
