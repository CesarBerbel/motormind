import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import SearchableSelect from "../components/SearchableSelect";
import { money } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = () => ({
  code: "",
  name: "",
  category_id: "",
  legacy_category_name: "",
  description: "",
  default_unit_price: "",
  estimated_hours: "",
  is_featured: false,
  is_active: true,
});

const tabs = [
  { key: "identification", label: "Identificação", description: "Código, nome e categoria" },
  { key: "pricing", label: "Preço e tempo", description: "Preço padrão e horas" },
  { key: "photo", label: "Thumbnail", description: "Imagem do card na OS" },
  { key: "checklist", label: "Checklist técnico", description: "Itens padrão da execução" },
  { key: "details", label: "Detalhes", description: "Descrição e status" },
];

export default function WorkshopServicesPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(empty());
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeTab, setActiveTab] = useState("identification");
  const [error, setError] = useState("");
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState({ description: "", is_required: true, requires_photo: false, requires_note: false, sort_order: 0, is_active: true });

  const categoryOptions = [
    { value: "", label: "Sem categoria" },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];
  const categoryFilterOptions = [
    { value: "", label: "Todas as categorias" },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      const [servicesRes, categoriesRes] = await Promise.all([
        api.get("/workshop/services/", { params: { ...params, ordering: "most_used" } }),
        api.get("/workshop/categories/", { params: { type: "service", active: "true" } }),
      ]);
      setItems(results(servicesRes.data));
      setCategories(results(categoriesRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    load();
  }, [categoryFilter]);

  async function loadChecklistTemplates(serviceId) {
    if (!serviceId) {
      setChecklistTemplates([]);
      return;
    }
    try {
      const { data } = await api.get("/workshop/service-checklist-templates/", { params: { service: serviceId } });
      setChecklistTemplates(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function open(item = null) {
    setEditing(item);
    setActiveTab("identification");
    setPhotoFile(null);
    setRemovePhoto(false);
    if (item) loadChecklistTemplates(item.id); else setChecklistTemplates([]);
    setForm(item ? {
      code: item.code || "",
      name: item.name || "",
      category_id: item.category || "",
      legacy_category_name: item.legacy_category_name || "",
      description: item.description || "",
      default_unit_price: item.default_unit_price || "0.00",
      estimated_hours: item.estimated_hours || "0.00",
      is_featured: !!item.is_featured,
      is_active: !!item.is_active,
    } : empty());
    setShow(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : "",
        remove_photo: removePhoto ? "true" : "false",
      };
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value ?? ""));
      if (photoFile) formData.append("photo", photoFile);
      if (editing) {
        await api.put(`/workshop/services/${editing.id}/`, formData);
      } else {
        await api.post("/workshop/services/", formData);
      }
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function addChecklistTemplate() {
    if (!editing?.id) {
      setError("Salve o serviço antes de cadastrar o checklist técnico.");
      return;
    }
    try {
      await api.post("/workshop/service-checklist-templates/", { ...newChecklistItem, service: editing.id });
      setNewChecklistItem({ description: "", is_required: true, requires_photo: false, requires_note: false, sort_order: checklistTemplates.length + 1, is_active: true });
      await loadChecklistTemplates(editing.id);
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function updateChecklistTemplate(item) {
    try {
      await api.patch(`/workshop/service-checklist-templates/${item.id}/`, item);
      await loadChecklistTemplates(editing.id);
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function removeChecklistTemplate(item) {
    if (!(await confirmDialog(`Excluir item do checklist: ${item.description}?`))) return;
    try {
      await api.delete(`/workshop/service-checklist-templates/${item.id}/`);
      await loadChecklistTemplates(editing.id);
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir ${item.name}?`))) return;
    try {
      await api.delete(`/workshop/services/${item.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Catálogo de serviços" subtitle="Serviços padrão usados nas OS, com categoria pesquisável por dropdown.">
      <Button onClick={() => open()}>Novo serviço</Button>
    </PageHeader>

    <AreaTabs area="technical" />
    <ErrorAlert error={error} onClose={() => setError("")}/>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col md={7}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput placeholder="Buscar por código, nome ou categoria" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["code", "name", "category_name", "legacy_category_name", "description"])} />
          </Col>
          <Col md={3}>
            <SearchableSelect
              label="Categoria"
              value={categoryFilter}
              options={categoryFilterOptions}
              onChange={setCategoryFilter}
              placeholder="Pesquisar categoria"
            />
          </Col>
          <Col md={2}>
            <Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState/> : <Table responsive hover className="mb-0">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Código</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Horas</th>
              <th>Preferido</th>
              <th>Uso em OS</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <tr key={item.id}>
              <td>{item.photo_url ? <img className="table-thumb" src={item.photo_url} alt={`Foto ${item.name}`} /> : <span className="text-muted">-</span>}</td>
              <td>{item.code || "-"}</td>
              <td className="fw-semibold">{item.name}</td>
              <td>{item.category_name || "-"}</td>
              <td>{money(item.default_unit_price)}</td>
              <td>{item.estimated_hours}</td>
              <td>{item.is_featured ? <span className="badge text-bg-primary">Sim</span> : <span className="text-muted">Não</span>}</td>
              <td>{item.usage_count || 0}</td>
              <td>{item.is_active ? "Ativo" : "Inativo"}</td>
              <td className="text-end">
                <Button size="sm" variant="outline-primary" onClick={() => open(item)} className="me-2">Editar</Button>
                <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
              </td>
            </tr>)}
          </tbody>
        </Table>}
      </Card.Body>
    </Card>

    <Modal size="xl" dialogClassName="modal-wide-tabs" show={show} onHide={() => setShow(false)} className="floating-form-modal">
      <Form onSubmit={save}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Editar" : "Novo"} serviço</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

          <TabPanel activeKey={activeTab} eventKey="identification">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Identificação do serviço</div>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Label>Código</Form.Label>
                    <Form.Control value={form.code || ""} onChange={(event) => update({ code: event.target.value.toUpperCase() })}/>
                  </Col>
                  <Col md={8}>
                    <Form.Label>Nome</Form.Label>
                    <Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })}/>
                  </Col>
                  <Col md={6}>
                    <SearchableSelect
                      label="Categoria"
                      value={form.category_id || ""}
                      options={categoryOptions}
                      onChange={(value) => update({ category_id: value })}
                      placeholder="Pesquisar categoria"
                      helpText={categories.length === 0 ? "Cadastre categorias do tipo Serviço na tela Categorias." : "Digite para filtrar as categorias cadastradas."}
                    />
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="pricing">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Preço padrão e estimativa</div>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Label>Preço padrão</Form.Label>
                    <MoneyInput value={form.default_unit_price} onChange={(value) => update({ default_unit_price: value })}/>
                  </Col>
                  <Col md={6}>
                    <Form.Label>Horas</Form.Label>
                    <Form.Control type="number" step="0.01" value={form.estimated_hours} onChange={(event) => update({ estimated_hours: event.target.value })}/>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="photo">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Thumbnail do serviço</div>
                <Row className="g-3 align-items-center">
                  <Col md={5}>
                    <div className="image-preview-card">
                      {photoFile ? (
                        <img src={URL.createObjectURL(photoFile)} alt="Prévia do serviço" />
                      ) : !removePhoto && editing?.photo_url ? (
                        <img src={editing.photo_url} alt={`Foto ${editing.name}`} />
                      ) : (
                        <span className="text-muted">Sem thumbnail cadastrado</span>
                      )}
                    </div>
                  </Col>
                  <Col md={7}>
                    <Form.Label>Arquivo do thumbnail</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => { setPhotoFile(event.target.files?.[0] || null); setRemovePhoto(false); }}
                    />
                    <Form.Text>Use uma imagem simples para aparecer no card de seleção da OS. Tamanho máximo validado no backend: 5 MB.</Form.Text>
                    <div className="d-flex gap-2 mt-3">
                      <Button type="button" variant="outline-secondary" onClick={() => { setPhotoFile(null); setRemovePhoto(false); }}>Limpar seleção</Button>
                      {editing?.photo_url || photoFile ? <Button type="button" variant="outline-danger" onClick={() => { setPhotoFile(null); setRemovePhoto(true); }}>Remover thumbnail</Button> : null}
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="checklist">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Checklist técnico padrão</div>
                {!editing ? <div className="alert alert-info mb-3">Salve o serviço antes de cadastrar itens de checklist.</div> : null}
                {editing ? <>
                  <Table responsive size="sm" className="align-middle">
                    <thead><tr><th>Ordem</th><th>Descrição</th><th>Obrig.</th><th>Foto</th><th>Obs.</th><th>Ativo</th><th></th></tr></thead>
                    <tbody>
                      {checklistTemplates.map((item) => (
                        <tr key={item.id}>
                          <td style={{ width: 90 }}><Form.Control type="number" value={item.sort_order || 0} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, sort_order: event.target.value } : row))} /></td>
                          <td><Form.Control value={item.description || ""} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row))} /></td>
                          <td><Form.Check checked={!!item.is_required} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, is_required: event.target.checked } : row))} /></td>
                          <td><Form.Check checked={!!item.requires_photo} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, requires_photo: event.target.checked } : row))} /></td>
                          <td><Form.Check checked={!!item.requires_note} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, requires_note: event.target.checked } : row))} /></td>
                          <td><Form.Check checked={!!item.is_active} onChange={(event) => setChecklistTemplates((current) => current.map((row) => row.id === item.id ? { ...row, is_active: event.target.checked } : row))} /></td>
                          <td className="text-end"><Button size="sm" variant="outline-primary" onClick={() => updateChecklistTemplate(item)} className="me-2">Salvar</Button><Button size="sm" variant="outline-danger" onClick={() => removeChecklistTemplate(item)}>Excluir</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="border rounded p-3 bg-light">
                    <div className="fw-semibold mb-2">Novo item</div>
                    <Row className="g-2 align-items-end">
                      <Col md={6}><Form.Label>Descrição</Form.Label><Form.Control value={newChecklistItem.description} onChange={(event) => setNewChecklistItem({ ...newChecklistItem, description: event.target.value })} /></Col>
                      <Col md={2}><Form.Label>Ordem</Form.Label><Form.Control type="number" value={newChecklistItem.sort_order} onChange={(event) => setNewChecklistItem({ ...newChecklistItem, sort_order: event.target.value })} /></Col>
                      <Col md={4} className="d-flex gap-3 flex-wrap">
                        <Form.Check label="Obrigatório" checked={!!newChecklistItem.is_required} onChange={(event) => setNewChecklistItem({ ...newChecklistItem, is_required: event.target.checked })} />
                        <Form.Check label="Foto" checked={!!newChecklistItem.requires_photo} onChange={(event) => setNewChecklistItem({ ...newChecklistItem, requires_photo: event.target.checked })} />
                        <Form.Check label="Obs." checked={!!newChecklistItem.requires_note} onChange={(event) => setNewChecklistItem({ ...newChecklistItem, requires_note: event.target.checked })} />
                      </Col>
                    </Row>
                    <Button type="button" variant="outline-success" className="mt-3" onClick={addChecklistTemplate}>Adicionar item</Button>
                  </div>
                </> : null}
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="details">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Descrição e status</div>
                <Form.Group className="mb-3">
                  <Form.Label>Descrição</Form.Label>
                  <Form.Control as="textarea" rows={4} value={form.description} onChange={(event) => update({ description: event.target.value })}/>
                </Form.Group>
                <Form.Check className="mb-2" label="Mostrar como mais usado/preferido na seleção da OS" checked={!!form.is_featured} onChange={(event) => update({ is_featured: event.target.checked })}/>
                <Form.Check label="Ativo" checked={form.is_active} onChange={(event) => update({ is_active: event.target.checked })}/>
              </Card.Body>
            </Card>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
      </Form>
    </Modal>
  </>;
}
