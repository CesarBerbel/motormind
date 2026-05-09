import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import AIAssistButton from "../components/AIAssistButton";
import { money } from "../workshopOptions";

function dateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function actionLabel(action, status) {
  if (action === "start") return status === "open" ? "Iniciar diagnóstico" : status === "waiting_parts" ? "Retomar" : "Iniciar execução";
  if (action === "complete") return status === "diagnosis" ? "Concluir diagnóstico" : "Concluir execução";
  if (action === "wait_parts") return "Aguardar peça";
  return "Mover";
}

function nextActionHint(status) {
  if (status === "open") return "Iniciar leva para Diagnóstico";
  if (status === "approved") return "Iniciar leva para Em execução";
  if (status === "diagnosis") return "Concluir leva para Aguardando aprovação";
  if (status === "in_progress") return "Concluir leva para Conferência";
  if (status === "waiting_parts") return "Retomar leva para Em execução";
  return "";
}

function OrderCard({ order, columnKey, busyId, draggingId, onDragStart, onDragEnd, onAction }) {
  const busy = busyId === order.id;
  const canStart = ["open", "approved", "waiting_parts"].includes(order.status);
  const canComplete = ["diagnosis", "in_progress"].includes(order.status);
  const canWaitParts = ["open", "diagnosis", "approved", "in_progress"].includes(order.status);
  const canDrag = canStart || canComplete || canWaitParts;

  return (
    <Card
      className={`kanban-card technical-service-card ${String(draggingId) === String(order.id) ? "kanban-card-dragging" : ""}`}
      draggable={canDrag && !busy}
      onDragStart={(event) => canDrag ? onDragStart(event, order.id) : event.preventDefault()}
      onDragEnd={onDragEnd}
    >
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
          <div>
            <Link to={`/work-orders/${order.id}`} className="fw-semibold text-decoration-none">{order.number}</Link>
            <div className="small text-muted">{order.customer_name || "Cliente não informado"}</div>
          </div>
          <StatusBadge value={order.status} label={order.status_label} />
        </div>
        <div className="fw-semibold small mb-1">{order.title || "Sem título"}</div>
        <div className="small text-muted mb-3">{order.vehicle_display || "Sem veículo"}</div>
        <Row className="g-2 small">
          <Col md={6}><span className="text-muted">Técnico:</span><br /><strong>{order.assigned_to_name || "Sem responsável"}</strong></Col>
          <Col md={6}><span className="text-muted">Previsão:</span><br /><strong>{dateTime(order.promised_at)}</strong></Col>
          <Col md={6}><span className="text-muted">Total:</span><br /><strong>{money(order.grand_total)}</strong></Col>
          <Col md={6}><span className="text-muted">Saldo:</span><br /><strong>{money(order.balance_due)}</strong></Col>
        </Row>
        {nextActionHint(order.status) ? <div className="small text-muted mt-3">{nextActionHint(order.status)}</div> : null}
        <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
          <Button as={Link} to={`/work-orders/${order.id}`} size="sm" variant="outline-secondary">Abrir OS</Button>
          {canWaitParts && columnKey !== "waiting_parts" ? <Button disabled={busy} size="sm" variant="outline-warning" onClick={() => onAction(order, "wait_parts")}>Aguardar peça</Button> : null}
          {canStart ? <Button disabled={busy} size="sm" onClick={() => onAction(order, "start")}>{actionLabel("start", order.status)}</Button> : null}
          {canComplete ? <Button disabled={busy} size="sm" variant="success" onClick={() => onAction(order, "complete")}>{actionLabel("complete", order.status)}</Button> : null}
        </div>
      </Card.Body>
    </Card>
  );
}

