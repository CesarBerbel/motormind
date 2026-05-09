import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import CepLookupButton from "../components/CepLookupButton";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import { dateInputValue, formatDate, maskCep, maskCpfCnpj } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import PhoneInputBR from "../components/PhoneInputBR";
import { maskBrazilPhone, normalizeBrazilPhoneToE164 } from "../utils/phone";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = () => ({
  person_type: "company",
  name: "",
  last_name: "",
  trade_name: "",
  document: "",
  state_registration: "",
  municipal_registration: "",
  birth_date: "",
  email: "",
  phone: "",
  secondary_phone: "",
  contact_person: "",
  zip_code: "",
  address_line: "",
  address_number: "",
  address_complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
  address: "",
  notes: "",
  custom_data_text: "{}",
  is_active: true,
});

const tabs = [
  { key: "identification", label: "Identificação", description: "PF/PJ, CPF/CNPJ e dados básicos" },
  { key: "contact", label: "Contato", description: "Email, telefones e responsável" },
  { key: "address", label: "Endereço", description: "Endereço brasileiro completo" },
  { key: "extra", label: "Observações", description: "Status, legado e dados extras" },
];

function normalizeSupplier(item) {
  return {
    person_type: item.person_type || "company",
    name: item.name || "",
    last_name: item.last_name || "",
    trade_name: item.trade_name || "",
    document: item.document || "",
    state_registration: item.state_registration || "",
    municipal_registration: item.municipal_registration || "",
    birth_date: item.birth_date || "",
    email: item.email || "",
    phone: maskBrazilPhone(item.phone || ""),
    secondary_phone: maskBrazilPhone(item.secondary_phone || ""),
    contact_person: item.contact_person || "",
    zip_code: item.zip_code || "",
    address_line: item.address_line || "",
    address_number: item.address_number || "",
    address_complement: item.address_complement || "",
    district: item.district || "",
    city: item.city || "",
    state: item.state || "",
    country: item.country || "Brasil",
    address: item.address || "",
    notes: item.notes || "",
    custom_data_text: JSON.stringify(item.custom_data || {}, null, 2),
    is_active: !!item.is_active,
  };
}

function supplierSearchSuggestion(supplier) {
  const title = supplier.display_name || supplier.full_name || supplier.name || "Fornecedor sem nome";
  const personType = supplier.person_type_label || (supplier.person_type === "company" ? "Pessoa jurídica" : "Pessoa física");
  const status = supplier.is_active ? "Ativo" : "Inativo";
  const contact = [supplier.email, supplier.phone ? maskBrazilPhone(supplier.phone) : "", supplier.secondary_phone ? maskBrazilPhone(supplier.secondary_phone) : ""].filter(Boolean).join(" • ");
  const location = [supplier.city, supplier.state].filter(Boolean).join(" / ");

  return {
    key: supplier.id,
    label: title,
    value: title,
    description: [personType, supplier.document, contact].filter(Boolean).join(" • "),
    meta: [supplier.trade_name, supplier.contact_person ? `Contato: ${supplier.contact_person}` : "", location, status].filter(Boolean).join(" • "),
    payload: supplier,
    searchText: [
      title,
      supplier.full_name,
      supplier.name,
      supplier.last_name,
      supplier.trade_name,
      supplier.document,
      supplier.email,
      supplier.phone,
      supplier.secondary_phone,
      supplier.contact_person,
      supplier.city,
      supplier.state,
      status,
      personType,
    ].filter(Boolean).join(" "),
  };
}

function buildSupplierSearchSuggestions(suppliers) {
  return (suppliers || []).map(supplierSearchSuggestion);
}

