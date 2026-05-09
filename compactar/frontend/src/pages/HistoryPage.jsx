import React, { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import DOMPurify from "dompurify";
import api, { apiError, results } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { buildSearchSuggestions } from "../utils/search";

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ channel: "", status: "", search: "" });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    try {
      const { data } = await api.get("/message-logs/", { params });
      setItems(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader title="Historico" subtitle="Auditoria de emails e mensagens WhatsApp enviadas." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-3"><Card.Body><Row className="g-2"><Col md={3}><Form.Select value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}><option value="">Todos os canais</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></Form.Select></Col><Col md={3}><Form.Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos os status</option><option value="pending">Pendente</option><option value="sending">Enviando</option><option value="sent">Enviado</option><option value="failed">Falhou</option><option value="skipped">Ignorado</option></Form.Select></Col><Col md={4}><SearchAutocompleteInput placeholder="Buscar destino ou assunto" value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} onSearch={load} suggestions={buildSearchSuggestions(items, ["recipient_name", "to_email", "to_phone", "template_name", "rendered_subject", "status"])} /></Col><Col md={2}><Button variant="outline-primary" className="w-100" onClick={load}>Filtrar</Button></Col></Row></Card.Body></Card>
      <Card className="border-0 shadow-sm"><Card.Body className="p-0">{items.length === 0 ? <EmptyState /> : (
        <Table responsive hover className="mb-0"><thead><tr><th>Data</th><th>Canal</th><th>Destino</th><th>Template</th><th>Status</th><th>Erro</th><th></th></tr></thead><tbody>{items.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString("pt-BR")}</td><td><StatusBadge value={log.channel} /></td><td>{log.to_email || log.to_phone || log.recipient_name}</td><td>{log.template_name}</td><td><StatusBadge value={log.status} /></td><td className="text-danger small">{log.error_message?.slice(0, 80)}</td><td className="text-end"><Button size="sm" variant="outline-primary" onClick={() => setSelected(log)}>Ver</Button></td></tr>)}</tbody></Table>
      )}</Card.Body></Card>
      <Modal size="lg" show={!!selected} onHide={() => setSelected(null)}>
        <Modal.Header closeButton><Modal.Title>Detalhe do envio</Modal.Title></Modal.Header>
        <Modal.Body>
          {selected && <>
            <dl className="row"><dt className="col-sm-3">Destino</dt><dd className="col-sm-9">{selected.to_email || selected.to_phone || selected.recipient_name}</dd><dt className="col-sm-3">Status</dt><dd className="col-sm-9"><StatusBadge value={selected.status} /></dd><dt className="col-sm-3">Erro</dt><dd className="col-sm-9 text-danger">{selected.error_message || "-"}</dd><dt className="col-sm-3">Provider ID</dt><dd className="col-sm-9">{selected.provider_message_id || "-"}</dd></dl>
            {selected.channel === "email" && <><h6>Assunto</h6><p>{selected.rendered_subject}</p><h6>HTML</h6><div className="template-preview-frame" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.rendered_html || "") }} /></>}
            <h6 className="mt-3">Texto</h6><pre className="bg-light p-3 rounded">{selected.rendered_text}</pre>
            <h6>Resposta do provider</h6><pre className="bg-light p-3 rounded small">{JSON.stringify(selected.provider_response, null, 2)}</pre>
          </>}
        </Modal.Body>
      </Modal>
    </>
  );
}
