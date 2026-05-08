import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import NoticeBox from "../components/NoticeBox";
import PageHeader from "../components/PageHeader";

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoLocal(value) {
  return value ? new Date(value).toISOString() : null;
}

const empty = {
  name: "",
  channel: "email",
  template_id: "",
  target_type: "group",
  contact_id: "",
  group_id: "",
  recipient_user_id: "",
  schedule_type: "once",
  run_at: localDateTime(new Date(Date.now() + 3600 * 1000).toISOString()),
  interval_minutes: "",
  is_active: true,
};

const tabs = [
  { key: "message", label: "Mensagem", description: "Nome, canal e template" },
  { key: "target", label: "Destino", description: "Quem receberá" },
  { key: "schedule", label: "Agenda", description: "Data e recorrência" },
  { key: "status", label: "Status", description: "Ativação" },
];

export default function AutomationFormPage({ embedded = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [activeTab, setActiveTab] = useState("message");
  const [templates, setTemplates] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  async function loadLists() {
    const [tpl, cts, grps, usrs] = await Promise.all([
      api.get("/templates/", { params: { active: "true" } }),
      api.get("/contacts/"),
      api.get("/contact-groups/"),
      api.get("/users/"),
    ]);
    setTemplates(results(tpl.data));
    setContacts(results(cts.data));
    setGroups(results(grps.data));
    setUsers(results(usrs.data));
  }

  async function load() {
    try {
      await loadLists();
      if (id) {
        const { data } = await api.get(`/automations/${id}/`);
        setForm({
          name: data.name,
          channel: data.channel,
          template_id: data.template,
          target_type: data.target_type,
          contact_id: data.contact || "",
          group_id: data.group || "",
          recipient_user_id: data.recipient_user || "",
          schedule_type: data.schedule_type,
          run_at: localDateTime(data.run_at),
          interval_minutes: data.interval_minutes || "",
          is_active: data.is_active,
        });
      }
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [id]);

  const filteredTemplates = useMemo(() => templates.filter((tpl) => tpl.channel === form.channel), [templates, form.channel]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      channel: form.channel,
      template_id: Number(form.template_id),
      target_type: form.target_type,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      group_id: form.group_id ? Number(form.group_id) : null,
      recipient_user_id: form.recipient_user_id ? Number(form.recipient_user_id) : null,
      schedule_type: form.schedule_type,
      run_at: toIsoLocal(form.run_at),
      interval_minutes: form.interval_minutes ? Number(form.interval_minutes) : null,
      is_active: form.is_active,
    };
    try {
      if (id) await api.put(`/automations/${id}/`, payload);
      else await api.post("/automations/", payload);
      navigate("/automations");
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      {!embedded ? (
        <PageHeader title={id ? "Editar automação" : "Nova automação"} subtitle="Configure destino, recorrência e template de mensagem.">
          <Button as={Link} to="/automations" variant="outline-secondary">Voltar</Button>
        </PageHeader>
      ) : null}
      <ErrorAlert error={error} onClose={() => setError("")} />

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />
          <Form onSubmit={save}>
            <TabPanel activeKey={activeTab} eventKey="message">
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Nome</Form.Label>
                    <Form.Control value={form.name} onChange={(event) => update({ name: event.target.value })} required />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Canal</Form.Label>
                    <Form.Select value={form.channel} onChange={(event) => update({ channel: event.target.value, template_id: "" })}>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Template</Form.Label>
                    <Form.Select value={form.template_id} onChange={(event) => update({ template_id: event.target.value })} required>
                      <option value="">Selecione</option>
                      {filteredTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="target">
              <Row className="g-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Destino</Form.Label>
                    <Form.Select value={form.target_type} onChange={(event) => update({ target_type: event.target.value })}>
                      <option value="contact">Contato específico</option>
                      <option value="group">Grupo</option>
                      <option value="all_contacts">Todos os contatos ativos</option>
                      <option value="user">Usuário específico</option>
                      <option value="all_users">Todos os usuários ativos</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                {form.target_type === "contact" && (
                  <Col md={8}>
                    <Form.Group>
                      <Form.Label>Contato</Form.Label>
                      <Form.Select value={form.contact_id} onChange={(event) => update({ contact_id: event.target.value })}>
                        <option value="">Selecione</option>
                        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                )}
                {form.target_type === "group" && (
                  <Col md={8}>
                    <Form.Group>
                      <Form.Label>Grupo</Form.Label>
                      <Form.Select value={form.group_id} onChange={(event) => update({ group_id: event.target.value })}>
                        <option value="">Selecione</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                )}
                {form.target_type === "user" && (
                  <Col md={8}>
                    <Form.Group>
                      <Form.Label>Usuário</Form.Label>
                      <Form.Select value={form.recipient_user_id} onChange={(event) => update({ recipient_user_id: event.target.value })}>
                        <option value="">Selecione</option>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                )}
              </Row>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="schedule">
              <Row className="g-3">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Recorrência</Form.Label>
                    <Form.Select value={form.schedule_type} onChange={(event) => update({ schedule_type: event.target.value })}>
                      <option value="once">Uma vez</option>
                      <option value="interval">Intervalo em minutos</option>
                      <option value="daily">Diária</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Primeira execução</Form.Label>
                    <Form.Control type="datetime-local" value={form.run_at} onChange={(event) => update({ run_at: event.target.value })} required />
                  </Form.Group>
                </Col>
                {form.schedule_type === "interval" && (
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Intervalo em minutos</Form.Label>
                      <Form.Control type="number" min="1" value={form.interval_minutes} onChange={(event) => update({ interval_minutes: event.target.value })} />
                    </Form.Group>
                  </Col>
                )}
              </Row>
              <NoticeBox variant="info" className="mt-3" title="Processamento das automações">
                A execução depende do comando agendado do backend processar automações pendentes no horário configurado.
              </NoticeBox>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="status">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="form-section-title">Situação da automação</div>
                  <Form.Check className="mb-3" label="Automação ativa" checked={!!form.is_active} onChange={(event) => update({ is_active: event.target.checked })} />
                  <NoticeBox variant={form.is_active ? "success" : "warning"} title={form.is_active ? "Pronta para execução" : "Automação pausada"}>
                    {form.is_active ? "A automação será considerada pelo processamento recorrente." : "A automação ficará salva, mas não será executada enquanto estiver inativa."}
                  </NoticeBox>
                </Card.Body>
              </Card>
            </TabPanel>

            <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/automations")} saveLabel="Salvar automação" />
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}