export default function SuppliersPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [activeTab, setActiveTab] = useState("identification");

  async function load(nextSearch = search) {
    const normalizedSearch = String(nextSearch || "").trim();

    try {
      const params = {};
      if (normalizedSearch) params.search = normalizedSearch;
      const response = await api.get("/purchasing/suppliers/", { params });
      setItems(results(response.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  function clearSearch() {
    setSearch("");
    load("");
  }

  function selectSupplierSuggestion(suggestion, nextValue) {
    const selectedSupplier = suggestion?.payload;
    setSearch(nextValue || "");

    if (selectedSupplier?.id) {
      setItems([selectedSupplier]);
      return;
    }

    load(nextValue);
  }

  useEffect(() => { load(); }, []);

  function open(item = null) {
    setEditing(item);
    setForm(item ? normalizeSupplier(item) : empty());
    setActiveTab("identification");
    setShow(true);
  }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    let customData = {};
    try {
      customData = JSON.parse(form.custom_data_text || "{}");
    } catch {
      setError("Dados extras deve ser um JSON válido.");
      setActiveTab("extra");
      return;
    }
    const payload = {
      ...form,
      email: form.email.trim(),
      phone: normalizeBrazilPhoneToE164(form.phone),
      secondary_phone: normalizeBrazilPhoneToE164(form.secondary_phone),
      document: maskCpfCnpj(form.document),
      zip_code: maskCep(form.zip_code),
      state: form.state.trim().toUpperCase(),
      birth_date: form.birth_date || null,
      custom_data: customData,
    };
    delete payload.custom_data_text;
    if (payload.person_type === "company") payload.last_name = "";
    try {
      if (editing) await api.put(`/purchasing/suppliers/${editing.id}/`, payload);
      else await api.post("/purchasing/suppliers/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir fornecedor ${item.display_name || item.name}?`))) return;
    try {
      await api.delete(`/purchasing/suppliers/${item.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  const isCompany = form.person_type === "company";

  return <>
    <PageHeader title="Fornecedores" subtitle="Cadastro completo de fornecedores brasileiros, com PF/PJ, CPF/CNPJ, endereço e dados fiscais.">
      <Button onClick={() => open()}>Novo fornecedor</Button>
    </PageHeader>
    <AreaTabs area="stock" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col md={10}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput
              placeholder="Buscar por nome, razão social, CPF/CNPJ, email, telefone, cidade, UF, contato ou status"
              value={search}
              onChange={setSearch}
              onSearch={load}
              onSelect={selectSupplierSuggestion}
              suggestions={buildSupplierSearchSuggestions(items)}
            />
          </Col>
          <Col md={2}>
            <Button className="w-100" variant="outline-secondary" onClick={clearSearch} disabled={!search}>Limpar pesquisa</Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm"><Card.Body className="p-0">{items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0"><thead><tr><th>Fornecedor</th><th>Tipo</th><th>CPF/CNPJ</th><th>Email</th><th>Telefone</th><th>Cidade/UF</th><th>Ativo</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="fw-semibold">{item.display_name || item.name}</div>{item.contact_person ? <div className="small text-muted">Contato: {item.contact_person}</div> : null}</td><td><Badge bg={item.person_type === "company" ? "info" : "secondary"}>{item.person_type_label || (item.person_type === "company" ? "Pessoa jurídica" : "Pessoa física")}</Badge></td><td>{item.document || "-"}</td><td>{item.email || "-"}</td><td>{item.phone ? maskBrazilPhone(item.phone) : "-"}</td><td>{[item.city, item.state].filter(Boolean).join(" / ") || "-"}</td><td>{item.is_active ? "Sim" : "Não"}</td><td className="text-end text-nowrap"><Button size="sm" variant="outline-primary" className="me-2" onClick={() => open(item)}>Editar</Button><Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button></td></tr>)}</tbody></Table>}</Card.Body></Card>

    <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal"><Form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editing ? "Editar" : "Novo"} fornecedor</Modal.Title></Modal.Header><Modal.Body><FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />
      <TabPanel activeKey={activeTab} eventKey="identification"><Row className="g-3"><Col md={3}><Form.Label>Tipo de pessoa</Form.Label><Form.Select value={form.person_type} onChange={(event) => update({ person_type: event.target.value })}><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></Form.Select></Col><Col md={isCompany ? 6 : 4}><Form.Label>{isCompany ? "Razão social" : "Nome"}</Form.Label><Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })} /></Col>{!isCompany && <Col md={3}><Form.Label>Sobrenome</Form.Label><Form.Control value={form.last_name} onChange={(event) => update({ last_name: event.target.value })} /></Col>}<Col md={isCompany ? 3 : 2}><Form.Label>{isCompany ? "CNPJ" : "CPF"}</Form.Label><Form.Control value={form.document} onChange={(event) => update({ document: maskCpfCnpj(event.target.value) })} placeholder={isCompany ? "00.000.000/0000-00" : "000.000.000-00"} /></Col>{isCompany && <Col md={4}><Form.Label>Nome fantasia</Form.Label><Form.Control value={form.trade_name} onChange={(event) => update({ trade_name: event.target.value })} /></Col>}<Col md={4}><Form.Label>{isCompany ? "Data de fundação" : "Data de nascimento"}</Form.Label><Form.Control type="date" value={form.birth_date || ""} placeholder={dateInputValue()} onChange={(event) => update({ birth_date: event.target.value })} />{form.birth_date ? <div className="small text-muted mt-1">{formatDate(form.birth_date)}</div> : null}</Col>{isCompany && <><Col md={4}><Form.Label>Inscrição estadual</Form.Label><Form.Control value={form.state_registration} onChange={(event) => update({ state_registration: event.target.value })} /></Col><Col md={4}><Form.Label>Inscrição municipal</Form.Label><Form.Control value={form.municipal_registration} onChange={(event) => update({ municipal_registration: event.target.value })} /></Col></>}</Row></TabPanel>
      <TabPanel activeKey={activeTab} eventKey="contact"><Row className="g-3"><Col md={4}><Form.Label>Email</Form.Label><Form.Control type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} placeholder="fornecedor@email.com.br" /></Col><Col md={4}><PhoneInputBR label="Telefone principal / WhatsApp" value={form.phone} onChange={(value) => update({ phone: value })} /></Col><Col md={4}><PhoneInputBR label="Telefone secundário" value={form.secondary_phone} onChange={(value) => update({ secondary_phone: value })} helpText="Opcional. Também será salvo em formato +55 para WhatsApp." /></Col><Col md={6}><Form.Label>Pessoa de contato</Form.Label><Form.Control value={form.contact_person} onChange={(event) => update({ contact_person: event.target.value })} placeholder="Responsável comercial, financeiro ou logística" /></Col></Row></TabPanel>
      <TabPanel activeKey={activeTab} eventKey="address"><Row className="g-3"><Col md={2}><Form.Label>CEP</Form.Label><Form.Control value={form.zip_code} onChange={(event) => update({ zip_code: maskCep(event.target.value) })} placeholder="00000-000" /></Col><Col md={2} className="d-flex align-items-end"><CepLookupButton cep={form.zip_code} onFound={(address) => update(address)} onError={setError} /></Col><Col md={4}><Form.Label>Endereço</Form.Label><Form.Control value={form.address_line} onChange={(event) => update({ address_line: event.target.value })} placeholder="Rua, avenida, estrada..." /></Col><Col md={2}><Form.Label>Número</Form.Label><Form.Control value={form.address_number} onChange={(event) => update({ address_number: event.target.value })} /></Col><Col md={2}><Form.Label>Complemento</Form.Label><Form.Control value={form.address_complement} onChange={(event) => update({ address_complement: event.target.value })} /></Col><Col md={4}><Form.Label>Bairro</Form.Label><Form.Control value={form.district} onChange={(event) => update({ district: event.target.value })} /></Col><Col md={5}><Form.Label>Cidade</Form.Label><Form.Control value={form.city} onChange={(event) => update({ city: event.target.value })} /></Col><Col md={1}><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.state} onChange={(event) => update({ state: event.target.value.toUpperCase() })} /></Col><Col md={2}><Form.Label>País</Form.Label><Form.Control value={form.country} onChange={(event) => update({ country: event.target.value })} /></Col></Row></TabPanel>
      <TabPanel activeKey={activeTab} eventKey="extra"><Row className="g-3"><Col md={6}><Form.Label>Endereço legado</Form.Label><Form.Control as="textarea" rows={4} value={form.address} onChange={(event) => update({ address: event.target.value })} /><div className="small text-muted mt-1">Campo preservado para fornecedores cadastrados antes do endereço estruturado.</div></Col><Col md={6}><Form.Label>Observações internas</Form.Label><Form.Control as="textarea" rows={4} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></Col><Col md={12}><Form.Label>Dados extras JSON</Form.Label><Form.Control as="textarea" rows={5} className="code-help" value={form.custom_data_text} onChange={(event) => update({ custom_data_text: event.target.value })} /></Col><Col md={12}><Form.Check label="Fornecedor ativo" checked={form.is_active} onChange={(event) => update({ is_active: event.target.checked })} /></Col></Row></TabPanel>
    </Modal.Body><TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar fornecedor" /></Form></Modal>
  </>;
}
