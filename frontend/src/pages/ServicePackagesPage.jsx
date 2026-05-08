import React, { useEffect, useMemo, useState } from "react";
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

const emptyPackage = () => ({
  code: "",
  name: "",
  description: "",
  is_active: true,
  items: [],
});

const emptyItem = () => ({
  local_id: crypto.randomUUID(),
  service_id: "",
  description: "",
  quantity: "",
  unit_price: "",
  discount_amount: "",
  position: "",
});

const tabs = [
  { key: "package", label: "Pacote", description: "Código, nome, descrição e status" },
  { key: "items", label: "Serviços", description: "Itens pesquisáveis e valores" },
];

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemTotal(item) {
  return Math.max(decimal(item.quantity) * decimal(item.unit_price) - decimal(item.discount_amount), 0);
}

export default function ServicePackagesPage() {
  const [items, setItems] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyPackage());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("package");
  const [error, setError] = useState("");

  const serviceOptions = [
    { value: "", label: "Manual" },
    ...services.map((service) => ({
      value: service.id,
      label: [service.code, service.name, service.category_name].filter(Boolean).join(" - "),
    })),
  ];
  const formTotal = useMemo(() => form.items.reduce((total, item) => total + itemTotal(item), 0), [form.items]);

  async function load() {
    try {
      const [packageRes, serviceRes] = await Promise.all([
        api.get("/workshop/service-packages/", { params: search ? { search } : {} }),
        api.get("/workshop/services/", { params: { active: "true" } }),
      ]);
      setItems(results(packageRes.data));
      setServices(results(serviceRes.data));
    } catch (err) {
      setError(apiError(err));
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
    setActiveTab("package");
    setForm(item ? {
      code: item.code || "",
      name: item.name || "",
      description: item.description || "",
      is_active: item.is_active,
      items: (item.items || []).map((line, index) => ({
        local_id: crypto.randomUUID(),
        service_id: line.service || "",
        description: line.description || "",
        quantity: line.quantity || "1.00",
        unit_price: line.unit_price || "0.00",
        discount_amount: line.discount_amount || "0.00",
        position: line.position || index + 1,
      })),
    } : emptyPackage());
    setShow(true);
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [...current.items, { ...emptyItem(), position: current.items.length + 1 }],
    }));
    setActiveTab("items");
  }

  function updateItem(localId, changes) {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => (line.local_id === localId ? { ...line, ...changes } : line)),
    }));
  }

  function removeItem(localId) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((line) => line.local_id !== localId).map((line, index) => ({ ...line, position: index + 1 })),
    }));
  }

  function onServiceChange(localId, serviceId) {
    const selected = services.find((service) => String(service.id) === String(serviceId));
    updateItem(localId, {
      service_id: serviceId,
      description: selected?.name || "",
      unit_price: selected?.default_unit_price || "0.00",
    });
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    const payload = {
      ...form,
      items: form.items.map((line, index) => ({
        service_id: line.service_id ? Number(line.service_id) : null,
        description: line.description,
        quantity: line.quantity || "1.00",
        unit_price: line.unit_price || "0.00",
        discount_amount: line.discount_amount || "0.00",
        position: index + 1,
      })),
    };

    try {
      if (editing) {
        await api.put(`/workshop/service-packages/${editing.id}/`, payload);
      } else {
        await api.post("/workshop/service-packages/", payload);
      }
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir o pacote ${item.name}?`))) return;
    try {
      await api.delete(`/workshop/service-packages/${item.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Pacotes de serviços" subtitle="Monte combos agrupando vários serviços do catálogo em um formulário padronizado.">
      <Button onClick={() => open()}>Novo pacote</Button>
    </PageHeader>

    <AreaTabs area="technical" />
    <ErrorAlert error={error} onClose={() => setError("")}/>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col md={10}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput placeholder="Buscar por código, nome ou descrição" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["code", "name", "description"])} />
          </Col>
          <Col md={2}>
            <Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState title="Nenhum pacote cadastrado"/> : <Table responsive hover className="mb-0">
          <thead>
            <tr>
              <th>Código</th>
              <th>Pacote</th>
              <th>Itens</th>
              <th>Subtotal</th>
              <th>Desconto</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <tr key={item.id}>
              <td>{item.code || "-"}</td>
              <td className="fw-semibold">{item.name}</td>
              <td>{item.items?.length || 0}</td>
              <td>{money(item.subtotal_amount)}</td>
              <td>{money(item.discount_amount)}</td>
              <td>{money(item.total_amount)}</td>
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

    <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal">
      <Form onSubmit={save}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Editar" : "Novo"} pacote</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

          <TabPanel activeKey={activeTab} eventKey="package">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Dados do pacote</div>
                <Row className="g-3">
                  <Col md={3}>
                    <Form.Label>Código</Form.Label>
                    <Form.Control value={form.code || ""} onChange={(event) => update({ code: event.target.value.toUpperCase() })}/>
                  </Col>
                  <Col md={7}>
                    <Form.Label>Nome</Form.Label>
                    <Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })}/>
                  </Col>
                  <Col md={2} className="d-flex align-items-end">
                    <Form.Check label="Ativo" checked={!!form.is_active} onChange={(event) => update({ is_active: event.target.checked })}/>
                  </Col>
                </Row>

                <Form.Group className="mt-3">
                  <Form.Label>Descrição</Form.Label>
                  <Form.Control as="textarea" rows={3} value={form.description || ""} onChange={(event) => update({ description: event.target.value })}/>
                </Form.Group>
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="items">
            <Card className="form-section-card">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <div className="form-section-title mb-1">Serviços do pacote</div>
                    <div className="text-muted small">Use o campo pesquisável para localizar serviços do catálogo rapidamente.</div>
                  </div>
                  <Button size="sm" variant="outline-primary" type="button" onClick={addItem}>Adicionar serviço ao pacote</Button>
                </div>

                {form.items.length === 0 ? <EmptyState title="Nenhum serviço no pacote"/> : <Table responsive bordered>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 260 }}>Serviço</th>
                      <th>Descrição</th>
                      <th style={{ width: 120 }}>Qtd.</th>
                      <th style={{ width: 140 }}>Unitário</th>
                      <th style={{ width: 140 }}>Desconto</th>
                      <th style={{ width: 130 }}>Total</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((line) => <tr key={line.local_id}>
                      <td>
                        <SearchableSelect
                          value={line.service_id || ""}
                          options={serviceOptions}
                          onChange={(value) => onServiceChange(line.local_id, value)}
                          placeholder="Pesquisar serviço"
                          emptyMessage="Nenhum serviço encontrado."
                        />
                      </td>
                      <td><Form.Control required value={line.description} onChange={(event) => updateItem(line.local_id, { description: event.target.value })}/></td>
                      <td><Form.Control type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateItem(line.local_id, { quantity: event.target.value })}/></td>
                      <td><MoneyInput value={line.unit_price} onChange={(value) => updateItem(line.local_id, { unit_price: value })}/></td>
                      <td><MoneyInput value={line.discount_amount} onChange={(value) => updateItem(line.local_id, { discount_amount: value })}/></td>
                      <td>{money(itemTotal(line))}</td>
                      <td className="text-end"><Button size="sm" variant="outline-danger" type="button" onClick={() => removeItem(line.local_id)}>Remover</Button></td>
                    </tr>)}
                  </tbody>
                </Table>}

                <div className="text-end fs-5 form-muted-box mt-3">
                  Total do pacote: <strong>{money(formTotal)}</strong>
                </div>
              </Card.Body>
            </Card>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
      </Form>
    </Modal>
  </>;
}
