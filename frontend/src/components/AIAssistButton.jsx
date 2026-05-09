import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import api, { apiError } from "../api/client";

const labels = {
  customer_report: "relato do cliente",
  diagnosis: "diagnóstico",
  service_done: "serviço realizado",
  email: "email",
  whatsapp: "WhatsApp",
  template_email: "template de email",
  template_whatsapp: "template de WhatsApp",
};

export default function AIAssistButton({ task, value = "", context = "", onApply, size = "sm", variant = "outline-primary", className = "" }) {
  const [show, setShow] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [promptId, setPromptId] = useState("");
  const [providerInfo, setProviderInfo] = useState({ has_provider: false, provider_label: "", model_name: "" });
  const [draft, setDraft] = useState(value || "");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    setDraft(value || "");
    setResult("");
    setError("");
    api.get(`/ai/assist/?task=${encodeURIComponent(task)}`)
      .then(({ data }) => {
        const availablePrompts = data.prompts || [];
        setPrompts(availablePrompts);
        const defaultPrompt = availablePrompts.find((item) => item.is_default) || availablePrompts[0];
        setPromptId(defaultPrompt ? String(defaultPrompt.id) : "");
        setProviderInfo({ has_provider: Boolean(data.has_provider), provider_label: data.provider_label || "", model_name: data.model_name || "" });
      })
      .catch((err) => setError(apiError(err)));
  }, [show, value, task]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const payload = { task, draft, context };
      if (promptId) payload.prompt_id = Number(promptId);
      const { data } = await api.post("/ai/assist/", payload);
      setResult(data.text || "");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    onApply(result);
    setShow(false);
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} className={className} onClick={() => setShow(true)}>IA</Button>
      <Modal size="xl" show={show} onHide={() => setShow(false)} centered scrollable>
        <Modal.Header closeButton><Modal.Title>Assistente de IA - {labels[task] || "texto"}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {!providerInfo.has_provider ? <Alert variant="warning">Nenhum provedor de IA ativo foi configurado no admin do Django.</Alert> : null}
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <Form.Group className="flex-grow-1" style={{ minWidth: 260 }}>
              <Form.Label>Prompt</Form.Label>
              <Form.Select value={promptId} onChange={(event) => setPromptId(event.target.value)}>
                {prompts.length ? prompts.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}{item.task_label ? ` - ${item.task_label}` : ""}</option>
                )) : <option value="">Prompt padrão do sistema</option>}
              </Form.Select>
            </Form.Group>
            <div className="small text-muted pb-2">
              IA ativa: {providerInfo.provider_label || "não configurada"}{providerInfo.model_name ? ` - ${providerInfo.model_name}` : ""}
            </div>
            <Button type="button" onClick={generate} disabled={loading || !providerInfo.has_provider}>{loading ? <Spinner animation="border" size="sm" /> : "Gerar texto"}</Button>
          </div>
          {prompts.find((item) => String(item.id) === String(promptId))?.description ? (
            <Alert variant="light" className="border small py-2">{prompts.find((item) => String(item.id) === String(promptId))?.description}</Alert>
          ) : null}
          <Form.Group className="mb-3">
            <Form.Label>Texto base</Form.Label>
            <Form.Control as="textarea" rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite um rascunho ou deixe em branco para a IA sugerir." />
          </Form.Group>
          <Form.Group>
            <Form.Label>Resultado</Form.Label>
            <Form.Control as="textarea" rows={16} value={result} onChange={(event) => setResult(event.target.value)} placeholder="O texto gerado aparecerá aqui para revisão." />
          </Form.Group>
          <div className="small text-muted mt-2">Revise o texto antes de aplicar. A IA pode cometer erros. O provedor/modelo é definido somente no admin do Django.</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShow(false)}>Cancelar</Button>
          <Button onClick={apply} disabled={!result.trim()}>Aplicar texto</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
