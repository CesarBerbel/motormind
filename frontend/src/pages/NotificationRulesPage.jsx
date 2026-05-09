import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import NoticeBox from "../components/NoticeBox";
import PageHeader from "../components/PageHeader";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import StatusBadge from "../components/StatusBadge";
import SystemToast from "../components/SystemToast";
import { buildSearchSuggestions } from "../utils/search";
import { workOrderStatuses } from "../workshopOptions";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = () => ({ name: "", trigger_status: "open", channel: "whatsapp", template_id: "", recipient_target: "customer", is_active: true, send_once_per_status: true });

const modalTabs = [
  { key: "rule", label: "Regra", description: "Nome e status gatilho" },
  { key: "message", label: "Mensagem", description: "Canal, destinatário e template" },
  { key: "behavior", label: "Comportamento", description: "Ativação e repetição" },
];

export default function NotificationRulesPage() {
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [activeTab, setActiveTab] = useState("rule");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.trigger_status = status;
      if (channel) params.channel = channel;
      const [rulesRes, templatesRes] = await Promise.all([
        api.get("/workshop/notification-rules/", { params }),
        api.get("/templates/", { params: { active: "true" } }),
      ]);
      setItems(results(rulesRes.data));
      setTemplates(results(templatesRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [status, channel]);

  function open(rule = null) {
    setEditing(rule);
    setForm(rule ? { ...rule, template_id: rule.template || "" } : empty());
    setActiveTab("rule");
    setShow(true);
  }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = { ...form, template_id: Number(form.template_id) };
      if (editing) await api.put(`/workshop/notification-rules/${editing.id}/`, payload);
      else await api.post("/workshop/notification-rules/", payload);
      setShow(false);
      setSuccess(editing ? "Regra de notificação atualizada com sucesso." : "Regra de notificação criada com sucesso.");
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(rule) {
    if (!(await confirmDialog(`Excluir regra ${rule.name}?`))) return;
    setError("");
    setSuccess("");
    try {
      await api.delete(`/workshop/notification-rules/${rule.id}/`);
      setSuccess("Regra de notificação excluída com sucesso.");
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  const templatesForChannel = templates.filter((template) => template.channel === form.channel);

  return <>
    <PageHeader title="Notificações automáticas de OS" subtitle="Dispare templates de email ou WhatsApp quando a ordem de serviço mudar de status.">
      <Button onClick={() => open()}>Nova regra</Button>
    </PageHeader>
    <ErrorAlert error={error} onClose={() => setError("")} />
    <SystemToast message={success} variant="success" delay={3000} onClose={() => setSuccess("")} />

    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <Row className="g-2">
          <Col lg={5}>
            <SearchAutocompleteInput placeholder="Buscar regra ou template" value={search} onChange={setSearch} onSearch={load} suggestions={buildSearchSuggestions(items, ["name", "template_name", "trigger_status", "channel"])} />
          </Col>
          <Col lg={3}>
            <Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos os status</option>
              {workOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Col>
          <Col lg={2}>
            <Form.Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="">Canal</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </Form.Select>
          </Col>
          <Col lg={2}><Button className="w-100" variant="outline-primary" onClick={load}>Buscar</Button></Col>
        </Row>
      </Card.Body>
    </Card>

    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : (
          <Table responsive hover className="mb-0">
            <thead><tr><th>Regra</th><th>Status gatilho</th><th>Canal</th><th>Destinatário</th><th>Template</th><th>Envio único</th><th>Ativa</th><th></th></tr></thead>
            <tbody>{items.map((rule) => (
              <tr key={rule.id}>
                <td className="fw-semibold">{rule.name}</td>
                <td><StatusBadge value={rule.trigger_status} /></td>
                <td><StatusBadge value={rule.channel} /></td>
                <td>{rule.recipient_target === "workshop" ? "Oficina" : rule.recipient_target === "both" ? "Cliente e oficina" : "Cliente"}</td>
                <td>{rule.template_name}</td>
                <td>{rule.send_once_per_status ? "Sim" : "Não"}</td>
                <td>{rule.is_active ? "Sim" : "Não"}</td>
                <td className="text-end">
                  <Button size="sm" variant="outline-primary" onClick={() => open(rule)} className="me-2">Editar</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => remove(rule)}>Excluir</Button>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card.Body>
    </Card>

    <Modal size="lg" show={show} onHide={() => setShow(false)} dialogClassName="modal-wide-tabs" className="floating-form-modal">
      <Form onSubmit={save}>
        <Modal.Header closeButton><Modal.Title>{editing ? "Editar" : "Nova"} regra</Modal.Title></Modal.Header>
        <Modal.Body>
          <FormTabs tabs={modalTabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />

          <TabPanel activeKey={activeTab} eventKey="rule">
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Nome da regra</Form.Label>
                  <Form.Control required value={form.name} onChange={(event) => update({ name: event.target.value })} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Status gatilho</Form.Label>
                  <Form.Select value={form.trigger_status} onChange={(event) => update({ trigger_status: event.target.value })}>
                    {workOrderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="message">
            <Row className="g-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Canal</Form.Label>
                  <Form.Select value={form.channel} onChange={(event) => update({ channel: event.target.value, template_id: "" })}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Enviar para</Form.Label>
                  <Form.Select value={form.recipient_target || "customer"} onChange={(event) => update({ recipient_target: event.target.value })}>
                    <option value="customer">Cliente</option>
                    <option value="workshop">Oficina</option>
                    <option value="both">Cliente e oficina</option>
                  </Form.Select>
                  <Form.Text>Email e WhatsApp da oficina são os cadastrados no admin.</Form.Text>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>Template</Form.Label>
                  <Form.Select required value={form.template_id || ""} onChange={(event) => update({ template_id: event.target.value })}>
                    <option value="">Selecione</option>
                    {templatesForChannel.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </Form.Select>
                  <Form.Text>O canal da regra precisa ser igual ao canal do template.</Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="behavior">
            <Row className="g-3">
              <Col md={6}>
                <Form.Check label="Ativa" checked={!!form.is_active} onChange={(event) => update({ is_active: event.target.checked })} />
              </Col>
              <Col md={6}>
                <Form.Check label="Enviar só uma vez para este status em cada OS" checked={!!form.send_once_per_status} onChange={(event) => update({ send_once_per_status: event.target.checked })} />
              </Col>
            </Row>
            <NoticeBox variant="info" className="mt-3" title="Controle contra envio repetido">
              Quando o envio único está ativo, a mesma OS não recebe novamente esta regra ao permanecer no mesmo status.
            </NoticeBox>
          </TabPanel>
        </Modal.Body>
        <TabbedFormFooter tabs={modalTabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
      </Form>
    </Modal>
  </>;
}
