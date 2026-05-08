import React, { useEffect, useState } from "react";
import { Button, Card, Form, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { confirmDialog } from "../components/ConfirmDialog";

export default function TemplatesPage() {
  const [items, setItems] = useState([]);
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/templates/", { params: channel ? { channel } : {} });
      setItems(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [channel]);

  async function remove(item) {
    if (!(await confirmDialog(`Excluir template ${item.name}?`))) return;
    try {
      await api.delete(`/templates/${item.id}/`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Templates" subtitle="Textos parametrizados para email e WhatsApp.">
        <Button as={Link} to="/templates/new">Novo template</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-3">
        <Card.Body className="d-flex gap-2 align-items-center">
          <Form.Label className="mb-0">Canal</Form.Label>
          <Form.Select style={{ maxWidth: 220 }} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Todos</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </Form.Select>
        </Card.Body>
      </Card>
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {items.length === 0 ? <EmptyState /> : (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Nome</th><th>Canal</th><th>Assunto / texto</th><th>Ativo</th><th>Atualizado</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="fw-semibold">{item.name}</td>
                    <td><StatusBadge value={item.channel} /></td>
                    <td>{item.channel === "email" ? item.email_subject : item.whatsapp_body.slice(0, 80)}</td>
                    <td>{item.is_active ? "Sim" : "Nao"}</td>
                    <td>{new Date(item.updated_at).toLocaleString("pt-BR")}</td>
                    <td className="text-end">
                      <Button size="sm" as={Link} to={`/templates/${item.id}`} variant="outline-primary" className="me-2">Editar</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
