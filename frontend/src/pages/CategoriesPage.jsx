import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import PageHeader from "../components/PageHeader";
import SearchableSelect from "../components/SearchableSelect";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";
import { confirmDialog } from "../components/ConfirmDialog";

const categoryTypes = [
  ["general", "Geral"],
  ["service", "Serviço"],
  ["part", "Peça / estoque"],
  ["vehicle", "Veículo"],
  ["work_order", "Ordem de serviço"],
];

const tabs = [
  { key: "identification", label: "Identificação", description: "Tipo, código e nome" },
  { key: "details", label: "Detalhes", description: "Descrição e status" },
];

const empty = () => ({ type: "general", code: "", name: "", description: "", is_active: true });

export default function CategoriesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [activeTab, setActiveTab] = useState("identification");
  const [error, setError] = useState("");

  const typeOptions = categoryTypes.map(([value, label]) => ({ value, label }));
  const filterTypeOptions = [{ value: "", label: "Todos os tipos" }, ...typeOptions];

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (type) params.type = type;
      setItems(results((await api.get("/workshop/categories/", { params })).data));
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function open(item = null) {
    setEditing(item);
    setActiveTab("identification");
    setForm(item ? { type: item.type, code: item.code || "", name: item.name || "", description: item.description || "", is_active: item.is_active } : empty());
    setShow(true);
  }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form, code: (form.code || "").toUpperCase() };
      if (editing) await api.put(`/workshop/categories/${editing.id}/`, payload);
      else await api.post("/workshop/categories/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir categoria ${item.name}?`))) return;
    try {
      await api.delete(`/workshop/categories/${item.id}/`);
      await load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <>
      <PageHeader title="Categorias" subtitle="Administração das categorias reutilizáveis no sistema, incluindo peças e serviços.">
        <Button onClick={() => open()}>Nova categoria</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={7}>
              <Form.Label>Busca</Form.Label>
              <SearchAutocompleteInput placeholder="Buscar por código, nome ou descrição" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["type_label", "code", "name", "description"])} />
            </Col>
            <Col md={3}>
              <SearchableSelect
                label="Tipo"
                value={type}
                options={filterTypeOptions}
                onChange={setType}
                placeholder="Pesquisar tipo"
              />
            </Col>
            <Col md={2}><Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button></Col>
          </Row>
        </Card.Body>
      </Card>
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {items.length === 0 ? <EmptyState /> : (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Tipo</th><th>Código</th><th>Nome</th><th>Descrição</th><th>Status</th><th></th></tr></thead>
              <tbody>{items.map(item => (
                <tr key={item.id}>
                  <td>{item.type_label}</td>
                  <td>{item.code || "-"}</td>
                  <td className="fw-semibold">{item.name}</td>
                  <td>{item.description || "-"}</td>
                  <td>{item.is_active ? "Ativa" : "Inativa"}</td>
                  <td className="text-end">
                    <Button size="sm" variant="outline-primary" onClick={() => open(item)} className="me-2">Editar</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
                  </td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      <Modal size="lg" show={show} onHide={() => setShow(false)} className="floating-form-modal">
        <Form onSubmit={save}>
          <Modal.Header closeButton><Modal.Title>{editing ? "Editar" : "Nova"} categoria</Modal.Title></Modal.Header>
          <Modal.Body>
            <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

            <TabPanel activeKey={activeTab} eventKey="identification">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="form-section-title">Identificação da categoria</div>
                  <Row className="g-3">
                    <Col md={4}>
                      <SearchableSelect
                        label="Tipo"
                        value={form.type}
                        options={typeOptions}
                        onChange={(value) => update({ type: value })}
                        placeholder="Pesquisar tipo"
                        required
                      />
                    </Col>
                    <Col md={3}>
                      <Form.Label>Código</Form.Label>
                      <Form.Control value={form.code} onChange={(event) => update({ code: event.target.value.toUpperCase() })} />
                    </Col>
                    <Col md={5}>
                      <Form.Label>Nome</Form.Label>
                      <Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })} />
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="details">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="form-section-title">Detalhes e status</div>
                  <Form.Group className="mb-3">
                    <Form.Label>Descrição</Form.Label>
                    <Form.Control as="textarea" rows={4} value={form.description} onChange={(event) => update({ description: event.target.value })} />
                  </Form.Group>
                  <Form.Check label="Ativa" checked={form.is_active} onChange={(event) => update({ is_active: event.target.checked })} />
                </Card.Body>
              </Card>
            </TabPanel>
          </Modal.Body>
          <TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
        </Form>
      </Modal>
    </>
  );
}
