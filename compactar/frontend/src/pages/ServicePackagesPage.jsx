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
import { confirmDialog } from "../components/ConfirmDialog";

const emptyPackage = () => ({
  code: "",
  name: "",
  description: "",
  discount_amount: "",
  is_active: true,
  items: [],
});

const emptyItem = () => ({
  local_id: crypto.randomUUID(),
  service_id: "",
  description: "",
  quantity: "1",
  unit_price: "",
  position: "",
});

const tabs = [
  { key: "package", label: "Pacote", description: "Código, nome, descrição e status" },
  { key: "items", label: "Serviços", description: "Itens pesquisáveis e valores" },
];

function packageSearchSuggestion(servicePackage) {
  const title = [servicePackage.code, servicePackage.name].filter(Boolean).join(" - ") || "Pacote sem nome";
  const packageItems = servicePackage.items || [];
  const itemSummary = packageItems.map((line) => {
    const serviceLabel = [line.service_code, line.service_name || line.description].filter(Boolean).join(" - ");
    const quantity = line.quantity ? `Qtd. ${line.quantity}` : "";
    return [serviceLabel, quantity].filter(Boolean).join(" ");
  }).filter(Boolean).join(" • ");
  const status = servicePackage.is_active ? "Ativo" : "Inativo";
  const totals = [
    `${packageItems.length || 0} serviço(s)`,
    `Subtotal: ${money(servicePackage.subtotal_amount)}`,
    `Desconto: ${money(servicePackage.discount_amount)}`,
    `Total: ${money(servicePackage.total_amount)}`,
  ].join(" • ");

  return {
    key: servicePackage.id,
    label: title,
    value: title,
    description: totals,
    meta: [itemSummary, servicePackage.description, status].filter(Boolean).join(" • "),
    payload: servicePackage,
    searchText: [
      title,
      servicePackage.code,
      servicePackage.name,
      servicePackage.description,
      status,
      servicePackage.subtotal_amount,
      servicePackage.discount_amount,
      servicePackage.total_amount,
      ...packageItems.flatMap((line) => [
        line.service_code,
        line.service_name,
        line.service_category_name,
        line.description,
        line.quantity,
        line.unit_price,
      ]),
    ].filter(Boolean).join(" "),
  };
}

function buildPackageSearchSuggestions(packages) {
  return (packages || []).map(packageSearchSuggestion);
}

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemSubtotal(item) {
  return decimal(item.quantity) * decimal(item.unit_price);
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
  const formSubtotal = useMemo(() => form.items.reduce((total, item) => total + itemSubtotal(item), 0), [form.items]);
  const formTotal = useMemo(() => Math.max(formSubtotal - decimal(form.discount_amount), 0), [formSubtotal, form.discount_amount]);

  async function load(nextSearch = search) {
    const normalizedSearch = String(nextSearch || "").trim();

    try {
      const [packageRes, serviceRes] = await Promise.all([
        api.get("/workshop/service-packages/", { params: normalizedSearch ? { search: normalizedSearch } : {} }),
        api.get("/workshop/services/", { params: { active: "true" } }),
      ]);
      setItems(results(packageRes.data));
      setServices(results(serviceRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  function clearSearch() {
    setSearch("");
    load("");
  }

  function selectPackageSuggestion(suggestion, nextValue) {
    const selectedPackage = suggestion?.payload;
    setSearch(nextValue || "");

    if (selectedPackage?.id) {
      setItems([selectedPackage]);
      return;
    }

    load(nextValue);
  }

  async function nextPackageCode() {
    try {
      const { data } = await api.get("/workshop/service-packages/next-code/");
      return data?.code || "";
    } catch (err) {
      setError(apiError(err));
      return "";
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function open(item = null) {
    setEditing(item);
    setActiveTab("package");
    if (item) {
      setForm({
        code: item.code || "",
        name: item.name || "",
        description: item.description || "",
        discount_amount: item.discount_amount || "0.00",
        is_active: item.is_active,
        items: (item.items || []).map((line, index) => ({
          local_id: crypto.randomUUID(),
          service_id: line.service || "",
          description: line.description || "",
          quantity: line.quantity || "1.00",
          unit_price: line.unit_price || "0.00",
          position: line.position || index + 1,
        })),
      });
    } else {
      const nextCode = await nextPackageCode();
      setForm({ ...emptyPackage(), code: nextCode });
    }
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
    const currentLine = form.items.find((line) => line.local_id === localId);
    updateItem(localId, {
      service_id: serviceId,
      description: selected?.name || "",
      quantity: currentLine?.quantity || "1",
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
            <SearchAutocompleteInput
              placeholder="Buscar por código, nome, descrição, serviço, categoria, valor ou status"
              value={search}
              onChange={setSearch}
              onSearch={load}
              onSelect={selectPackageSuggestion}
              suggestions={buildPackageSearchSuggestions(items)}
            />
          </Col>
          <Col md={2}>
            <Button className="w-100" variant="outline-secondary" onClick={clearSearch} disabled={!search}>Limpar pesquisa</Button>
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
                  <Col md={3}>
                    <Form.Label>Desconto do pacote</Form.Label>
                    <MoneyInput value={form.discount_amount} onChange={(value) => update({ discount_amount: value })}/>
                    <Form.Text>Aplicado uma vez sobre o total do pacote, não em cada serviço.</Form.Text>
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
                      <th style={{ width: 130 }}>Subtotal</th>
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
                      <td>{money(itemSubtotal(line))}</td>
                      <td className="text-end"><Button size="sm" variant="outline-danger" type="button" onClick={() => removeItem(line.local_id)}>Remover</Button></td>
                    </tr>)}
                  </tbody>
                </Table>}

                <div className="text-end fs-5 form-muted-box mt-3">
                  <div>Subtotal dos serviços: <strong>{money(formSubtotal)}</strong></div>
                  <div>Desconto do pacote: <strong>{money(form.discount_amount)}</strong></div>
                  <div>Total do pacote: <strong>{money(formTotal)}</strong></div>
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
