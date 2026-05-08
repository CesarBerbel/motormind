import React, { useEffect, useState } from "react";
import { Button, Card, Form, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { confirmDialog } from "../components/ConfirmDialog";

export default function AutomationsPage() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const params = active ? { active } : {};
      const { data } = await api.get("/automations/", { params });
      setItems(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }
  useEffect(() => { load(); }, [active]);

  async function action(id, name) {
    try {
      await api.post(`/automations/${id}/${name}/`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }
  async function remove(item) {
    if (!(await confirmDialog(`Excluir automacao ${item.name}?`))) return;
    try {
      await api.delete(`/automations/${item.id}/`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Automacoes" subtitle="Envios programados e recorrentes.">
        <Button as={Link} to="/automations/new">Nova automacao</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm mb-3"><Card.Body className="d-flex gap-2 align-items-center"><Form.Label className="mb-0">Status</Form.Label><Form.Select style={{ maxWidth: 220 }} value={active} onChange={(e) => setActive(e.target.value)}><option value="">Todos</option><option value="true">Ativas</option><option value="false">Pausadas</option></Form.Select></Card.Body></Card>
      <Card className="border-0 shadow-sm"><Card.Body className="p-0">{items.length === 0 ? <EmptyState /> : (
        <Table responsive hover className="mb-0">
          <thead><tr><th>Nome</th><th>Canal</th><th>Template</th><th>Destino</th><th>Agenda</th><th>Proxima</th><th>Status</th><th></th></tr></thead>
          <tbody>{items.map((item) => (
            <tr key={item.id}>
              <td className="fw-semibold">{item.name}</td>
              <td><StatusBadge value={item.channel} /></td>
              <td>{item.template_name}</td>
              <td>{item.contact_name || item.group_name || item.recipient_user_name || item.target_type}</td>
              <td>{item.schedule_type}</td>
              <td>{item.next_run_at ? new Date(item.next_run_at).toLocaleString("pt-BR") : "-"}</td>
              <td>{item.is_active ? "Ativa" : "Pausada"}</td>
              <td className="text-end text-nowrap">
                <Button size="sm" as={Link} to={`/automations/${item.id}`} variant="outline-primary" className="me-2">Editar</Button>
                <Button size="sm" variant="outline-success" className="me-2" onClick={() => action(item.id, "run_now")}>Executar</Button>
                <Button size="sm" variant="outline-secondary" className="me-2" onClick={() => action(item.id, item.is_active ? "pause" : "resume")}>{item.is_active ? "Pausar" : "Ativar"}</Button>
                <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}</Card.Body></Card>
    </>
  );
}
