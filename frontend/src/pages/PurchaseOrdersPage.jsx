import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { hasPermission } from "../auth/permissions";
import AreaTabs from "../components/AreaTabs";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import SearchableSelect from "../components/SearchableSelect";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";
import { dateInputValue, money } from "../workshopOptions";
import { confirmDialog } from "../components/ConfirmDialog";

const statusOptions = [
  ["", "Todos"],
  ["draft", "Rascunho"],
  ["requested", "Solicitado"],
  ["approved", "Aprovado"],
  ["ordered", "Pedido enviado"],
  ["partially_received", "Recebido parcial"],
  ["received", "Recebido"],
  ["cancelled", "Cancelado"],
];

const statusVariant = {
  draft: "secondary",
  requested: "info",
  approved: "primary",
  ordered: "warning",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

const orderTabs = [
  { key: "document", label: "Documento", description: "Fornecedor, prazo e desconto" },
  { key: "items", label: "Itens", description: "Peças, quantidades e custos" },
  { key: "notes", label: "Observações", description: "Notas internas e origem" },
];

const emptyOrder = () => ({
  supplier_id: "",
  status: "draft",
  expected_at: dateInputValue(),
  discount_amount: "",
  notes: "",
  items: [],
});

const emptyItem = () => ({
  part_id: "",
  description: "",
  quantity: "",
  unit_cost: "",
  notes: "",
});

function asNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canApprove = hasPermission(user, "purchases.approve");
  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyOrder());
  const [activeTab, setActiveTab] = useState("document");
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState("requested");
  const [receiveModal, setReceiveModal] = useState(null);
  const [receiveItems, setReceiveItems] = useState([]);

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [dashboardRes, ordersRes, suppliersRes, partsRes] = await Promise.all([
        api.get("/purchasing/dashboard/"),
        api.get("/purchasing/purchase-orders/", { params }),
        api.get("/purchasing/suppliers/", { params: { active: "true" } }),
        api.get("/workshop/parts/", { params: { active: "true" } }),
      ]);
      setDashboard(dashboardRes.data);
      setItems(results(ordersRes.data));
      setSuppliers(results(suppliersRes.data));
      setParts(results(partsRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  const cards = useMemo(() => {
    const counts = dashboard?.counts || {};
    return [
      ["Pedidos em aberto", counts.open_purchase_orders || 0],
      ["Pedidos automáticos", counts.auto_purchase_orders || 0],
      ["Recebidos no mês", counts.received_month || 0],
      ["Aprovados sem CP", counts.approved_without_payable || 0],
      ["Total aberto", money(counts.open_total || 0)],
    ];
  }, [dashboard]);

  const supplierOptions = useMemo(() => [
    { value: "", label: "Sem fornecedor definido" },
    ...suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.display_name || supplier.name || `Fornecedor #${supplier.id}`,
    })),
  ], [suppliers]);

  const partOptions = useMemo(() => [
    { value: "", label: "Item manual / sem peça vinculada" },
    ...parts.map((part) => ({
      value: part.id,
      label: [part.sku, part.name, part.brand].filter(Boolean).join(" - "),
    })),
  ], [parts]);

  const manualItemsTotal = useMemo(() => {
    const subtotal = form.items.reduce((acc, line) => acc + (asNumber(line.quantity) * asNumber(line.unit_cost)), 0);
    const discount = asNumber(form.discount_amount);
    return {
      subtotal,
      discount,
      total: Math.max(subtotal - discount, 0),
    };
  }, [form.items, form.discount_amount]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function open(item = null) {
    setEditing(item);
    setActiveTab("document");
    setForm(item ? {
      supplier_id: item.supplier || "",
      status: item.status || "draft",
      expected_at: item.expected_at || dateInputValue(),
      discount_amount: item.discount_amount || "0.00",
      notes: item.notes || "",
      items: (item.items || []).filter((line) => !line.is_auto_generated && Number(line.received_quantity || 0) === 0).map((line) => ({
        part_id: line.part || "",
        description: line.description || "",
        quantity: line.quantity || "1.00",
        unit_cost: line.unit_cost || "0.00",
        notes: line.notes || "",
      })),
    } : emptyOrder());
    setShow(true);
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }));
    setActiveTab("items");
  }

  function updateItem(index, patch) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeItem(index) {
    setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));
  }

  function handlePartChange(index, value) {
    const part = parts.find((candidate) => String(candidate.id) === String(value));
    if (!part) {
      updateItem(index, { part_id: "" });
      return;
    }
    updateItem(index, {
      part_id: value,
      description: part.name || "",
      unit_cost: part.cost_price || "",
    });
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        expected_at: form.expected_at || null,
        discount_amount: form.discount_amount || "0.00",
        items: form.items.map((item) => ({
          ...item,
          part_id: item.part_id ? Number(item.part_id) : null,
          quantity: item.quantity || "1.00",
          unit_cost: item.unit_cost || "0.00",
        })),
      };
      if (editing) await api.put(`/purchasing/purchase-orders/${editing.id}/`, payload);
      else await api.post("/purchasing/purchase-orders/", payload);
      setShow(false);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openStatus(item) {
    setStatusModal(item);
    setNewStatus(item.status === "draft" ? "requested" : item.status);
  }

  async function saveStatus(event) {
    event.preventDefault();
    try {
      await api.post(`/purchasing/purchase-orders/${statusModal.id}/change_status/`, { status: newStatus });
      setStatusModal(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openReceive(item) {
    setReceiveModal(item);
    setReceiveItems((item.items || []).filter((line) => Number(line.pending_quantity || 0) > 0).map((line) => ({
      item_id: line.id,
      description: line.description,
      pending_quantity: line.pending_quantity,
      unit_cost: line.unit_cost || "0.00",
      quantity: line.pending_quantity || "0.00",
    })));
  }

  async function saveReceive(event) {
    event.preventDefault();
    try {
      await api.post(`/purchasing/purchase-orders/${receiveModal.id}/receive/`, {
        items: receiveItems.filter((item) => Number(item.quantity || 0) > 0).map((item) => ({ item_id: item.item_id, quantity: item.quantity, unit_cost: item.unit_cost })),
      });
      setReceiveModal(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir pedido ${item.number}?`))) return;
    try {
      await api.delete(`/purchasing/purchase-orders/${item.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    <PageHeader title="Pedidos de compra" subtitle="Pedidos operacionais de compra. Ao aprovar, o sistema gera uma conta a pagar separada no financeiro.">
      <Button onClick={() => open()}>Novo pedido</Button>
    </PageHeader>
    <AreaTabs area="finance" />
    <ErrorAlert error={error} onClose={() => setError("")} />

    <Row className="g-3 mb-3">
      {cards.map(([label, value]) => (
        <Col md={3} key={label}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <div className="text-muted small">{label}</div>
              <div className="display-6 fw-bold">{value}</div>
            </Card.Body>
          </Card>
        </Col>
      ))}
    </Row>

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2 align-items-end">
          <Col md={6}>
            <Form.Label>Busca</Form.Label>
            <SearchAutocompleteInput
              placeholder="Buscar por pedido, fornecedor, OS ou item"
              value={search}
              onChange={setSearch}
              onSearch={load}
              suggestions={buildSearchSuggestions(items, ["number", "supplier_name", "work_order_number", "status_label", (order) => (order.items || []).map((line) => line.description)])}
            />
          </Col>
          <Col md={3}>
            <Form.Label>Status</Form.Label>
            <Form.Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col md={3}>
            <Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Origem</th>
                <th>Fornecedor</th>
                <th>OS</th>
                <th>Total</th>
                <th>Status</th>
                <th>Conta a pagar</th>
                <th>Itens</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="fw-semibold">{item.number}</td>
                  <td>{item.origin_label}</td>
                  <td>{item.supplier_name || "Sem fornecedor"}</td>
                  <td>{item.work_order ? <Link to={`/work-orders/${item.work_order}`}>{item.work_order_number}</Link> : "-"}</td>
                  <td>{money(item.total_amount)}</td>
                  <td><Badge bg={statusVariant[item.status] || "secondary"}>{item.status_label}</Badge></td>
                  <td>{item.account_payable_number ? <Link to="/finance/accounts-payable">{item.account_payable_number}</Link> : "-"}</td>
                  <td>{(item.items || []).length}</td>
                  <td className="text-end">
                    <Button size="sm" variant="outline-primary" className="me-2" onClick={() => open(item)}>Editar</Button>
                    <Button size="sm" variant="outline-secondary" className="me-2" onClick={() => openStatus(item)}>Status</Button>
                    {item.status !== "received" && item.status !== "cancelled" && <Button size="sm" variant="outline-success" className="me-2" onClick={() => openReceive(item)}>Receber</Button>}
                    <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
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
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Editar" : "Novo"} pedido de compra</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormTabs
            tabs={orderTabs.map((tab) => tab.key === "items" ? { ...tab, badge: String(form.items.length) } : tab)}
            activeKey={activeTab}
            onSelect={setActiveTab}
          />

          <TabPanel activeKey={activeTab} eventKey="document">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Dados do pedido</div>
                <Row className="g-3">
                  <Col md={5}>
                    <SearchableSelect
                      label="Fornecedor"
                      value={form.supplier_id || ""}
                      options={supplierOptions}
                      onChange={(value) => updateForm({ supplier_id: value })}
                      placeholder="Pesquisar fornecedor"
                      helpText="Digite parte do nome para localizar fornecedores ativos."
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Label>Previsão de entrega</Form.Label>
                    <Form.Control type="date" value={form.expected_at || ""} onChange={(event) => updateForm({ expected_at: event.target.value })} />
                  </Col>
                  <Col md={2}>
                    <Form.Label>Desconto</Form.Label>
                    <MoneyInput value={form.discount_amount} onChange={(value) => updateForm({ discount_amount: value })} />
                  </Col>
                  <Col md={2}>
                    <div className="finance-total-box total h-100">
                      <span>Total manual</span>
                      <strong>{money(manualItemsTotal.total)}</strong>
                    </div>
                  </Col>
                </Row>

                {editing ? (
                  <Row className="g-3 mt-2">
                    <Col md={3}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Número</div>
                        <div className="fw-semibold">{editing.number}</div>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Origem</div>
                        <div className="fw-semibold">{editing.origin_label}</div>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Status atual</div>
                        <div className="fw-semibold">{editing.status_label}</div>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Conta a pagar</div>
                        <div className="fw-semibold">{editing.account_payable_number || "Ainda não gerada"}</div>
                      </div>
                    </Col>
                  </Row>
                ) : null}
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="items">
            <Card className="form-section-card">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <div className="form-section-title mb-1">Itens manuais</div>
                    <div className="text-muted small">Selecione uma peça do estoque ou informe um item manual.</div>
                  </div>
                  <Button size="sm" variant="outline-primary" onClick={addItem}>Adicionar item</Button>
                </div>

                {form.items.length === 0 ? (
                  <div className="form-muted-box text-muted">
                    Nenhum item manual informado. Clique em <strong>Adicionar item</strong> para montar o pedido.
                  </div>
                ) : (
                  <div className="d-grid gap-3">
                    {form.items.map((line, index) => (
                      <Card className="border-0 bg-light" key={`purchase-line-${index}`}>
                        <Card.Body>
                          <Row className="g-3 align-items-end">
                            <Col md={5}>
                              <SearchableSelect
                                label="Peça"
                                value={line.part_id || ""}
                                options={partOptions}
                                onChange={(value) => handlePartChange(index, value)}
                                placeholder="Pesquisar peça"
                                helpText="Ao escolher uma peça, descrição e custo são preenchidos automaticamente."
                              />
                            </Col>
                            <Col md={7}>
                              <Form.Label>Descrição</Form.Label>
                              <Form.Control required value={line.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                            </Col>
                            <Col md={2}>
                              <Form.Label>Quantidade</Form.Label>
                              <Form.Control type="number" step="0.01" min="0.01" value={line.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                            </Col>
                            <Col md={3}>
                              <Form.Label>Custo unitário</Form.Label>
                              <MoneyInput value={line.unit_cost} onChange={(value) => updateItem(index, { unit_cost: value })} />
                            </Col>
                            <Col md={3}>
                              <div className="finance-total-box h-100">
                                <span>Subtotal do item</span>
                                <strong>{money(asNumber(line.quantity) * asNumber(line.unit_cost))}</strong>
                              </div>
                            </Col>
                            <Col md={3}>
                              <Form.Label>Observação</Form.Label>
                              <Form.Control value={line.notes} onChange={(event) => updateItem(index, { notes: event.target.value })} />
                            </Col>
                            <Col md={1}>
                              <Button className="w-100" size="sm" variant="outline-danger" onClick={() => removeItem(index)}>X</Button>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    ))}
                  </div>
                )}

                {editing?.items?.some((line) => line.is_auto_generated) ? (
                  <Card className="bg-light border-0 mt-3">
                    <Card.Body>
                      <div className="fw-semibold mb-2">Itens automáticos vinculados à OS</div>
                      {editing.items.filter((line) => line.is_auto_generated).map((line) => (
                        <div key={line.id} className="small">
                          {line.description}: comprar {line.quantity}, recebido {line.received_quantity}
                        </div>
                      ))}
                    </Card.Body>
                  </Card>
                ) : null}
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="notes">
            <Card className="form-section-card">
              <Card.Body>
                <div className="form-section-title">Observações internas</div>
                <Form.Group>
                  <Form.Label>Observações</Form.Label>
                  <Form.Control as="textarea" rows={5} value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} />
                </Form.Group>
                <Row className="g-3 mt-2">
                  <Col md={4}>
                    <div className="finance-total-box">
                      <span>Subtotal manual</span>
                      <strong>{money(manualItemsTotal.subtotal)}</strong>
                    </div>
                  </Col>
                  <Col md={4}>
                    <div className="finance-total-box">
                      <span>Desconto</span>
                      <strong>{money(manualItemsTotal.discount)}</strong>
                    </div>
                  </Col>
                  <Col md={4}>
                    <div className="finance-total-box total">
                      <span>Total manual previsto</span>
                      <strong>{money(manualItemsTotal.total)}</strong>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={orderTabs.map((tab) => tab.key === "items" ? { ...tab, badge: String(form.items.length) } : tab)} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
      </Form>
    </Modal>

    <Modal show={!!statusModal} onHide={() => setStatusModal(null)}>
      <Form onSubmit={saveStatus}>
        <Modal.Header closeButton>
          <Modal.Title>Alterar status</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Card className="form-section-card">
            <Card.Body>
              <div className="form-section-title">Fluxo do pedido</div>
              <Form.Label>Novo status</Form.Label>
              <Form.Select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                {statusOptions.filter(([value]) => value).map(([value, label]) => (
                  <option key={value} value={value} disabled={value === "approved" && !canApprove}>
                    {label}{value === "approved" && !canApprove ? " - exige financeiro/administrativo" : ""}
                  </option>
                ))}
              </Form.Select>
              {newStatus === "approved" ? (
                <div className="small text-muted mt-2">
                  Ao aprovar, o sistema gera ou atualiza automaticamente uma conta a pagar vinculada ao pedido.
                </div>
              ) : null}
            </Card.Body>
          </Card>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setStatusModal(null)}>Cancelar</Button>
          <Button type="submit">Salvar</Button>
        </Modal.Footer>
      </Form>
    </Modal>

    <Modal size="lg" show={!!receiveModal} onHide={() => setReceiveModal(null)}>
      <Form onSubmit={saveReceive}>
        <Modal.Header closeButton>
          <Modal.Title>Receber itens</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {receiveItems.length === 0 ? <EmptyState text="Não há saldo pendente para recebimento." /> : (
            <div className="d-grid gap-3">
              {receiveItems.map((line, index) => (
                <Card className="form-section-card" key={line.item_id}>
                  <Card.Body>
                    <Row className="g-3 align-items-end">
                      <Col md={5}>
                        <div className="form-section-title mb-1">{line.description}</div>
                        <div className="text-muted small">Pendente: {line.pending_quantity}</div>
                      </Col>
                      <Col md={3}>
                        <Form.Label>Receber</Form.Label>
                        <Form.Control type="number" step="0.01" value={line.quantity} onChange={(event) => setReceiveItems(receiveItems.map((candidate, i) => i === index ? { ...candidate, quantity: event.target.value } : candidate))} />
                      </Col>
                      <Col md={4}>
                        <Form.Label>Custo</Form.Label>
                        <MoneyInput value={line.unit_cost} onChange={(value) => setReceiveItems(receiveItems.map((candidate, i) => i === index ? { ...candidate, unit_cost: value } : candidate))} />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setReceiveModal(null)}>Cancelar</Button>
          <Button type="submit" disabled={receiveItems.length === 0}>Confirmar entrada</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  </>;
}
