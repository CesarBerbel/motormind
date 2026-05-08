import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import EmptyState from "../components/EmptyState";
import CepLookupButton from "../components/CepLookupButton";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import { dateInputValue, formatDate, maskCep, maskCpfCnpj } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";
import PhoneInputBR from "../components/PhoneInputBR";
import { maskBrazilPhone, normalizeBrazilPhoneToE164 } from "../utils/phone";
import { confirmDialog } from "../components/ConfirmDialog";

const emptyContact = () => ({
  person_type: "individual",
  first_name: "",
  last_name: "",
  trade_name: "",
  document_number: "",
  state_registration: "",
  municipal_registration: "",
  birth_date: dateInputValue(),
  email: "",
  phone_e164: "",
  secondary_phone_e164: "",
  zip_code: "",
  address_line: "",
  address_number: "",
  address_complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
  notes: "",
  group_ids: [],
  custom_data_text: "{}",
  is_active: true,
});

const tabs = [
  { key: "identification", label: "Identificação", description: "PF/PJ, CPF/CNPJ e dados básicos" },
  { key: "contact", label: "Contato", description: "Email, WhatsApp e telefones" },
  { key: "address", label: "Endereço", description: "Endereço brasileiro completo" },
  { key: "extra", label: "Classificação", description: "Grupos, observações e dados extras" },
];

