import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

const defaultChecklist = {
  protecao_veiculo: false,
  ferramentas_conferidas: false,
  teste_funcionamento: false,
  vazamentos_ruidos: false,
  area_limpa: false,
};

const checklistLabels = {
  protecao_veiculo: "Proteção do veículo aplicada",
  ferramentas_conferidas: "Ferramentas e peças conferidas",
  teste_funcionamento: "Teste de funcionamento executado",
  vazamentos_ruidos: "Sem vazamentos, ruídos ou anomalias",
  area_limpa: "Área de trabalho limpa e organizada",
};

function dateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function ServiceCard({ item, onStart, onComplete, busyId }) {
  const busy = busyId === item.id;
  return (
    <Card className="border-0 shadow-sm technical-service-card mb-3">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div className="fw-semibold">{item.description}</div>
            <div className="small text-muted">
              {item.work_order_number} · {item.customer_name || "Cliente não informado"} · {item.vehicle_display || "Sem veículo"}
            </div>
          </div>
          <StatusBadge value={item.status} label={item.status === "in_progress" ? "Em execução" : item.status === "done" ? "Concluído" : "Pendente"} />
        </div>
        <Row className="g-2 mt-3 small">
          <Col md={4}><span className="text-muted">Técnico:</span> <strong>{item.technician_name || "Sem responsável"}</strong></Col>
          <Col md={4}><span className="text-muted">Início:</span> <strong>{dateTime(item.started_at)}</strong></Col>
          <Col md={4}><span className="text-muted">Tempo:</span> <strong>{item.duration_label || "-"}</strong></Col>
        </Row>
        {item.execution_notes ? <div className="technical-note mt-3"><strong>Execução:</strong><br />{item.execution_notes}</div> : null}
        {item.quality_checked_at ? <Badge bg="success" className="mt-3">Conferido</Badge> : null}
        <div className="d-flex justify-content-end gap-2 mt-3">
          <Button as={Link} to={`/work-orders/${item.work_order}`} size="sm" variant="outline-secondary">Abrir OS</Button>
          {item.status !== "in_progress" && item.status !== "done" ? <Button disabled={busy} size="sm" onClick={() => onStart(item)}>Iniciar</Button> : null}
          {item.status === "in_progress" ? <Button disabled={busy} size="sm" variant="success" onClick={() => onComplete(item)}>Concluir</Button> : null}
        </div>
      </Card.Body>
    </Card>
  );
}

function ServiceTable({ title, items, onStart, onComplete, busyId }) {
  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>{title}</span>
        <Badge bg="secondary">{items.length}</Badge>
      </Card.Header>
      <Card.Body>
        {items.length ? items.map((item) => <ServiceCard key={item.id} item={item} onStart={onStart} onComplete={onComplete} busyId={busyId} />) : <EmptyState title="Nenhum serviço nesta fila" />}
      </Card.Body>
    </Card>
  );
}