function WorkbenchColumn({ column, items, loading, busyId, draggingId, dropTarget, onDragStart, onDragEnd, onDrop, onAction }) {
  return (
    <section
      className={`kanban-column ${dropTarget === column.key ? "kanban-column-target" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        column.setDropTarget(column.key);
      }}
      onDragLeave={() => column.setDropTarget("")}
      onDrop={(event) => onDrop(event, column.key)}
    >
      <div className="kanban-column-header">
        <span>{column.title}</span>
        <Badge bg={column.badge || "secondary"}>{items.length}</Badge>
      </div>
      <div className="small text-muted mb-3">{column.description}</div>
      {loading ? <div className="text-center text-muted py-4"><Spinner size="sm" /> Carregando</div> : items.length === 0 ? <div className="kanban-empty">{column.empty}</div> : items.map((order) => (
        <OrderCard key={order.id} order={order} columnKey={column.key} busyId={busyId} draggingId={draggingId} onDragStart={onDragStart} onDragEnd={onDragEnd} onAction={onAction} />
      ))}
    </section>
  );
}

export default function TechnicalWorkbenchPage() {
  const [data, setData] = useState(null);
  const [technician, setTechnician] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [diagnosisPrompt, setDiagnosisPrompt] = useState({ show: false, order: null, action: "" });
  const [diagnosisText, setDiagnosisText] = useState("");
  const [diagnosisError, setDiagnosisError] = useState("");

  async function load(nextTechnician = technician) {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (nextTechnician) params.technician = nextTechnician;
      const response = await api.get("/workshop/technical/dashboard/", { params });
      setData(response.data);
      setTechnician(response.data.selected_technician || nextTechnician || "");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);

  const counts = data?.counts || {};
  const technicians = data?.technicians || [];
  const queue = data?.queue_orders || [];
  const active = data?.active_orders || [];
  const waitingParts = data?.waiting_parts_orders || [];
  const done = data?.done_orders || [];

  const allOrders = useMemo(() => [...queue, ...active, ...waitingParts, ...done], [queue, active, waitingParts, done]);
  const totalOpen = useMemo(() => (counts.queue || 0) + (counts.active || 0) + (counts.waiting_parts || 0), [counts]);

  function needsDiagnosisPrompt(order, action) {
    return action === "complete" && order?.status === "diagnosis";
  }

  function requestAction(order, action) {
    if (needsDiagnosisPrompt(order, action)) {
      setDiagnosisPrompt({ show: true, order, action });
      setDiagnosisText(order?.diagnosis || "");
      setDiagnosisError("");
      setDraggingId(null);
      setDropTarget("");
      return;
    }
    runAction(order, action);
  }

  async function runAction(order, action, extraPayload = {}) {
    if (!order || !action) return;
    setBusyId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await api.post(`/workshop/work-orders/${order.id}/technical-action/`, {
        action,
        note: `${actionLabel(action, order.status)} pela Bancada Técnica.`,
        ...extraPayload,
      });
      const updated = response.data?.work_order;
      setNotice(`${order.number} atualizada para ${updated?.status_label || "a próxima etapa"}.`);
      await load(technician);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
      setDraggingId(null);
      setDropTarget("");
    }
  }

  function closeDiagnosisPrompt() {
    if (busyId !== null) return;
    setDiagnosisPrompt({ show: false, order: null, action: "" });
    setDiagnosisText("");
    setDiagnosisError("");
  }

  async function submitDiagnosisPrompt(event) {
    event.preventDefault();
    const text = diagnosisText.trim();
    if (!text) {
      setDiagnosisError("Informe a descrição do diagnóstico para enviar a OS para aprovação.");
      return;
    }
    const order = diagnosisPrompt.order;
    const action = diagnosisPrompt.action;
    setDiagnosisError("");
    setDiagnosisPrompt({ show: false, order: null, action: "" });
    setDiagnosisText("");
    await runAction(order, action, { diagnosis_description: text });
  }

  function actionForDrop(order, columnKey) {
    if (!order) return "";
    if (columnKey === "active") return ["open", "approved", "waiting_parts"].includes(order.status) ? "start" : "";
    if (columnKey === "waiting_parts") return ["open", "diagnosis", "approved", "in_progress"].includes(order.status) ? "wait_parts" : "";
    if (columnKey === "done") return ["diagnosis", "in_progress"].includes(order.status) ? "complete" : "";
    return "";
  }

  function onDragStart(event, orderId) {
    setDraggingId(orderId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(orderId));
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget("");
  }

  function onDrop(event, columnKey) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    const order = allOrders.find((item) => String(item.id) === String(orderId));
    const action = actionForDrop(order, columnKey);
    if (!order) return;
    if (!action) {
      setError(`${order.number} não pode ser movida para esta coluna a partir de ${order.status_label || order.status}.`);
      setDraggingId(null);
      setDropTarget("");
      return;
    }
    requestAction(order, action);
  }

  function handleTechnicianChange(value) {
    setTechnician(value);
    load(value);
  }

  const columns = [
    {
      key: "queue",
      title: "Fila do técnico",
      description: "Somente OS abertas e aprovadas atribuídas ao técnico.",
      empty: "Nenhuma OS aberta ou aprovada na fila.",
      items: queue,
      setDropTarget,
    },
    {
      key: "active",
      title: "Em diagnóstico / execução",
      description: "Aberta inicia em Diagnóstico; aprovada inicia em Execução.",
      empty: "Nenhuma OS em andamento.",
      items: active,
      setDropTarget,
      badge: "primary",
    },
    {
      key: "waiting_parts",
      title: "Aguardando peça",
      description: "Use quando a OS depender de peça para continuar.",
      empty: "Nenhuma OS aguardando peça.",
      items: waitingParts,
      setDropTarget,
      badge: "warning",
    },
    {
      key: "done",
      title: "Concluir",
      description: "Diagnóstico conclui para aprovação; execução conclui para conferência.",
      empty: "Nenhuma OS concluída pela bancada.",
      items: done,
      setDropTarget,
      badge: "success",
    },
  ];

  return (
    <div className="kanban-page">
      <PageHeader title="Bancada técnica" subtitle="Fila operacional de ordens atribuídas ao técnico, com movimentação por arrastar ou botões de ação." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <SystemToast message={notice} variant="success" delay={3000} onClose={() => setNotice("")} />

      <Modal show={diagnosisPrompt.show} onHide={closeDiagnosisPrompt} centered backdrop={busyId !== null ? "static" : true}>
        <Form onSubmit={submitDiagnosisPrompt}>
          <Modal.Header closeButton={busyId === null}>
            <Modal.Title>Descrição do diagnóstico</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted mb-3">
              Para concluir o diagnóstico e enviar a OS {diagnosisPrompt.order?.number ? <strong>{diagnosisPrompt.order.number}</strong> : null} para aprovação, informe a descrição do diagnóstico realizado.
            </p>
            <Form.Group controlId="technical-diagnosis-description">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-1"><Form.Label className="mb-0">Diagnóstico realizado</Form.Label><AIAssistButton task="diagnosis" value={diagnosisText} context={`OS ${diagnosisPrompt.order?.number || ""} | Cliente: ${diagnosisPrompt.order?.customer_name || ""} | Veiculo: ${diagnosisPrompt.order?.vehicle_display || ""} | Relato: ${diagnosisPrompt.order?.complaint || ""}`} onApply={setDiagnosisText} /></div>
              <Form.Control
                as="textarea"
                rows={5}
                value={diagnosisText}
                onChange={(event) => {
                  setDiagnosisText(event.target.value);
                  if (diagnosisError) setDiagnosisError("");
                }}
                placeholder="Ex.: Identificado vazamento no cilindro mestre e pastilhas dianteiras abaixo do limite de segurança."
                isInvalid={!!diagnosisError}
                autoFocus
              />
              <Form.Control.Feedback type="invalid">{diagnosisError}</Form.Control.Feedback>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeDiagnosisPrompt} disabled={busyId !== null}>Cancelar</Button>
            <Button type="submit" variant="success" disabled={busyId !== null}>Enviar para aprovação</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col lg={4} md={6}>
              <Form.Label>Técnico</Form.Label>
              <Form.Select value={technician} onChange={(event) => handleTechnicianChange(event.target.value)} disabled={loading || busyId !== null}>
                <option value="">Todos os técnicos</option>
                {technicians.map((item) => <option key={item.id} value={item.id}>{item.name}{item.specialty_label ? ` - ${item.specialty_label}` : ""}</option>)}
              </Form.Select>
            </Col>
            <Col lg={2} md={3} xs={6}><Card className="card-kpi mb-0"><Card.Body><div className="text-muted small">OS abertas</div><div className="h3 fw-bold mb-0">{totalOpen}</div></Card.Body></Card></Col>
            <Col lg={2} md={3} xs={6}><Card className="card-kpi mb-0"><Card.Body><div className="text-muted small">Fila</div><div className="h3 fw-bold mb-0">{counts.queue || 0}</div></Card.Body></Card></Col>
            <Col lg={2} md={3} xs={6}><Card className="card-kpi mb-0"><Card.Body><div className="text-muted small">Aguardando peça</div><div className="h3 fw-bold mb-0">{counts.waiting_parts || 0}</div></Card.Body></Card></Col>
            <Col lg={2} md={3} xs={6}><Card className="card-kpi mb-0"><Card.Body><div className="text-muted small">Atrasadas</div><div className="h3 fw-bold mb-0">{counts.late_promised_orders || 0}</div></Card.Body></Card></Col>
            <Col md="auto">
              <Button variant="outline-primary" onClick={() => load(technician)} disabled={loading || busyId !== null}>{loading ? "Carregando..." : "Atualizar"}</Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {busyId ? <Alert variant="info" className="py-2">Salvando movimentação da OS...</Alert> : null}

      <div className="kanban-board technical-workbench-board">
        {columns.map((column) => (
          <WorkbenchColumn
            key={column.key}
            column={column}
            items={column.items}
            loading={loading}
            busyId={busyId}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={onDrop}
            onAction={requestAction}
          />
        ))}
      </div>
    </div>
  );
}
