import React, { useEffect, useState } from "react";
import { Button, Card, Form, Modal, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import EmptyState from "../components/EmptyState";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = { name: "", description: "" };

export default function ContactGroupsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/contact-groups/");
      setItems(results(data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  function open(item = null) {
    setEditing(item);
    setForm(item ? { name: item.name, description: item.description || "" } : empty);
    setShow(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      if (editing) await api.put(`/contact-groups/${editing.id}/`, form);
      else await api.post("/contact-groups/", form);
      setShow(false);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(item) {
    if (!(await confirmDialog(`Excluir o grupo ${item.name}?`))) return;
    try {
      await api.delete(`/contact-groups/${item.id}/`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Grupos de contatos" subtitle="Organize contatos para envios segmentados.">
        <Button onClick={() => open()}>Novo grupo</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {items.length === 0 ? <EmptyState /> : (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Nome</th><th>Descricao</th><th>Contatos</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="fw-semibold">{item.name}</td>
                    <td>{item.description}</td>
                    <td>{item.contact_count}</td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" onClick={() => open(item)} className="me-2">Editar</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(item)}>Excluir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      <Modal show={show} onHide={() => setShow(false)}>
        <Form onSubmit={save}>
          <Modal.Header closeButton><Modal.Title>{editing ? "Editar grupo" : "Novo grupo"}</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nome</Form.Label>
              <Form.Control value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Form.Group>
            <Form.Group>
              <Form.Label>Descricao</Form.Label>
              <Form.Control as="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShow(false)}>Cancelar</Button><Button type="submit">Salvar</Button></Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