export default function TechnicalWorkbenchPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [startModal, setStartModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [startForm, setStartForm] = useState({ note: "" });
  const [completeForm, setCompleteForm] = useState({ technical_diagnosis: "", execution_notes: "", checklist: defaultChecklist, mark_order_quality_check: true });

  async function load() {
    try {
      setData((await api.get("/workshop/technical/dashboard/")).data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  const counts = data?.counts || {};
  const pending = data?.pending_services || [];
  const inProgress = data?.in_progress_services || [];
  const done = data?.done_services || [];

  const totalOpen = useMemo(() => (counts.pending || 0) + (counts.in_progress || 0), [counts]);

  function openStart(item) {
    setSelected(item);
    setStartForm({ note: "" });
    setStartModal(true);
  }

  function openComplete(item) {
    setSelected(item);
    setCompleteForm({
      technical_diagnosis: item.technical_diagnosis || "",
      execution_notes: item.execution_notes || "",
      checklist: { ...defaultChecklist, ...(item.checklist || {}) },
      mark_order_quality_check: true,
    });
    setCompleteModal(true);
  }

  async function submitStart(event) {
    event.preventDefault();
    if (!selected) return;
    setBusyId(selected.id);
    try {
      await api.post(`/workshop/work-order-services/${selected.id}/start-execution/`, startForm);
      setStartModal(false);
      setNotice("Serviço iniciado com sucesso.");
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function submitComplete(event) {
    event.preventDefault();
    if (!selected) return;
    setBusyId(selected.id);
    try {
      await api.post(`/workshop/work-order-services/${selected.id}/complete-execution/`, completeForm);
      setCompleteModal(false);
      setNotice("Serviço concluído e registrado na OS.");
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Bancada técnica" subtitle="Fila de serviços atribuídos ao técnico, mecânico, funileiro ou eletricista." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <SystemToast message={notice} variant="success" delay={3000} onClose={() => setNotice("")} />

      <Row className="g-3 mb-4">
        <Col md={3}><Card className="card-kpi"><Card.Body><div className="text-muted small">Serviços abertos</div><div className="display-6 fw-bold">{totalOpen}</div></Card.Body></Card></Col>
        <Col md={3}><Card className="card-kpi"><Card.Body><div className="text-muted small">Pendentes</div><div className="display-6 fw-bold">{counts.pending || 0}</div></Card.Body></Card></Col>
        <Col md={3}><Card className="card-kpi"><Card.Body><div className="text-muted small">Em execução</div><div className="display-6 fw-bold">{counts.in_progress || 0}</div></Card.Body></Card></Col>
        <Col md={3}><Card className="card-kpi"><Card.Body><div className="text-muted small">Concluídos hoje</div><div className="display-6 fw-bold">{counts.done_today || 0}</div></Card.Body></Card></Col>
      </Row>

      <Row className="g-3">
        <Col xl={4}><ServiceTable title="Fila do técnico" items={pending} onStart={openStart} onComplete={openComplete} busyId={busyId} /></Col>
        <Col xl={4}><ServiceTable title="Em execução" items={inProgress} onStart={openStart} onComplete={openComplete} busyId={busyId} /></Col>
        <Col xl={4}><ServiceTable title="Concluídos recentes" items={done} onStart={openStart} onComplete={openComplete} busyId={busyId} /></Col>
      </Row>

      <Card className="border-0 shadow-sm mt-4">
        <Card.Header className="bg-white fw-semibold">Resumo de conferência</Card.Header>
        <Card.Body className="p-0">
          <Table responsive className="mb-0">
            <tbody>
              <tr><td>Serviços aguardando conferência</td><td className="text-end fw-semibold">{counts.quality_pending || 0}</td></tr>
              <tr><td>OS com previsão vencida</td><td className="text-end fw-semibold">{counts.late_promised_orders || 0}</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={startModal} onHide={() => setStartModal(false)}>
        <Form onSubmit={submitStart}>
          <Modal.Header closeButton><Modal.Title>Iniciar serviço</Modal.Title></Modal.Header>
          <Modal.Body>
            <p className="mb-2"><strong>{selected?.description}</strong></p>
            <p className="text-muted small">{selected?.work_order_number} · {selected?.vehicle_display}</p>
            <Form.Label>Observação inicial</Form.Label>
            <Form.Control as="textarea" rows={3} value={startForm.note} onChange={(event) => setStartForm({ note: event.target.value })} placeholder="Ex.: veículo na baia 2, aguardando peça, diagnóstico iniciado..." />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setStartModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={busyId === selected?.id}>Iniciar</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal size="lg" show={completeModal} onHide={() => setCompleteModal(false)}>
        <Form onSubmit={submitComplete}>
          <Modal.Header closeButton><Modal.Title>Concluir serviço técnico</Modal.Title></Modal.Header>
          <Modal.Body>
            <p className="mb-2"><strong>{selected?.description}</strong></p>
            <p className="text-muted small">{selected?.work_order_number} · {selected?.customer_name} · {selected?.vehicle_display}</p>
            <Form.Label>Diagnóstico técnico</Form.Label>
            <Form.Control className="mb-3" as="textarea" rows={3} value={completeForm.technical_diagnosis} onChange={(event) => setCompleteForm({ ...completeForm, technical_diagnosis: event.target.value })} />
            <Form.Label>O que foi executado</Form.Label>
            <Form.Control required className="mb-3" as="textarea" rows={4} value={completeForm.execution_notes} onChange={(event) => setCompleteForm({ ...completeForm, execution_notes: event.target.value })} />
            <div className="fw-semibold mb-2">Checklist de entrega técnica</div>
            <Row>
              {Object.entries(checklistLabels).map(([key, label]) => (
                <Col md={6} key={key}>
                  <Form.Check className="mb-2" label={label} checked={!!completeForm.checklist[key]} onChange={(event) => setCompleteForm({ ...completeForm, checklist: { ...completeForm.checklist, [key]: event.target.checked } })} />
                </Col>
              ))}
            </Row>
            <Form.Check className="mt-3" label="Enviar OS para conferência automaticamente quando todos os serviços estiverem concluídos" checked={!!completeForm.mark_order_quality_check} onChange={(event) => setCompleteForm({ ...completeForm, mark_order_quality_check: event.target.checked })} />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setCompleteModal(false)}>Cancelar</Button>
            <Button type="submit" variant="success" disabled={busyId === selected?.id}>Concluir serviço</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
