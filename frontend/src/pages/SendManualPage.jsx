import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import NoticeBox from "../components/NoticeBox";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import SystemToast from "../components/SystemToast";
import VariableHelp from "../components/VariableHelp";

const tabs = [
  { key: "template", label: "Mensagem", description: "Canal e template" },
  { key: "recipients", label: "Destinatários", description: "Contatos, grupos ou avulsos" },
  { key: "variables", label: "Variáveis", description: "JSON complementar" },
  { key: "result", label: "Resultado", description: "Retorno do envio" },
];

export default function SendManualPage() {
  const [templates, setTemplates] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("template");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    channel: "email",
    template_id: "",
    target_type: "contacts",
    contact_ids: [],
    group_id: "",
    user_ids: [],
    email_to_text: "",
    phone_to_text: "",
    context_overrides_text: "{}",
  });

  async function load() {
    try {
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
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  const filteredTemplates = useMemo(() => templates.filter((tpl) => tpl.channel === form.channel), [templates, form.channel]);
  const tabsWithResult = tabs.map((tab) => tab.key === "result" ? { ...tab, badge: result?.sent?.length || "" } : tab);

  function selected(event) {
    return Array.from(event.target.selectedOptions).map((option) => Number(option.value));
  }

  function splitLines(text) {
    return text.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
  }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setResult(null);
    let overrides = {};
    try {
      overrides = JSON.parse(form.context_overrides_text || "{}");
    } catch {
      setError("Variáveis extras devem ser um JSON válido.");
      setActiveTab("variables");
      return;
    }
    const payload = {
      channel: form.channel,
      template_id: Number(form.template_id),
      target_type: form.target_type,
      contact_ids: form.contact_ids,
      group_id: form.group_id ? Number(form.group_id) : null,
      user_ids: form.user_ids,
      email_to: splitLines(form.email_to_text),
      phone_to: splitLines(form.phone_to_text),
      context_overrides: overrides,
    };
    try {
      const { data } = await api.post("/send/manual/", payload);
      setResult(data);
      setActiveTab("result");
      setSuccess("Envio manual processado com sucesso.");
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Envio manual" subtitle="Escolha canal, template e destinatários para disparo imediato." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <SystemToast message={success} variant="success" delay={3000} onClose={() => setSuccess("")} />

      <Row className="g-3 align-items-start">
        <Col xl={9} lg={8}>
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body>
              <FormTabs tabs={tabsWithResult} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />
              <Form onSubmit={submit}>
                <TabPanel activeKey={activeTab} eventKey="template">
                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Canal</Form.Label>
                        <Form.Select value={form.channel} onChange={(event) => update({ channel: event.target.value, template_id: "" })}>
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={8}>
                      <Form.Group>
                        <Form.Label>Template</Form.Label>
                        <Form.Select value={form.template_id} onChange={(event) => update({ template_id: event.target.value })} required>
                          <option value="">Selecione</option>
                          {filteredTemplates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>
                  <NoticeBox variant="info" className="mt-3" title="Mensagem renderizada pelo template">
                    O conteúdo do envio vem do template selecionado. Para alterar corpo, assunto ou texto do WhatsApp, edite o template antes do disparo.
                  </NoticeBox>
                </TabPanel>

                <TabPanel activeKey={activeTab} eventKey="recipients">
                  <Form.Group className="mb-3">
                    <Form.Label>Tipo de destino</Form.Label>
                    <Form.Select value={form.target_type} onChange={(event) => update({ target_type: event.target.value })}>
                      <option value="contacts">Contatos selecionados</option>
                      <option value="group">Grupo</option>
                      <option value="users">Usuários selecionados</option>
                      <option value="all_contacts">Todos os contatos ativos</option>
                      <option value="all_users">Todos os usuários ativos</option>
                      <option value="raw">Destinatários avulsos</option>
                    </Form.Select>
                  </Form.Group>

                  {form.target_type === "contacts" && (
                    <Form.Group className="mb-3">
                      <Form.Label>Contatos</Form.Label>
                      <Form.Select multiple value={form.contact_ids.map(String)} onChange={(event) => update({ contact_ids: selected(event) })}>
                        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name} - {form.channel === "email" ? contact.email : contact.phone_e164}</option>)}
                      </Form.Select>
                      <Form.Text>Segure Ctrl no Windows para selecionar mais de um contato.</Form.Text>
                    </Form.Group>
                  )}

                  {form.target_type === "group" && (
                    <Form.Group className="mb-3">
                      <Form.Label>Grupo</Form.Label>
                      <Form.Select value={form.group_id} onChange={(event) => update({ group_id: event.target.value })}>
                        <option value="">Selecione</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </Form.Select>
                    </Form.Group>
                  )}

                  {form.target_type === "users" && (
                    <Form.Group className="mb-3">
                      <Form.Label>Usuários</Form.Label>
                      <Form.Select multiple value={form.user_ids.map(String)} onChange={(event) => update({ user_ids: selected(event) })}>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username} - {user.email}</option>)}
                      </Form.Select>
                      <Form.Text>Segure Ctrl no Windows para selecionar mais de um usuário.</Form.Text>
                    </Form.Group>
                  )}

                  {form.target_type === "raw" && form.channel === "email" && (
                    <Form.Group className="mb-3">
                      <Form.Label>Emails avulsos</Form.Label>
                      <Form.Control as="textarea" rows={5} placeholder="um@email.com, outro@email.com" value={form.email_to_text} onChange={(event) => update({ email_to_text: event.target.value })} />
                    </Form.Group>
                  )}

                  {form.target_type === "raw" && form.channel === "whatsapp" && (
                    <Form.Group className="mb-3">
                      <Form.Label>Telefones avulsos</Form.Label>
                      <Form.Control as="textarea" rows={5} placeholder={`(11) 99999-9999\n+5511988887777`} value={form.phone_to_text} onChange={(event) => update({ phone_to_text: event.target.value })} />
                      <Form.Text>Informe um telefone por linha. O backend normaliza para +55 com DDD antes de enviar WhatsApp.</Form.Text>
                    </Form.Group>
                  )}
                </TabPanel>

                <TabPanel activeKey={activeTab} eventKey="variables">
                  <Form.Group>
                    <Form.Label>Variáveis extras JSON</Form.Label>
                    <Form.Control as="textarea" rows={8} className="code-help" value={form.context_overrides_text} onChange={(event) => update({ context_overrides_text: event.target.value })} />
                    <Form.Text>Use este campo apenas para sobrescrever ou complementar variáveis do template no disparo manual.</Form.Text>
                  </Form.Group>
                </TabPanel>

                <TabPanel activeKey={activeTab} eventKey="result">
                  {!result ? (
                    <NoticeBox variant="info" title="Nenhum envio processado">
                      Após clicar em Enviar agora, o retorno de cada destino aparecerá aqui.
                    </NoticeBox>
                  ) : (
                    <Card className="border-0 bg-light">
                      <Card.Header className="bg-white fw-semibold">Resultado do envio</Card.Header>
                      <Card.Body className="p-0">
                        <Table responsive hover className="mb-0">
                          <thead><tr><th>Destino</th><th>Status</th><th>Erro</th></tr></thead>
                          <tbody>{(result.sent || []).map((log) => <tr key={log.id}><td>{log.to_email || log.to_phone || log.recipient_name}</td><td><StatusBadge value={log.status} /></td><td>{log.error_message}</td></tr>)}</tbody>
                        </Table>
                        {(result.skipped || []).length > 0 && <div className="p-3 text-muted">Ignorados: {result.skipped.map((item) => `${item.id}: ${item.reason}`).join("; ")}</div>}
                      </Card.Body>
                    </Card>
                  )}
                </TabPanel>

                <div className="d-flex gap-2 justify-content-end mt-4">
                  <Button type="submit">Enviar agora</Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} lg={4}><VariableHelp /></Col>
      </Row>
    </>
  );
}