function normalizeContact(contact) {
  return {
    person_type: contact.person_type || "individual",
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    trade_name: contact.trade_name || "",
    document_number: contact.document_number || "",
    state_registration: contact.state_registration || "",
    municipal_registration: contact.municipal_registration || "",
    birth_date: contact.birth_date || dateInputValue(),
    email: contact.email || "",
    phone_e164: maskBrazilPhone(contact.phone_e164 || ""),
    secondary_phone_e164: maskBrazilPhone(contact.secondary_phone_e164 || ""),
    zip_code: contact.zip_code || "",
    address_line: contact.address_line || "",
    address_number: contact.address_number || "",
    address_complement: contact.address_complement || "",
    district: contact.district || "",
    city: contact.city || "",
    state: contact.state || "",
    country: contact.country || "Brasil",
    notes: contact.notes || "",
    group_ids: (contact.groups || []).map((group) => group.id),
    custom_data_text: JSON.stringify(contact.custom_data || {}, null, 2),
    is_active: contact.is_active,
  };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState(emptyContact());
  const [activeTab, setActiveTab] = useState("identification");
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const [contactsRes, groupsRes] = await Promise.all([
        api.get("/contacts/", { params: search ? { search } : {} }),
        api.get("/contact-groups/"),
      ]);
      setContacts(results(contactsRes.data));
      setGroups(results(groupsRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  function open(contact = null) {
    setEditing(contact);
    setForm(contact ? normalizeContact(contact) : emptyContact());
    setActiveTab("identification");
    setShow(true);
  }

  function selectedGroups(event) {
    return Array.from(event.target.selectedOptions).map((option) => Number(option.value));
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
      phone_e164: normalizeBrazilPhoneToE164(form.phone_e164),
      secondary_phone_e164: normalizeBrazilPhoneToE164(form.secondary_phone_e164),
      document_number: maskCpfCnpj(form.document_number),
      zip_code: maskCep(form.zip_code),
      state: form.state.trim().toUpperCase(),
      custom_data: customData,
    };
    delete payload.custom_data_text;
    if (payload.person_type === "company") payload.last_name = "";
    try {
      if (editing) await api.put(`/contacts/${editing.id}/`, payload);
      else await api.post("/contacts/", payload);
      setShow(false);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(contact) {
    if (!(await confirmDialog(`Excluir ${contact.full_name}?`))) return;
    try {
      await api.delete(`/contacts/${contact.id}/`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  const isCompany = form.person_type === "company";

  return (
    <>
      <PageHeader title="Clientes / contatos" subtitle="Cadastro completo de clientes brasileiros, com PF/PJ, CPF/CNPJ, endereço e dados para atendimento.">
        <Button onClick={() => open()}>Novo cliente</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Row className="g-2">
            <Col md={10}>
              <SearchAutocompleteInput
                placeholder="Buscar por nome, razão social, CPF/CNPJ, email, telefone, cidade ou UF"
                value={search}
                onChange={setSearch}
                onSearch={load}
                suggestions={buildSearchSuggestions(contacts, ["display_name", "full_name", "first_name", "last_name", "trade_name", "document_number", "email", "phone_e164", "secondary_phone_e164", "city", "state"])}
              />
            </Col>
            <Col md={2}><Button variant="outline-primary" className="w-100" onClick={load}>Buscar</Button></Col>
          </Row>
        </Card.Body>
      </Card>
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {contacts.length === 0 ? <EmptyState /> : (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Cliente</th><th>Tipo</th><th>CPF/CNPJ</th><th>Email</th><th>WhatsApp</th><th>Cidade/UF</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="fw-semibold">{contact.display_name || contact.full_name}</div>
                      {contact.trade_name ? <div className="small text-muted">Nome fantasia: {contact.trade_name}</div> : null}
                    </td>
                    <td><Badge bg={contact.person_type === "company" ? "info" : "secondary"}>{contact.person_type_label || (contact.person_type === "company" ? "Pessoa jurídica" : "Pessoa física")}</Badge></td>
                    <td>{contact.document_number || "-"}</td>
                    <td>{contact.email || "-"}</td>
                    <td>{contact.phone_e164 ? maskBrazilPhone(contact.phone_e164) : "-"}</td>
                    <td>{[contact.city, contact.state].filter(Boolean).join(" / ") || "-"}</td>
                    <td>{contact.is_active ? "Ativo" : "Inativo"}</td>
                    <td className="text-end text-nowrap">
                      <Button size="sm" variant="outline-primary" onClick={() => open(contact)} className="me-2">Editar</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(contact)}>Excluir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal">
        <Form onSubmit={save}>
          <Modal.Header closeButton><Modal.Title>{editing ? "Editar cliente" : "Novo cliente"}</Modal.Title></Modal.Header>
          <Modal.Body>
            <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />
            <TabPanel activeKey={activeTab} eventKey="identification">
              <Row className="g-3">
                <Col md={3}>
                  <Form.Label>Tipo de pessoa</Form.Label>
                  <Form.Select value={form.person_type} onChange={(e) => update({ person_type: e.target.value })}>
                    <option value="individual">Pessoa física</option>
                    <option value="company">Pessoa jurídica</option>
                  </Form.Select>
                </Col>
                <Col md={isCompany ? 6 : 4}>
                  <Form.Label>{isCompany ? "Razão social" : "Nome"}</Form.Label>
                  <Form.Control required value={form.first_name} onChange={(e) => update({ first_name: e.target.value })} />
                </Col>
                {!isCompany && (
                  <Col md={3}>
                    <Form.Label>Sobrenome</Form.Label>
                    <Form.Control value={form.last_name} onChange={(e) => update({ last_name: e.target.value })} />
                  </Col>
                )}
                <Col md={isCompany ? 3 : 2}>
                  <Form.Label>{isCompany ? "CNPJ" : "CPF"}</Form.Label>
                  <Form.Control value={form.document_number} onChange={(e) => update({ document_number: maskCpfCnpj(e.target.value) })} placeholder={isCompany ? "00.000.000/0000-00" : "000.000.000-00"} />
                </Col>
                {isCompany && (
                  <Col md={4}>
                    <Form.Label>Nome fantasia</Form.Label>
                    <Form.Control value={form.trade_name} onChange={(e) => update({ trade_name: e.target.value })} />
                  </Col>
                )}
                <Col md={4}>
                  <Form.Label>{isCompany ? "Data de fundação" : "Data de nascimento"}</Form.Label>
                  <Form.Control type="date" value={form.birth_date || dateInputValue()} onChange={(e) => update({ birth_date: e.target.value })} />
                  {form.birth_date ? <div className="small text-muted mt-1">{formatDate(form.birth_date)}</div> : null}
                </Col>
                {isCompany && (
                  <>
                    <Col md={4}>
                      <Form.Label>Inscrição estadual</Form.Label>
                      <Form.Control value={form.state_registration} onChange={(e) => update({ state_registration: e.target.value })} />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Inscrição municipal</Form.Label>
                      <Form.Control value={form.municipal_registration} onChange={(e) => update({ municipal_registration: e.target.value })} />
                    </Col>
                  </>
                )}
              </Row>
            </TabPanel>
            <TabPanel activeKey={activeTab} eventKey="contact">
              <Row className="g-3">
                <Col md={4}>
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} placeholder="cliente@email.com.br" />
                </Col>
                <Col md={4}>
                  <PhoneInputBR label="WhatsApp principal" value={form.phone_e164} onChange={(value) => update({ phone_e164: value })} />
                </Col>
                <Col md={4}>
                  <PhoneInputBR label="Telefone secundário" value={form.secondary_phone_e164} onChange={(value) => update({ secondary_phone_e164: value })} helpText="Opcional. Também será salvo em formato +55 para WhatsApp." />
                </Col>
              </Row>
            </TabPanel>
            <TabPanel activeKey={activeTab} eventKey="address">
              <Row className="g-3">
                <Col md={2}><Form.Label>CEP</Form.Label><Form.Control value={form.zip_code} onChange={(e) => update({ zip_code: maskCep(e.target.value) })} placeholder="00000-000" /></Col>
                <Col md={2} className="d-flex align-items-end"><CepLookupButton cep={form.zip_code} onFound={(address) => update(address)} onError={setError} /></Col>
                <Col md={4}><Form.Label>Endereço</Form.Label><Form.Control value={form.address_line} onChange={(e) => update({ address_line: e.target.value })} placeholder="Rua, avenida, estrada..." /></Col>
                <Col md={2}><Form.Label>Número</Form.Label><Form.Control value={form.address_number} onChange={(e) => update({ address_number: e.target.value })} /></Col>
                <Col md={2}><Form.Label>Complemento</Form.Label><Form.Control value={form.address_complement} onChange={(e) => update({ address_complement: e.target.value })} /></Col>
                <Col md={4}><Form.Label>Bairro</Form.Label><Form.Control value={form.district} onChange={(e) => update({ district: e.target.value })} /></Col>
                <Col md={5}><Form.Label>Cidade</Form.Label><Form.Control value={form.city} onChange={(e) => update({ city: e.target.value })} /></Col>
                <Col md={1}><Form.Label>UF</Form.Label><Form.Control maxLength={2} value={form.state} onChange={(e) => update({ state: e.target.value.toUpperCase() })} /></Col>
                <Col md={2}><Form.Label>País</Form.Label><Form.Control value={form.country} onChange={(e) => update({ country: e.target.value })} /></Col>
              </Row>
            </TabPanel>
            <TabPanel activeKey={activeTab} eventKey="extra">
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label>Grupos</Form.Label>
                  <Form.Select multiple value={form.group_ids.map(String)} onChange={(e) => update({ group_ids: selectedGroups(e) })}>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </Form.Select>
                  <div className="small text-muted mt-1">Segure Ctrl para selecionar mais de um grupo.</div>
                </Col>
                <Col md={6}>
                  <Form.Label>Observações internas</Form.Label>
                  <Form.Control as="textarea" rows={5} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
                </Col>
                <Col md={12}>
                  <Form.Label>Dados extras JSON</Form.Label>
                  <Form.Control as="textarea" rows={5} className="code-help" value={form.custom_data_text} onChange={(e) => update({ custom_data_text: e.target.value })} />
                </Col>
                <Col md={12}><Form.Check label="Cliente ativo" checked={form.is_active} onChange={(e) => update({ is_active: e.target.checked })} /></Col>
              </Row>
            </TabPanel>
          </Modal.Body>
          <TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar cliente" />
        </Form>
      </Modal>
    </>
  );
}
