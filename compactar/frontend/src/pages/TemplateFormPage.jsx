import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Modal, Row } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import api, { apiError } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import NoticeBox from "../components/NoticeBox";
import PageHeader from "../components/PageHeader";
import RichTextEditor from "../components/RichTextEditor";
import SystemToast from "../components/SystemToast";
import VariableHelp, { templateVariables } from "../components/VariableHelp";

const empty = {
  name: "",
  channel: "email",
  description: "",
  email_subject: "Ola {{ nome_contato }}",
  email_html_body: "<h1>Ola {{ nome_contato }}</h1><p>Mensagem enviada por {{ nome_usuario }}.</p>",
  email_text_body: "",
  whatsapp_body: "Ola {{ nome_contato }}, aqui e {{ nome_usuario }}.",
  is_active: true,
};

export default function TemplateFormPage({ embedded = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [activeTab, setActiveTab] = useState("identification");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const tabs = useMemo(() => [
    { key: "identification", label: "Identificação", description: "Nome, canal e descrição" },
    { key: "content", label: "Mensagem", description: form.channel === "email" ? "Assunto, HTML e fallback" : "Texto do WhatsApp" },
    { key: "status", label: "Status", description: "Ativação e prévia" },
  ], [form.channel]);

  async function load() {
    if (!id) return;
    try {
      const { data } = await api.get(`/templates/${id}/`);
      setForm({ ...empty, ...data });
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [id]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      if (id) {
        await api.put(`/templates/${id}/`, form);
        navigate("/templates");
      } else {
        await api.post("/templates/", form);
        navigate("/templates");
      }
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function doPreview() {
    if (!id) {
      setError("Salve o template antes de visualizar a renderização pelo servidor.");
      return;
    }
    try {
      const { data } = await api.post(`/templates/${id}/preview/`, { context_overrides: {} });
      setPreview(data);
      setShowPreview(true);
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      {!embedded ? (
        <PageHeader title={id ? "Editar template" : "Novo template"} subtitle="Configure modelos de email e WhatsApp com variáveis dinâmicas.">
          <Button as={Link} to="/templates" variant="outline-secondary">Voltar</Button>
        </PageHeader>
      ) : null}

      <ErrorAlert error={error} onClose={() => setError("")} />
      <SystemToast message={success} variant="success" delay={3000} onClose={() => setSuccess("")} />

      <Row className="g-3 align-items-start">
        <Col xl={9} lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />
              <Form onSubmit={save}>
                <TabPanel activeKey={activeTab} eventKey="identification">
                  <Row className="g-3">
                    <Col md={8}>
                      <Form.Group>
                        <Form.Label>Nome</Form.Label>
                        <Form.Control value={form.name} onChange={(event) => update({ name: event.target.value })} required />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Canal</Form.Label>
                        <Form.Select value={form.channel} onChange={(event) => update({ channel: event.target.value })}>
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group>
                        <Form.Label>Descrição administrativa</Form.Label>
                        <Form.Control as="textarea" rows={3} value={form.description || ""} onChange={(event) => update({ description: event.target.value })} placeholder="Explique quando este template deve ser usado." />
                      </Form.Group>
                    </Col>
                  </Row>
                </TabPanel>

                <TabPanel activeKey={activeTab} eventKey="content">
                  {form.channel === "email" ? (
                    <>
                      <Form.Group className="mb-3">
                        <Form.Label>Assunto do email</Form.Label>
                        <Form.Control value={form.email_subject || ""} onChange={(event) => update({ email_subject: event.target.value })} required />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Corpo HTML</Form.Label>
                        <RichTextEditor value={form.email_html_body || ""} onChange={(value) => update({ email_html_body: value })} minHeight={320} placeholder="Digite o conteúdo visual do email." variables={templateVariables} />
                        <Form.Text>Use as variáveis do painel lateral, como {"{{ nome_contato }}"}, diretamente no editor.</Form.Text>
                      </Form.Group>
                      <Form.Group>
                        <Form.Label>Fallback em texto puro</Form.Label>
                        <Form.Control as="textarea" rows={6} className="code-help" value={form.email_text_body || ""} onChange={(event) => update({ email_text_body: event.target.value })} placeholder="Se vazio, o backend gera texto a partir do HTML." />
                      </Form.Group>
                    </>
                  ) : (
                    <>
                      <NoticeBox variant="info" className="mb-3" title="WhatsApp usa texto simples">
                        O WhatsApp não renderiza HTML como um email. Por isso, este campo continua como texto puro para evitar formatação inválida no envio.
                      </NoticeBox>
                      <Form.Group>
                        <Form.Label>Texto WhatsApp</Form.Label>
                        <Form.Control as="textarea" rows={12} className="code-help" value={form.whatsapp_body || ""} onChange={(event) => update({ whatsapp_body: event.target.value })} required maxLength={4096} />
                        <Form.Text>Limite de 4096 caracteres. Variáveis como {"{{ nome_contato }}"} continuam funcionando.</Form.Text>
                      </Form.Group>
                    </>
                  )}
                </TabPanel>

                <TabPanel activeKey={activeTab} eventKey="status">
                  <Card className="form-section-card">
                    <Card.Body>
                      <div className="form-section-title">Publicação do template</div>
                      <Form.Check className="mb-3" label="Template ativo para envios e automações" checked={!!form.is_active} onChange={(event) => update({ is_active: event.target.checked })} />
                      <NoticeBox variant="info" className="mb-3" title="Prévia renderizada pelo backend">
                        A visualização usa o endpoint do servidor, aplicando as mesmas regras de variáveis utilizadas no envio real.
                      </NoticeBox>
                      <Button type="button" variant="outline-primary" onClick={doPreview}>Visualizar renderização</Button>
                    </Card.Body>
                  </Card>
                </TabPanel>

                <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/templates")} saveLabel="Salvar template" />
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} lg={4}>
          <VariableHelp />
        </Col>
      </Row>

      <Modal size="lg" show={showPreview} onHide={() => setShowPreview(false)}>
        <Modal.Header closeButton><Modal.Title>Preview renderizado</Modal.Title></Modal.Header>
        <Modal.Body>
          {form.channel === "email" ? (
            <>
              <h6>Assunto</h6>
              <p>{preview?.subject}</p>
              <h6>HTML</h6>
              <div className="template-preview-frame" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview?.html || "") }} />
              <h6 className="mt-3">Texto puro</h6>
              <pre className="bg-light p-3 rounded">{preview?.text}</pre>
            </>
          ) : <pre className="bg-light p-3 rounded">{preview?.text}</pre>}
        </Modal.Body>
      </Modal>
    </>
  );
}
