import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import AutocompleteInput from "../components/AutocompleteInput";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import AreaTabs from "../components/AreaTabs";
import SearchableSelect from "../components/SearchableSelect";
import { money, normalizePartUnit, partUnitOptions } from "../workshopOptions";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = () => ({
  sku: "",
  name: "",
  category_id: "",
  brand: "",
  location: "",
  unit: "un",
  cost_price: "",
  sale_price: "",
  stock_quantity: "",
  minimum_stock: "",
  is_featured: false,
  is_active: true,
  notes: "",
});

const emptyAdj = () => ({
  movement_type: "adjustment",
  quantity: "",
  unit_cost: "",
  notes: "",
});

const tabs = [
  { key: "identification", label: "Identificação", description: "SKU, peça, categoria e marca" },
  { key: "stock", label: "Estoque e preços", description: "Unidade, custo, venda e mínimo" },
  { key: "photo", label: "Foto", description: "Imagem da peça" },
  { key: "notes", label: "Observações", description: "Status e notas internas" },
];

export default function PartsPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [form, setForm] = useState(empty());
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [adj, setAdj] = useState(emptyAdj());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [low, setLow] = useState(false);
  const [activeTab, setActiveTab] = useState("identification");
  const [error, setError] = useState("");

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
      if (low) params.low_stock = "true";
      const [partsRes, categoriesRes] = await Promise.all([
        api.get("/workshop/parts/", { params: { ...params, ordering: "most_used" } }),
        api.get("/workshop/categories/", { params: { type: "part", active: "true" } }),
      ]);
      setItems(results(partsRes.data));
      setCategories(results(categoriesRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function loadBrandOptions(query = "") {
    try {
      setBrandLoading(true);
      const params = { active: "true" };
      if (query) params.search = query;
      const response = await api.get("/workshop/part-brands/", { params });
      setBrandOptions(results(response.data));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBrandLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadBrandOptions();
  }, []);

  useEffect(() => {
    load();
  }, [low, categoryFilter]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function open(item = null) {
    setEditing(item);
    setActiveTab("identification");
    setPhotoFile(null);
    setRemovePhoto(false);
    setForm(item ? {
      sku: item.sku || "",
      name: item.name || "",
      category_id: item.category || "",
      brand: item.brand || "",
      location: item.location || "",
      unit: normalizePartUnit(item.unit || "un"),
      cost_price: item.cost_price || "0.00",
      sale_price: item.sale_price || "0.00",
      stock_quantity: item.stock_quantity || "0.00",
      minimum_stock: item.minimum_stock || "0.00",
      is_featured: !!item.is_featured,
      is_active: !!item.is_active,
      notes: item.notes || "",
    } : empty());
    loadBrandOptions(item?.brand || "");
    setShow(true);
  }

  function openAdj(item) {
    setAdjusting(item);
    setAdj({ ...emptyAdj(), unit_cost: item.cost_price || "0.00" });
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : "",
        unit: normalizePartUnit(form.unit),
        remove_photo: removePhoto ? "true" : "false",
      };
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value ?? ""));
      if (photoFile) formData.append("photo", photoFile);
      if (editing) {
        await api.put(`/workshop/parts/${editing.id}/`, formData);
      } else {
        await api.post("/workshop/parts/", formData);
      }
      setShow(false);
      await loadBrandOptions(form.brand || "");
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function saveAdj(event) {
    event.preventDefault();
    try {
      await api.post(`/workshop/parts/${adjusting.id}/adjust_stock/`, {
        ...adj,
        unit_cost: adj.unit_cost || null,
      });
      setAdjusting(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir peça ${item.name}?`))) return;
    try {
      await api.delete(`/workshop/parts/${item.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Peças e estoque" subtitle="Cadastro de peças com categoria pesquisável, marca com autocomplete, preço, estoque e mínimo.">
      <Button onClick={() => open()}>Nova peça</Button>
    </PageHeader>

    <AreaTabs area="stock" />
    <ErrorAlert error={error} onClose={() => setError("")}/>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col md={5}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput placeholder="Buscar por SKU, peça, marca ou categoria" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["sku", "name", "brand", "category_name", "legacy_category_name", "description"])} />
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
            <Form.Check label="Baixo estoque" checked={low} onChange={(event) => setLow(event.target.checked)}/>
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
              <th>SKU</th>
              <th>Peça</th>
              <th>Categoria</th>
              <th>Marca</th>
              <th>Estoque</th>
              <th>Mínimo</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Preferida</th>
              <th>Uso em OS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <tr key={item.id} className={item.is_low_stock ? "table-warning" : ""}>
              <td>{item.photo_url ? <img className="table-thumb" src={item.photo_url} alt={`Foto ${item.name}`} /> : <span className="text-muted">-</span>}</td>
              <td className="fw-semibold">{item.sku}</td>
              <td>{item.name}</td>
              <td>{item.category_name || "-"}</td>
              <td>{item.brand || "-"}</td>
              <td>{item.stock_quantity} {item.unit}</td>
              <td>{item.minimum_stock}</td>
              <td>{money(item.cost_price)}</td>
              <td>{money(item.sale_price)}</td>
              <td>{item.is_featured ? <span className="badge text-bg-primary">Sim</span> : <span className="text-muted">Não</span>}</td>
              <td>{item.usage_count || 0}</td>
              <td className="text-end">
                <Button size="sm" variant="outline-success" onClick={() => openAdj(item)} className="me-2">Estoque</Button>
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
          <Modal.Title>{editing ? "Editar" : "Nova"} peça</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

          <TabPanel activeKey={activeTab} eventKey="identification">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Identificação da peça</div>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Label>SKU</Form.Label>
                    <Form.Control required value={form.sku} onChange={(event) => update({ sku: event.target.value.toUpperCase() })}/>
                  </Col>
                  <Col md={8}>
                    <Form.Label>Nome</Form.Label>
                    <Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })}/>
                  </Col>
                  <Col md={4}>
                    <SearchableSelect
                      label="Categoria"
                      value={form.category_id || ""}
                      options={categoryOptions}
                      onChange={(value) => update({ category_id: value })}
                      placeholder="Pesquisar categoria"
                      helpText={categories.length === 0 ? "Cadastre categorias do tipo Peça / estoque na tela Categorias." : "Digite para filtrar as categorias cadastradas."}
                    />
                  </Col>
                  <Col md={4}>
                    <AutocompleteInput
                      label="Marca"
                      value={form.brand}
                      onChange={(value) => update({ brand: value })}
                      options={brandOptions}
                      onSearch={loadBrandOptions}
                      loading={brandLoading}
                      placeholder="Digite ou selecione a marca"
                      helpText="Ao salvar uma marca nova, ela entra automaticamente no autocomplete."
                    />
                  </Col>
                  <Col md={4}>
                    <Form.Label>Local</Form.Label>
                    <Form.Control value={form.location} onChange={(event) => update({ location: event.target.value })}/>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="stock">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Estoque e formação de preço</div>
                <Row className="g-3">
                  <Col md={3}>
                    <Form.Label>Unidade</Form.Label>
                    <Form.Select value={normalizePartUnit(form.unit)} onChange={(event) => update({ unit: event.target.value })}>
                      {partUnitOptions.map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}
                    </Form.Select>
                    <Form.Text>Lista controlada para evitar variações como UN, unid. ou unidade.</Form.Text>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Custo</Form.Label>
                    <MoneyInput value={form.cost_price} onChange={(value) => update({ cost_price: value })}/>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Venda</Form.Label>
                    <MoneyInput value={form.sale_price} onChange={(value) => update({ sale_price: value })}/>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Estoque</Form.Label>
                    <Form.Control type="number" step="0.01" value={form.stock_quantity} onChange={(event) => update({ stock_quantity: event.target.value })}/>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Mínimo</Form.Label>
                    <Form.Control type="number" step="0.01" value={form.minimum_stock} onChange={(event) => update({ minimum_stock: event.target.value })}/>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="photo">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Foto da peça</div>
                <Row className="g-3 align-items-center">
                  <Col md={5}>
                    <div className="image-preview-card">
                      {photoFile ? (
                        <img src={URL.createObjectURL(photoFile)} alt="Prévia da peça" />
                      ) : !removePhoto && editing?.photo_url ? (
                        <img src={editing.photo_url} alt={`Foto ${editing.name}`} />
                      ) : (
                        <span className="text-muted">Sem foto cadastrada</span>
                      )}
                    </div>
                  </Col>
                  <Col md={7}>
                    <Form.Label>Arquivo da foto</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => { setPhotoFile(event.target.files?.[0] || null); setRemovePhoto(false); }}
                    />
                    <Form.Text>Use uma imagem nítida da peça para facilitar identificação no estoque e na OS. Tamanho máximo validado no backend: 5 MB.</Form.Text>
                    <div className="d-flex gap-2 mt-3">
                      <Button type="button" variant="outline-secondary" onClick={() => { setPhotoFile(null); setRemovePhoto(false); }}>Limpar seleção</Button>
                      {editing?.photo_url || photoFile ? <Button type="button" variant="outline-danger" onClick={() => { setPhotoFile(null); setRemovePhoto(true); }}>Remover foto</Button> : null}
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="notes">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Observações e status</div>
                <Form.Group className="mb-3">
                  <Form.Label>Notas</Form.Label>
                  <Form.Control as="textarea" rows={4} value={form.notes} onChange={(event) => update({ notes: event.target.value })}/>
                </Form.Group>
                <Form.Check className="mb-2" label="Mostrar como mais usada/preferida na seleção da OS" checked={!!form.is_featured} onChange={(event) => update({ is_featured: event.target.checked })}/>
                <Form.Check label="Ativo" checked={form.is_active} onChange={(event) => update({ is_active: event.target.checked })}/>
              </Card.Body>
            </Card>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
      </Form>
    </Modal>

    <Modal show={!!adjusting} onHide={() => setAdjusting(null)}>
      <Form onSubmit={saveAdj}>
        <Modal.Header closeButton><Modal.Title>Ajustar estoque</Modal.Title></Modal.Header>
        <Modal.Body>
          {adjusting && <p className="text-muted">{adjusting.sku} - {adjusting.name}</p>}
          <Form.Group className="mb-3">
            <Form.Label>Tipo</Form.Label>
            <Form.Select value={adj.movement_type} onChange={(event) => setAdj({ ...adj, movement_type: event.target.value })}>
              <option value="purchase">Entrada/compra</option>
              <option value="adjustment">Ajuste</option>
              <option value="reversal">Estorno</option>
            </Form.Select>
          </Form.Group>
          <Row>
            <Col md={6}>
              <Form.Label>Quantidade</Form.Label>
              <Form.Control required type="number" step="0.01" value={adj.quantity} onChange={(event) => setAdj({ ...adj, quantity: event.target.value })}/>
            </Col>
            <Col md={6}>
              <Form.Label>Custo unitário</Form.Label>
              <MoneyInput value={adj.unit_cost} onChange={(value) => setAdj({ ...adj, unit_cost: value })}/>
            </Col>
          </Row>
          <Form.Group className="mt-3">
            <Form.Label>Observação</Form.Label>
            <Form.Control as="textarea" rows={3} value={adj.notes} onChange={(event) => setAdj({ ...adj, notes: event.target.value })}/>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setAdjusting(null)}>Cancelar</Button>
          <Button type="submit">Salvar ajuste</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  </>;
}
