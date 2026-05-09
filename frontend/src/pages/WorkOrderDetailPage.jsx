import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import NoticeBox from "../components/NoticeBox";
import { money, paymentMethods } from "../workshopOptions";
import { useAuth } from "../auth/AuthContext";
import { confirmDialog } from "../components/ConfirmDialog";

const serviceEmpty = (workOrderId) => ({ work_order: workOrderId, service_id: "", description: "", quantity: "1.00", unit_price: "0.00", discount_amount: "0.00", technician_id: "", status: "pending", notes: "" });
const partEmpty = (workOrderId) => ({ work_order: workOrderId, part_id: "", description: "", quantity: "1.00", unit_price: "0.00", discount_amount: "0.00", consume_inventory: true, notes: "" });
const paymentEmpty = (workOrderId) => ({ work_order: workOrderId, amount: "0.00", method: "cash", reference: "", paid_at: new Date().toISOString(), notes: "" });

function compactDate(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function catalogInitials(name = "") {
  const pieces = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return pieces.map((part) => part[0]?.toUpperCase()).join("") || "+";
}

function sortCatalogByUsage(items) {
  return [...items].sort((a, b) => {
    const featuredDiff = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
    if (featuredDiff !== 0) return featuredDiff;
    const usageDiff = Number(b.usage_count || 0) - Number(a.usage_count || 0);
    if (usageDiff !== 0) return usageDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [order, setOrder] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [partsCatalog, setPartsCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [serviceModal, setServiceModal] = useState(false);
  const [partModal, setPartModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);
  const [photoForm, setPhotoForm] = useState({ photo_type: "opening", caption: "", is_customer_visible: true, files: [] });
  const [serviceEditing, setServiceEditing] = useState(null);
  const [partEditing, setPartEditing] = useState(null);
  const [serviceForm, setServiceForm] = useState(serviceEmpty(id));
  const [partForm, setPartForm] = useState(partEmpty(id));
  const [paymentForm, setPaymentForm] = useState(paymentEmpty(id));
  const [statusForm, setStatusForm] = useState({ status: "", note: "", send_notifications: true });
  const [messageForm, setMessageForm] = useState({ template_id: "" });
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [selectedPartIds, setSelectedPartIds] = useState([]);
  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ document_type: "estimate", expires_days: 7 });
  const [approvalResult, setApprovalResult] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [workshopSettings, setWorkshopSettings] = useState({ technical_checklist_enabled: false, delivery_signature_enabled: true });
  const [checklistItems, setChecklistItems] = useState([]);
  const [deliverySignature, setDeliverySignature] = useState(null);
  const [signatureModal, setSignatureModal] = useState(false);
  const [signatureForm, setSignatureForm] = useState({ recipient_name: "", recipient_document: "", notes: "" });
  const signatureCanvasRef = useRef(null);
  const drawingRef = useRef(false);

  async function load() {
    try {
      const orderRes = await api.get(`/workshop/work-orders/${id}/`);
      setOrder(orderRes.data);
      setStatusForm((current) => ({ ...current, status: orderRes.data.status }));

      const optionalRequests = await Promise.allSettled([
        api.get("/workshop/services/", { params: { active: "true", ordering: "most_used" } }),
        api.get("/workshop/parts/", { params: { active: "true", ordering: "most_used" } }),
        api.get("/users/"),
        api.get("/templates/", { params: { active: "true" } }),
        api.get(`/workshop/work-orders/${id}/customer_approvals/`),
        api.get("/workshop/company-profile/"),
        api.get("/workshop/work-order-checklist-items/", { params: { work_order: id } }),
        api.get(`/workshop/work-orders/${id}/delivery-signature/`),
      ]);

      setCatalog(optionalRequests[0].status === "fulfilled" ? results(optionalRequests[0].value.data) : []);
      setPartsCatalog(optionalRequests[1].status === "fulfilled" ? results(optionalRequests[1].value.data) : []);
      setUsers(optionalRequests[2].status === "fulfilled" ? results(optionalRequests[2].value.data) : []);
      setTemplates(optionalRequests[3].status === "fulfilled" ? results(optionalRequests[3].value.data) : []);
      setApprovals(optionalRequests[4].status === "fulfilled" ? optionalRequests[4].value.data : []);
      setWorkshopSettings(optionalRequests[5].status === "fulfilled" ? optionalRequests[5].value.data : { technical_checklist_enabled: false, delivery_signature_enabled: true });
      setChecklistItems(optionalRequests[6].status === "fulfilled" ? results(optionalRequests[6].value.data) : []);
      setDeliverySignature(optionalRequests[7].status === "fulfilled" ? optionalRequests[7].value.data : null);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, [id]);

  const orderedServicesCatalog = useMemo(() => sortCatalogByUsage(catalog), [catalog]);
  const orderedPartsCatalog = useMemo(() => sortCatalogByUsage(partsCatalog), [partsCatalog]);
  const allowedStatusTransitions = order?.available_status_transitions || [];

  function openStatusChangeModal() {
    const firstAllowed = allowedStatusTransitions[0]?.status || "";
    setStatusForm({ status: firstAllowed, note: "", send_notifications: true });
    setStatusModal(true);
  }

  function selectedTransitionRequiresNote() {
    return Boolean(allowedStatusTransitions.find((item) => item.status === statusForm.status)?.requires_note);
  }

  function toggleSelectedService(serviceId) {
    const normalizedId = String(serviceId);
    setSelectedServiceIds((current) => current.includes(normalizedId) ? current.filter((item) => item !== normalizedId) : [...current, normalizedId]);
  }

  function toggleSelectedPart(partId) {
    const normalizedId = String(partId);
    setSelectedPartIds((current) => current.includes(normalizedId) ? current.filter((item) => item !== normalizedId) : [...current, normalizedId]);
  }

  function openService(line = null) {
    setServiceEditing(line);
    setSelectedServiceIds([]);
    setServiceForm(line ? { ...line, technician_id: line.technician || "", service_id: line.service || "" } : serviceEmpty(id));
    setServiceModal(true);
  }

  function openPart(line = null) {
    setPartEditing(line);
    setSelectedPartIds([]);
    setPartForm(line ? { ...line, part_id: line.part || "" } : partEmpty(id));
    setPartModal(true);
  }

  async function saveService(event) {
    event.preventDefault();
    try {
      if (!serviceEditing && selectedServiceIds.length) {
        const selectedServices = catalog.filter((service) => selectedServiceIds.includes(String(service.id)));
        await Promise.all(selectedServices.map((service) => api.post("/workshop/work-order-services/", {
          work_order: id,
          service_id: service.id,
          description: service.name,
          quantity: "1.00",
          unit_price: service.default_unit_price || "0.00",
          discount_amount: "0.00",
          technician_id: serviceForm.technician_id || null,
          status: serviceForm.status || "pending",
          notes: "",
        })));
        setServiceModal(false);
        setSelectedServiceIds([]);
        setServiceForm(serviceEmpty(id));
        await load();
        return;
      }

      const payload = { ...serviceForm, service_id: serviceForm.service_id || null, technician_id: serviceForm.technician_id || null };
      serviceEditing ? await api.put(`/workshop/work-order-services/${serviceEditing.id}/`, payload) : await api.post("/workshop/work-order-services/", payload);
      setServiceModal(false);
      setSelectedServiceIds([]);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function savePart(event) {
    event.preventDefault();
    try {
      if (!partEditing && selectedPartIds.length) {
        const selectedParts = partsCatalog.filter((part) => selectedPartIds.includes(String(part.id)));
        await Promise.all(selectedParts.map((part) => api.post("/workshop/work-order-parts/", {
          work_order: id,
          part_id: part.id,
          description: part.name,
          quantity: "1.00",
          unit_price: part.sale_price || "0.00",
          cost_price: part.cost_price || "0.00",
          discount_amount: "0.00",
          consume_inventory: partForm.consume_inventory,
          notes: "",
        })));
        setPartModal(false);
        setSelectedPartIds([]);
        setPartForm(partEmpty(id));
        await load();
        return;
      }

      const payload = { ...partForm, part_id: partForm.part_id || null };
      partEditing ? await api.put(`/workshop/work-order-parts/${partEditing.id}/`, payload) : await api.post("/workshop/work-order-parts/", payload);
      setPartModal(false);
      setSelectedPartIds([]);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function savePayment(event) {
    event.preventDefault();
    try {
      await api.post("/workshop/work-order-payments/", paymentForm);
      setPaymentModal(false);
      setPaymentForm(paymentEmpty(id));
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function removeLine(url, label) {
    if (!(await confirmDialog(`Excluir ${label}?`))) return;
    try {
      await api.delete(url);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function savePhotos(event) {
    event.preventDefault();
    if (!photoForm.files.length) {
      setError("Selecione pelo menos uma foto da OS.");
      return;
    }
    try {
      for (const file of photoForm.files) {
        const formData = new FormData();
        formData.append("work_order", id);
        formData.append("photo_type", photoForm.photo_type);
        formData.append("caption", photoForm.caption);
        formData.append("is_customer_visible", photoForm.is_customer_visible ? "true" : "false");
        formData.append("image", file);
        await api.post("/workshop/work-order-photos/", formData);
      }
      setPhotoModal(false);
      setPhotoForm({ photo_type: "opening", caption: "", is_customer_visible: true, files: [] });
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function removePhoto(photo) {
    if (!(await confirmDialog("Excluir esta foto da OS?"))) return;
    try {
      await api.delete(`/workshop/work-order-photos/${photo.id}/`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function changeStatus(event) {
    event.preventDefault();
    try {
      const res = await api.post(`/workshop/work-orders/${id}/change_status/`, statusForm);
      setOrder(res.data.work_order);
      setStatusModal(false);
      setNotice(`Status atualizado. Mensagens automáticas geradas: ${res.data.work_order_message_ids?.length || 0}.`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    try {
      await api.post(`/workshop/work-orders/${id}/send_message/`, { template_id: Number(messageForm.template_id) });
      setMessageModal(false);
      setNotice("Mensagem enviada para o cliente da OS.");
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function triggerNotifications() {
    try {
      const res = await api.post(`/workshop/work-orders/${id}/trigger_notifications/`);
      setNotice(`Notificações disparadas: ${res.data.work_order_message_ids?.length || 0}.`);
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function openDocumentPdf(type) {
    try {
      const response = await api.get(`/workshop/work-orders/${id}/document/`, { params: { type }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function createApprovalLink(event) {
    event.preventDefault();
    try {
      const payload = { ...approvalForm, frontend_base_url: window.location.origin };
      const { data } = await api.post(`/workshop/work-orders/${id}/create_customer_approval/`, payload);
      setApprovalResult(data);
      if (data.email_sent) {
        setNotice(`Link de aprovação digital gerado e e-mail enviado para ${data.email_to}.`);
      } else if (data.email_error) {
        setNotice(data.email_error);
      } else {
        setNotice("Link de aprovação digital gerado com sucesso.");
      }
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function copyApprovalLink() {
    const url = approvalResult?.public_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copiado para a área de transferência.");
    } catch {
      setError("Não foi possível copiar automaticamente. Copie o link manualmente.");
    }
  }

  async function updateChecklistItem(item, patch) {
    try {
      const formData = new FormData();
      Object.entries(patch).forEach(([key, value]) => formData.append(key, value ?? ""));
      await api.patch(`/workshop/work-order-checklist-items/${item.id}/`, formData);
      await load();
      setNotice("Checklist atualizado.");
    } catch (err) {
      setError(apiError(err));
    }
  }

  function signaturePoint(event) {
    const canvas = signatureCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const clientY = event.touches?.[0]?.clientY ?? event.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startSignature(event) {
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = signaturePoint(event);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function drawSignature(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = signaturePoint(event);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopSignature() {
    drawingRef.current = false;
  }

  function clearSignatureCanvas() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  async function saveDeliverySignature(event) {
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    try {
      const payload = {
        ...signatureForm,
        signature_data_url: canvas.toDataURL("image/png"),
      };
      await api.post(`/workshop/work-orders/${id}/delivery-signature/`, payload);
      setSignatureModal(false);
      setSignatureForm({ recipient_name: "", recipient_document: "", notes: "" });
      await load();
      setNotice("Entrega assinada digitalmente.");
    } catch (err) {
      setError(apiError(err));
    }
  }

  function openDeliveryReceiptPdf() {
    window.open(`/api/workshop/work-orders/${id}/delivery-receipt/`, "_blank", "noopener,noreferrer");
  }

  if (!order) return <><PageHeader title="Ordem de serviço"/><ErrorAlert error={error} onClose={() => setError("")}/></>;

  const detailTabs = [
    { key: "summary", label: "Resumo", description: "Status, relato e fotos", badge: order.photos?.length || 0 },
    { key: "services", label: "Serviços", description: "Mão de obra e execução", badge: order.services?.length || 0 },
    { key: "parts", label: "Peças", description: "Itens e estoque", badge: order.parts?.length || 0 },
    ...(workshopSettings.technical_checklist_enabled || workshopSettings.delivery_signature_enabled ? [{ key: "technical", label: "Execução", description: "Checklist e entrega", badge: checklistItems.filter((item) => item.is_completed).length }] : []),
    { key: "financial", label: "Financeiro", description: "Pagamentos e mensagens", badge: order.payments?.length || 0 },
    { key: "documents", label: "Documentos", description: "PDFs e aprovação", badge: approvals.length || 0 },
    { key: "timeline", label: "Histórico", description: "Linha do tempo da OS", badge: order.events?.length || 0 },
  ];

  return <>
    <PageHeader title={`${order.number} - ${order.title || "Ordem de serviço"}`} subtitle={`${order.customer_name} · ${order.vehicle_display || "sem veículo"}`}>
      <Button variant="outline-secondary" onClick={() => navigate("/work-orders")} className="me-2">Voltar</Button>
      {hasPermission("work_orders.edit") ? <Button as={Link} to={`/work-orders/${id}/edit`} variant="outline-primary" className="me-2">Editar OS</Button> : null}
      {hasPermission(["technical.dashboard", "dashboard.technical"]) ? <Button as={Link} to="/technical/workbench" variant="outline-info" className="me-2">Bancada técnica</Button> : null}
      {hasPermission("work_orders.edit") ? <Button variant="outline-success" onClick={() => setPhotoModal(true)} className="me-2">Adicionar fotos</Button> : null}
      <Button variant="outline-dark" onClick={() => openDocumentPdf("work_order")} className="me-2">PDF OS</Button>
      <Button variant="outline-dark" onClick={() => openDocumentPdf("estimate")} className="me-2">PDF orçamento</Button>
      {deliverySignature ? <Button variant="outline-dark" onClick={openDeliveryReceiptPdf} className="me-2">PDF entrega</Button> : null}
      {hasPermission("work_orders.edit") ? <Button variant="outline-warning" onClick={() => { setApprovalResult(null); setApprovalModal(true); }} className="me-2">Aprovação digital</Button> : null}
      {hasPermission("work_orders.status") ? <Button onClick={openStatusChangeModal} disabled={!allowedStatusTransitions.length}>Alterar status</Button> : null}
    </PageHeader>
    <ErrorAlert error={error} onClose={() => setError("")}/>
    <SystemToast message={notice} variant="success" delay={3000} onClose={() => setNotice("")} />

    <FormTabs tabs={detailTabs} activeKey={activeTab} onSelect={setActiveTab} className="os-detail-tabs" />

    <TabPanel activeKey={activeTab} eventKey="summary">
      <Row className="g-3 mb-3">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100"><Card.Body>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
              <div><div className="text-muted small">Status</div><StatusBadge value={order.status} label={order.status_label}/></div>
              <div><div className="text-muted small">Prioridade</div><StatusBadge value={order.priority} label={order.priority_label}/></div>
              <div><div className="text-muted small">Responsável</div><strong>{order.assigned_to_name || "-"}</strong></div>
              <div><div className="text-muted small">Previsão</div><strong>{compactDate(order.promised_at)}</strong></div>
            </div>
            <Row>
              <Col md={6}><h6>Relato do cliente</h6><p className="white-space-preline">{order.complaint || "-"}</p></Col>
              <Col md={6}><h6>Diagnóstico</h6><p className="white-space-preline">{order.diagnosis || "-"}</p></Col>
            </Row>
            <Row>
              <Col md={6}><h6>Solução executada</h6><p className="white-space-preline">{order.solution || "-"}</p></Col>
              <Col md={6}><h6>Observações ao cliente</h6><p className="white-space-preline">{order.customer_notes || "-"}</p></Col>
            </Row>
            <div className="border-top pt-3 mt-2">
              <div className="text-muted small mb-2">Próximas etapas permitidas pela máquina de estados</div>
              {allowedStatusTransitions.length ? <div className="d-flex flex-wrap gap-2">
                {allowedStatusTransitions.map((transition) => <span key={transition.status} className="badge rounded-pill text-bg-light border">{transition.status_label}</span>)}
              </div> : <div className="text-muted small">Nenhuma transição operacional disponível para seu perfil neste status.</div>}
            </div>
          </Card.Body></Card>
        </Col>
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100"><Card.Body>
            <h5>Resumo financeiro</h5>
            <div className="d-flex justify-content-between"><span>Mão de obra</span><strong>{money(order.subtotal_services)}</strong></div>
            <div className="d-flex justify-content-between"><span>Peças</span><strong>{money(order.subtotal_parts)}</strong></div>
            <div className="d-flex justify-content-between"><span>Desconto geral</span><strong>{money(order.manual_discount_amount)}</strong></div>
            <div className="d-flex justify-content-between"><span>Descontos totais</span><strong>{money(order.discount_total)}</strong></div>
            <hr/>
            <div className="d-flex justify-content-between fs-5"><span>Total</span><strong>{money(order.grand_total)}</strong></div>
            <div className="d-flex justify-content-between"><span>Pago</span><strong>{money(order.paid_total)}</strong></div>
            <div className="d-flex justify-content-between"><span>Saldo</span><strong>{money(order.balance_due)}</strong></div>
            {order.account_receivable_summary ? <div className="d-flex justify-content-between"><span>Conta a receber</span><Link to="/finance/accounts-receivable">{order.account_receivable_summary.number}</Link></div> : <div className="small text-muted mt-2">A conta a receber será gerada quando a OS for entregue.</div>}
            {hasPermission("payments.manage") ? <Button className="w-100 mt-3" variant="outline-success" onClick={() => setPaymentModal(true)}>Registrar pagamento</Button> : null}
            {hasPermission("messages.send") ? <Button className="w-100 mt-2" variant="outline-primary" onClick={() => setMessageModal(true)}>Enviar mensagem</Button> : null}
            {hasPermission("messages.send") ? <Button className="w-100 mt-2" variant="outline-secondary" onClick={triggerNotifications}>Rodar regras automáticas</Button> : null}
          </Card.Body></Card>
        </Col>
      </Row>
      <div className="mt-3">
      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="bg-white d-flex justify-content-between align-items-center">
          <div>
            <strong>Fotos de proteção e evidências</strong>
            <div className="small text-muted">Fotos de entrada, avarias pré-existentes, hodômetro, documentos e entrega.</div>
          </div>
          {hasPermission("work_orders.edit") ? <Button size="sm" variant="outline-success" onClick={() => setPhotoModal(true)}>Adicionar fotos</Button> : null}
        </Card.Header>
        <Card.Body>
          {order.photos?.length ? (
            <Row className="g-3">
              {order.photos.map((photo) => (
                <Col xs={6} md={4} lg={3} xl={2} key={photo.id}>
                  <Card className="evidence-photo-card h-100">
                    <a href={photo.image_url} target="_blank" rel="noreferrer">
                      <img src={photo.image_url} alt={photo.caption || photo.photo_type_label} />
                    </a>
                    <Card.Body className="p-2">
                      <div className="fw-semibold small">{photo.photo_type_label}</div>
                      <div className="small text-muted white-space-preline">{photo.caption || "Sem legenda"}</div>
                      <div className="small text-muted mt-2">{compactDate(photo.taken_at)}</div>
                      <div className="small text-muted text-truncate">Por: {photo.uploaded_by_name || "Sistema"}</div>
                      {hasPermission("work_orders.edit") ? <Button size="sm" variant="outline-danger" className="mt-2" onClick={() => removePhoto(photo)}>Excluir</Button> : null}
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <EmptyState title="Nenhuma foto vinculada" description="Registre fotos do estado do veículo na entrada para reduzir disputas sobre avarias." />
          )}
        </Card.Body>
      </Card>
      </div>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="services">
      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="bg-white d-flex justify-content-between">
          <strong>Serviços técnicos</strong>
          {hasPermission("work_order_services.manage") ? <Button size="sm" onClick={() => openService()}>Adicionar serviço</Button> : null}
        </Card.Header>
        <Card.Body className="p-0">
          {order.services?.length ? (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Origem</th><th>Descrição</th><th>Técnico</th><th>Status</th><th>Início</th><th>Fim</th><th>Tempo</th><th>Total</th><th></th></tr></thead>
              <tbody>{order.services.map((line) => <tr key={line.id}>
                <td>{line.source_package_name || "Serviço avulso"}</td>
                <td>
                  <div className="fw-semibold">{line.description}</div>
                  {line.execution_notes ? <div className="small text-muted white-space-preline">{line.execution_notes}</div> : null}
                  {line.quality_checked_at ? <div className="small text-success">Conferido em {compactDate(line.quality_checked_at)}</div> : null}
                </td>
                <td>{line.technician_name || "-"}</td>
                <td><StatusBadge value={line.status}/></td>
                <td>{compactDate(line.started_at)}</td>
                <td>{compactDate(line.finished_at)}</td>
                <td>{line.duration_label || "-"}</td>
                <td>{money(line.total_amount)}</td>
                <td className="text-end">
                  {hasPermission("work_order_services.manage") ? <Button size="sm" variant="outline-primary" onClick={() => openService(line)} className="me-2">Editar</Button> : null}
                  {hasPermission("work_order_services.manage") ? <Button size="sm" variant="outline-danger" onClick={() => removeLine(`/workshop/work-order-services/${line.id}/`, "serviço")}>Excluir</Button> : null}
                </td>
              </tr>)}</tbody>
            </Table>
          ) : <div className="p-4"><EmptyState title="Nenhum serviço lançado"/></div>}
        </Card.Body>
      </Card>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="technical">
      <Row className="g-3 mb-3">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white"><strong>Checklist técnico da OS</strong></Card.Header>
            <Card.Body>
              {workshopSettings.technical_checklist_enabled ? (
                checklistItems.length ? (
                  <div className="technical-checklist-list">
                    {checklistItems.map((item) => (
                      <div className={`technical-checklist-item ${item.is_completed ? "done" : ""}`} key={item.id}>
                        <div className="d-flex justify-content-between gap-3">
                          <div>
                            <div className="fw-semibold">{item.description}</div>
                            <div className="small text-muted">{item.work_order_service_description}</div>
                            <div className="small text-muted">
                              {item.is_required ? "Obrigatório" : "Opcional"}{item.requires_photo ? " · exige foto" : ""}{item.requires_note ? " · exige observação" : ""}
                            </div>
                          </div>
                          <Form.Check
                            type="switch"
                            label={item.is_completed ? "Concluído" : "Pendente"}
                            checked={!!item.is_completed}
                            onChange={(event) => updateChecklistItem(item, { is_completed: event.target.checked ? "true" : "false" })}
                          />
                        </div>
                        <Row className="g-2 mt-2">
                          <Col md={8}>
                            <Form.Control as="textarea" rows={2} value={item.note || ""} placeholder="Observação técnica" onChange={(event) => setChecklistItems((current) => current.map((row) => row.id === item.id ? { ...row, note: event.target.value } : row))} onBlur={(event) => updateChecklistItem(item, { note: event.target.value })} />
                          </Col>
                          <Col md={4}>
                            <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && updateChecklistItem(item, { photo: event.target.files[0] })} />
                            {item.photo_url ? <a className="small d-inline-block mt-1" href={item.photo_url} target="_blank" rel="noreferrer">Ver foto anexada</a> : null}
                          </Col>
                        </Row>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title="Nenhum checklist copiado" description="Cadastre itens no serviço e adicione o serviço novamente à OS, ou mantenha o checklist desativado nas configurações." />
              ) : <NoticeBox variant="info" title="Checklist desativado">O checklist técnico está desativado no painel administrativo. A execução da OS não será bloqueada por itens pendentes.</NoticeBox>}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white"><strong>Entrega assinada</strong></Card.Header>
            <Card.Body>
              {deliverySignature ? (
                <div>
                  <div className="small text-muted">Recebido por</div>
                  <div className="fw-semibold">{deliverySignature.recipient_name}</div>
                  <div className="small text-muted mt-2">Documento</div>
                  <div>{deliverySignature.recipient_document || "-"}</div>
                  <div className="small text-muted mt-2">Assinado em</div>
                  <div>{compactDate(deliverySignature.signed_at)}</div>
                  {deliverySignature.signature_url ? <img className="delivery-signature-preview mt-3" src={deliverySignature.signature_url} alt="Assinatura de entrega" /> : null}
                  <Button className="w-100 mt-3" variant="outline-primary" onClick={openDeliveryReceiptPdf}>Abrir comprovante PDF</Button>
                </div>
              ) : (
                <div>
                  <p className="text-muted small">Registre a assinatura digital de quem recebeu o veículo ou serviço.</p>
                  <Button className="w-100" disabled={!workshopSettings.delivery_signature_enabled} onClick={() => setSignatureModal(true)}>Assinar entrega</Button>
                  {!workshopSettings.delivery_signature_enabled ? <div className="small text-muted mt-2">Assinatura de entrega desativada nas configurações administrativas.</div> : null}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="parts">
      <Card className="border-0 shadow-sm mb-3">
        <Card.Header className="bg-white d-flex justify-content-between">
          <strong>Peças</strong>
          {hasPermission("work_order_parts.manage") ? <Button size="sm" onClick={() => openPart()}>Adicionar peça</Button> : null}
        </Card.Header>
        <Card.Body className="p-0">
          {order.parts?.length ? <Table responsive hover className="mb-0"><thead><tr><th>Peça</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Desc.</th><th>Total</th><th>Estoque</th><th></th></tr></thead><tbody>{order.parts.map((line) => <tr key={line.id}><td>{line.part_sku || "-"}</td><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{money(line.discount_amount)}</td><td>{money(line.total_amount)}</td><td>{line.stock_consumed ? "Consumido" : "Pendente"}</td><td className="text-end"><Button size="sm" variant="outline-primary" onClick={() => openPart(line)} className="me-2">Editar</Button><Button size="sm" variant="outline-danger" onClick={() => removeLine(`/workshop/work-order-parts/${line.id}/`, "peça")}>Excluir</Button></td></tr>)}</tbody></Table> : <div className="p-4"><EmptyState title="Nenhuma peça lançada"/></div>}
        </Card.Body>
      </Card>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="financial">
      <Row className="g-3">
        <Col lg={6}><Card className="border-0 shadow-sm"><Card.Header className="bg-white"><strong>Pagamentos</strong></Card.Header><Card.Body className="p-0">{order.payments?.length ? <Table responsive className="mb-0"><thead><tr><th>Data</th><th>Forma</th><th>Referência</th><th>Valor</th></tr></thead><tbody>{order.payments.map((p) => <tr key={p.id}><td>{compactDate(p.paid_at)}</td><td>{p.method_label}</td><td>{p.reference || "-"}</td><td>{money(p.amount)}</td></tr>)}</tbody></Table> : <div className="p-4"><EmptyState title="Nenhum pagamento"/></div>}</Card.Body></Card></Col>
        <Col lg={6}><Card className="border-0 shadow-sm"><Card.Header className="bg-white"><strong>Mensagens da OS</strong></Card.Header><Card.Body className="p-0">{order.messages?.length ? <Table responsive className="mb-0"><thead><tr><th>Canal</th><th>Template</th><th>Status</th><th>Quando</th></tr></thead><tbody>{order.messages.map((m) => <tr key={m.id}><td><StatusBadge value={m.channel}/></td><td>{m.template_name}</td><td><StatusBadge value={m.message_log_status}/></td><td>{compactDate(m.created_at)}</td></tr>)}</tbody></Table> : <div className="p-4"><EmptyState title="Nenhuma mensagem vinculada"/></div>}</Card.Body></Card></Col>
      </Row>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="documents">
      <Row className="g-3 mb-3">
        <Col lg={5}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white"><strong>PDFs profissionais</strong></Card.Header>
            <Card.Body>
              <p className="text-muted small">Gere documentos em PDF com dados da oficina, cliente, veículo, serviços, peças, totais, condições e campo para assinatura.</p>
              <div className="d-grid gap-2">
                <Button variant="outline-primary" onClick={() => openDocumentPdf("estimate")}>Abrir PDF de orçamento</Button>
                <Button variant="outline-primary" onClick={() => openDocumentPdf("work_order")}>Abrir PDF da OS</Button>
                <Button variant="outline-success" onClick={() => openDocumentPdf("receipt")}>Abrir PDF de recibo</Button>
                {deliverySignature ? <Button variant="outline-success" onClick={openDeliveryReceiptPdf}>Abrir comprovante de entrega</Button> : null}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={7}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center">
              <strong>Aprovação digital</strong>
              {hasPermission("work_orders.edit") ? <Button size="sm" onClick={() => { setApprovalResult(null); setApprovalModal(true); }}>Gerar e enviar link</Button> : null}
            </Card.Header>
            <Card.Body>
              {approvals.length ? (
                <Table responsive hover className="mb-0">
                  <thead><tr><th>Documento</th><th>Status</th><th>Solicitado</th><th>Expira</th><th>Decisão</th><th>Link</th></tr></thead>
                  <tbody>{approvals.map((approval) => {
                    const publicUrl = `${window.location.origin}${approval.public_url_path}`;
                    return <tr key={approval.id}>
                      <td>{approval.document_type_label}</td>
                      <td>{approval.status_label}</td>
                      <td>{compactDate(approval.requested_at)}</td>
                      <td>{compactDate(approval.expires_at)}</td>
                      <td>{approval.decided_at ? compactDate(approval.decided_at) : "-"}</td>
                      <td><Button size="sm" variant="outline-secondary" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => setNotice("Link copiado."))}>Copiar</Button></td>
                    </tr>;
                  })}</tbody>
                </Table>
              ) : (
                <EmptyState title="Nenhum link gerado" description="Gere um link público para o cliente aprovar ou recusar orçamento, OS ou recibo." />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </TabPanel>

    <TabPanel activeKey={activeTab} eventKey="timeline">
      <Card className="border-0 shadow-sm"><Card.Header className="bg-white"><strong>Linha do tempo</strong></Card.Header><Card.Body className="p-0">{order.events?.length ? <Table responsive className="mb-0"><thead><tr><th>Quando</th><th>Tipo</th><th>Usuário</th><th>Descrição</th></tr></thead><tbody>{order.events.map((e) => <tr key={e.id}><td>{compactDate(e.created_at)}</td><td>{e.event_type}</td><td>{e.actor_name || "Sistema"}</td><td>{e.description}</td></tr>)}</tbody></Table> : <div className="p-4"><EmptyState title="Sem eventos"/></div>}</Card.Body></Card>
    </TabPanel>

    <Modal show={signatureModal} onHide={() => setSignatureModal(false)} size="lg">
      <Form onSubmit={saveDeliverySignature}>
        <Modal.Header closeButton><Modal.Title>Assinatura digital da entrega</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="small">A assinatura registra nome, documento, data/hora, IP, navegador e imagem desenhada na tela.</Alert>
          <Row className="g-3">
            <Col md={7}>
              <Form.Label>Nome de quem recebeu</Form.Label>
              <Form.Control required value={signatureForm.recipient_name} onChange={(event) => setSignatureForm({ ...signatureForm, recipient_name: event.target.value })} />
            </Col>
            <Col md={5}>
              <Form.Label>Documento</Form.Label>
              <Form.Control value={signatureForm.recipient_document} onChange={(event) => setSignatureForm({ ...signatureForm, recipient_document: event.target.value })} />
            </Col>
            <Col md={12}>
              <Form.Label>Observação da entrega</Form.Label>
              <Form.Control as="textarea" rows={3} value={signatureForm.notes} onChange={(event) => setSignatureForm({ ...signatureForm, notes: event.target.value })} />
            </Col>
            <Col md={12}>
              <Form.Label>Assinatura</Form.Label>
              <canvas
                ref={signatureCanvasRef}
                className="signature-canvas"
                width="720"
                height="220"
                onMouseDown={startSignature}
                onMouseMove={drawSignature}
                onMouseUp={stopSignature}
                onMouseLeave={stopSignature}
                onTouchStart={startSignature}
                onTouchMove={drawSignature}
                onTouchEnd={stopSignature}
              />
              <Button type="button" variant="outline-secondary" size="sm" className="mt-2" onClick={clearSignatureCanvas}>Limpar assinatura</Button>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setSignatureModal(false)}>Cancelar</Button><Button type="submit">Salvar assinatura</Button></Modal.Footer>
      </Form>
    </Modal>

    <Modal show={approvalModal} onHide={() => setApprovalModal(false)} size="lg">
      <Form onSubmit={createApprovalLink}>
        <Modal.Header closeButton><Modal.Title>Gerar aprovação digital</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="small">O sistema gera um link público para o cliente visualizar o documento, abrir o PDF e aprovar ou recusar digitalmente. A decisão registra data, IP, navegador, nome, documento e observações informadas.</Alert>
          <Row className="g-3">
            <Col md={6}>
              <Form.Label>Tipo de documento</Form.Label>
              <Form.Select value={approvalForm.document_type} onChange={(e) => setApprovalForm({ ...approvalForm, document_type: e.target.value })}>
                <option value="estimate">Orçamento</option>
                <option value="work_order">Ordem de serviço</option>
                <option value="receipt">Recibo</option>
              </Form.Select>
            </Col>
            <Col md={6}>
              <Form.Label>Validade do link em dias</Form.Label>
              <Form.Control type="number" min="1" max="90" value={approvalForm.expires_days} onChange={(e) => setApprovalForm({ ...approvalForm, expires_days: e.target.value })} />
            </Col>
          </Row>
          {approvalResult ? <Card className="border-0 bg-light mt-3"><Card.Body>
            {approvalResult.email_sent ? (
              <Alert variant="success" className="py-2 small">E-mail enviado para <strong>{approvalResult.email_to}</strong>.</Alert>
            ) : approvalResult.email_error ? (
              <Alert variant="warning" className="py-2 small">{approvalResult.email_error}</Alert>
            ) : null}
            {approvalResult.console_logged ? (
              <Alert variant="info" className="py-2 small">O conteúdo do e-mail/link foi impresso no console/log do backend com o marcador <strong>APROVACAO DIGITAL - EMAIL DE TESTE</strong>.</Alert>
            ) : null}
            {approvalResult.email_backend ? (
              <div className="small text-muted mb-2">Backend de e-mail: <code>{approvalResult.email_backend}</code></div>
            ) : null}
            <div className="small text-muted mb-1">Link público gerado</div>
            <Form.Control readOnly value={approvalResult.public_url || `${window.location.origin}${approvalResult.public_url_path}`} />
            <div className="d-flex gap-2 mt-3">
              <Button type="button" variant="outline-primary" onClick={copyApprovalLink}>Copiar link</Button>
              <Button as="a" variant="outline-secondary" href={approvalResult.public_url || `${window.location.origin}${approvalResult.public_url_path}`} target="_blank" rel="noreferrer">Abrir link</Button>
            </div>
          </Card.Body></Card> : null}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setApprovalModal(false)}>Fechar</Button><Button type="submit">Gerar e enviar link</Button></Modal.Footer>
      </Form>
    </Modal>

    <Modal size="lg" show={photoModal} onHide={() => setPhotoModal(false)}>
      <Form onSubmit={savePhotos}>
        <Modal.Header closeButton><Modal.Title>Adicionar fotos da OS</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label>Tipo de foto</Form.Label>
              <Form.Select value={photoForm.photo_type} onChange={(e) => setPhotoForm({ ...photoForm, photo_type: e.target.value })}>
                <option value="opening">Abertura / estado de entrada</option>
                <option value="damage">Avaria pré-existente</option>
                <option value="odometer">Hodômetro</option>
                <option value="document">Documento / etiqueta</option>
                <option value="delivery">Entrega</option>
                <option value="other">Outro</option>
              </Form.Select>
            </Col>
            <Col md={8}>
              <Form.Label>Fotos</Form.Label>
              <Form.Control type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhotoForm({ ...photoForm, files: Array.from(e.target.files || []) })} />
              <Form.Text>As fotos serão gravadas com data/hora e usuário responsável. O hash permanece salvo internamente para auditoria, mas não aparece na tela da OS.</Form.Text>
            </Col>
            <Col md={12}>
              <Form.Label>Legenda / observação</Form.Label>
              <Form.Control as="textarea" rows={3} value={photoForm.caption} onChange={(e) => setPhotoForm({ ...photoForm, caption: e.target.value })} placeholder="Ex.: Risco no paralama dianteiro direito já existente na entrada." />
            </Col>
            <Col md={12}>
              <Form.Check label="Mostrar esta evidência em documentos enviados ao cliente" checked={photoForm.is_customer_visible} onChange={(e) => setPhotoForm({ ...photoForm, is_customer_visible: e.target.checked })} />
            </Col>
          </Row>
          {photoForm.files.length ? <div className="small text-muted mt-3">Selecionadas: {photoForm.files.map((file) => file.name).join(", ")}</div> : null}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setPhotoModal(false)}>Cancelar</Button><Button type="submit">Salvar fotos</Button></Modal.Footer>
      </Form>
    </Modal>

    <Modal size="xl" show={serviceModal} onHide={() => setServiceModal(false)}>
      <Form onSubmit={saveService}>
        <Modal.Header closeButton><Modal.Title>{serviceEditing ? "Editar serviço" : "Adicionar serviços à OS"}</Modal.Title></Modal.Header>
        <Modal.Body>
          {!serviceEditing ? <Card className="border-0 bg-light mb-3"><Card.Body>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h6 className="mb-1">Serviços preferidos e mais utilizados</h6>
                <div className="small text-muted">Clique em um ou mais cards para selecionar. A ordenação prioriza os marcados como preferidos no cadastro e depois o histórico de uso em OS.</div>
              </div>
              <div className="small fw-semibold text-primary">Selecionados: {selectedServiceIds.length}</div>
            </div>
            <div className="os-catalog-grid">
              {orderedServicesCatalog.map((service) => {
                const selected = selectedServiceIds.includes(String(service.id));
                return <button type="button" key={service.id} className={`os-catalog-card ${selected ? "selected" : ""}`.trim()} onClick={() => toggleSelectedService(service.id)}>
                  <span className="os-catalog-thumb">
                    {service.photo_url ? <img src={service.photo_url} alt={`Foto ${service.name}`} /> : <span>{catalogInitials(service.name)}</span>}
                  </span>
                  <span className="os-catalog-title">{service.name}</span>
                  <span className="os-catalog-meta">{service.category_name || "Sem categoria"}</span>
                  <span className="os-catalog-meta">{money(service.default_unit_price)} · usado {service.usage_count || 0}x</span>
                  {service.is_featured ? <span className="os-catalog-featured">Preferido</span> : null}
                  {selected ? <span className="os-catalog-selected">Selecionado</span> : null}
                </button>;
              })}
              <Link className="os-catalog-card os-catalog-add-card" to="/workshop-services">
                <span className="os-catalog-thumb"><span>+</span></span>
                <span className="os-catalog-title">Adicionar outro serviço</span>
                <span className="os-catalog-meta">Abre o cadastro atual de serviços</span>
              </Link>
            </div>
            <Row className="g-3 mt-2">
              <Col md={6}>
                <Form.Label>Técnico para os selecionados</Form.Label>
                <Form.Select value={serviceForm.technician_id || ""} onChange={(e) => setServiceForm({ ...serviceForm, technician_id: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Status inicial</Form.Label>
                <Form.Select value={serviceForm.status} onChange={(e) => setServiceForm({ ...serviceForm, status: e.target.value })}>
                  <option value="pending">Pendente</option>
                  <option value="approved">Aprovado</option>
                  <option value="in_progress">Em execução</option>
                  <option value="done">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </Form.Select>
              </Col>
            </Row>
          </Card.Body></Card> : null}

          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white"><strong>{serviceEditing ? "Dados do serviço" : "Serviço manual ou ajuste fino"}</strong></Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <Form.Label>Catálogo</Form.Label>
                  <Form.Select value={serviceForm.service_id || ""} onChange={(e) => { const selected = catalog.find((s) => String(s.id) === e.target.value); setServiceForm({ ...serviceForm, service_id: e.target.value, description: selected?.name || serviceForm.description, unit_price: selected?.default_unit_price || serviceForm.unit_price }); }}>
                    <option value="">Manual</option>
                    {catalog.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>Técnico</Form.Label>
                  <Form.Select value={serviceForm.technician_id || ""} onChange={(e) => setServiceForm({ ...serviceForm, technician_id: e.target.value })}>
                    <option value="">Sem responsável</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                  </Form.Select>
                </Col>
              </Row>
              <Form.Label className="mt-3">Descrição</Form.Label>
              <Form.Control required={Boolean(serviceEditing) || !selectedServiceIds.length} value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}/>
              <Row className="mt-3">
                <Col><Form.Label>Qtd.</Form.Label><Form.Control type="number" step="0.01" value={serviceForm.quantity} onChange={(e) => setServiceForm({ ...serviceForm, quantity: e.target.value })}/></Col>
                <Col><Form.Label>Unitário</Form.Label><MoneyInput value={serviceForm.unit_price} onChange={(value) => setServiceForm({ ...serviceForm, unit_price: value })}/></Col>
                <Col><Form.Label>Desconto</Form.Label><MoneyInput value={serviceForm.discount_amount} onChange={(value) => setServiceForm({ ...serviceForm, discount_amount: value })}/></Col>
                <Col><Form.Label>Status</Form.Label><Form.Select value={serviceForm.status} onChange={(e) => setServiceForm({ ...serviceForm, status: e.target.value })}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="in_progress">Em execução</option><option value="done">Concluído</option><option value="cancelled">Cancelado</option></Form.Select></Col>
              </Row>
              <Form.Label className="mt-3">Notas</Form.Label><Form.Control as="textarea" rows={3} value={serviceForm.notes || ""} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}/>
            </Card.Body>
          </Card>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setServiceModal(false)}>Cancelar</Button><Button type="submit">{!serviceEditing && selectedServiceIds.length ? `Adicionar ${selectedServiceIds.length} serviços` : "Salvar"}</Button></Modal.Footer>
      </Form>
    </Modal>

    <Modal size="xl" show={partModal} onHide={() => setPartModal(false)}>
      <Form onSubmit={savePart}>
        <Modal.Header closeButton><Modal.Title>{partEditing ? "Editar peça" : "Adicionar peças à OS"}</Modal.Title></Modal.Header>
        <Modal.Body>
          {!partEditing ? <Card className="border-0 bg-light mb-3"><Card.Body>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h6 className="mb-1">Peças preferidas e mais utilizadas</h6>
                <div className="small text-muted">Selecione uma ou mais peças cadastradas. As preferidas marcadas no cadastro aparecem primeiro e o histórico de uso aparece em cada thumbnail.</div>
              </div>
              <div className="small fw-semibold text-primary">Selecionadas: {selectedPartIds.length}</div>
            </div>
            <div className="os-catalog-grid">
              {orderedPartsCatalog.map((part) => {
                const selected = selectedPartIds.includes(String(part.id));
                return <button type="button" key={part.id} className={`os-catalog-card ${selected ? "selected" : ""}`.trim()} onClick={() => toggleSelectedPart(part.id)}>
                  <span className="os-catalog-thumb">
                    {part.photo_url ? <img src={part.photo_url} alt={`Foto ${part.name}`} /> : <span>{catalogInitials(part.name)}</span>}
                  </span>
                  <span className="os-catalog-title">{part.name}</span>
                  <span className="os-catalog-meta">{part.sku} · estoque {part.stock_quantity} {part.unit}</span>
                  <span className="os-catalog-meta">{money(part.sale_price)} · usado {part.usage_count || 0}x</span>
                  {part.is_featured ? <span className="os-catalog-featured">Preferida</span> : null}
                  {selected ? <span className="os-catalog-selected">Selecionada</span> : null}
                </button>;
              })}
              <Link className="os-catalog-card os-catalog-add-card" to="/parts">
                <span className="os-catalog-thumb"><span>+</span></span>
                <span className="os-catalog-title">Adicionar outra peça</span>
                <span className="os-catalog-meta">Abre o cadastro atual de peças</span>
              </Link>
            </div>
            <Form.Check className="mt-3" label="Consumir estoque ao aprovar/iniciar a OS para as peças selecionadas" checked={!!partForm.consume_inventory} onChange={(e) => setPartForm({ ...partForm, consume_inventory: e.target.checked })}/>
          </Card.Body></Card> : null}

          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white"><strong>{partEditing ? "Dados da peça" : "Peça manual ou ajuste fino"}</strong></Card.Header>
            <Card.Body>
              <Form.Label>Peça</Form.Label>
              <Form.Select value={partForm.part_id || ""} onChange={(e) => { const selected = partsCatalog.find((p) => String(p.id) === e.target.value); setPartForm({ ...partForm, part_id: e.target.value, description: selected?.name || partForm.description, unit_price: selected?.sale_price || partForm.unit_price }); }}>
                <option value="">Manual</option>
                {partsCatalog.map((p) => <option key={p.id} value={p.id}>{p.sku} - {p.name} | estoque {p.stock_quantity}</option>)}
              </Form.Select>
              <Form.Label className="mt-3">Descrição</Form.Label>
              <Form.Control required={Boolean(partEditing) || !selectedPartIds.length} value={partForm.description} onChange={(e) => setPartForm({ ...partForm, description: e.target.value })}/>
              <Row className="mt-3"><Col><Form.Label>Qtd.</Form.Label><Form.Control type="number" step="0.01" value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}/></Col><Col><Form.Label>Unitário</Form.Label><MoneyInput value={partForm.unit_price} onChange={(value) => setPartForm({ ...partForm, unit_price: value })}/></Col><Col><Form.Label>Desconto</Form.Label><MoneyInput value={partForm.discount_amount} onChange={(value) => setPartForm({ ...partForm, discount_amount: value })}/></Col></Row>
              <Form.Check className="mt-3" label="Consumir estoque ao aprovar/iniciar a OS" checked={!!partForm.consume_inventory} onChange={(e) => setPartForm({ ...partForm, consume_inventory: e.target.checked })}/>
              <Form.Label className="mt-3">Notas</Form.Label><Form.Control as="textarea" rows={3} value={partForm.notes || ""} onChange={(e) => setPartForm({ ...partForm, notes: e.target.value })}/>
            </Card.Body>
          </Card>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setPartModal(false)}>Cancelar</Button><Button type="submit">{!partEditing && selectedPartIds.length ? `Adicionar ${selectedPartIds.length} peças` : "Salvar"}</Button></Modal.Footer>
      </Form>
    </Modal>

    <Modal show={paymentModal} onHide={() => setPaymentModal(false)}><Form onSubmit={savePayment}><Modal.Header closeButton><Modal.Title>Registrar pagamento</Modal.Title></Modal.Header><Modal.Body><Form.Label>Valor</Form.Label><MoneyInput className="mb-3" value={paymentForm.amount} onChange={(value) => setPaymentForm({ ...paymentForm, amount: value })}/><Form.Label>Forma</Form.Label><Form.Select className="mb-3" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Form.Select><Form.Label>Referência</Form.Label><Form.Control className="mb-3" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}/><Form.Label>Notas</Form.Label><Form.Control as="textarea" rows={3} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}/></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setPaymentModal(false)}>Cancelar</Button><Button type="submit">Salvar</Button></Modal.Footer></Form></Modal>

    <Modal show={statusModal} onHide={() => setStatusModal(false)}><Form onSubmit={changeStatus}><Modal.Header closeButton><Modal.Title>Alterar status</Modal.Title></Modal.Header><Modal.Body>{allowedStatusTransitions.length ? <><Form.Label>Novo status</Form.Label><Form.Select className="mb-3" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>{allowedStatusTransitions.map((item) => <option key={item.status} value={item.status}>{item.status_label} — {item.label}</option>)}</Form.Select>{statusForm.status && <Alert variant="light" className="border small">{allowedStatusTransitions.find((item) => item.status === statusForm.status)?.description}</Alert>}<Form.Label>Observação {selectedTransitionRequiresNote() ? <span className="text-danger">*</span> : null}</Form.Label><Form.Control as="textarea" rows={3} required={selectedTransitionRequiresNote()} value={statusForm.note} onChange={(e) => setStatusForm({ ...statusForm, note: e.target.value })}/><Form.Check className="mt-3" label="Disparar notificações automáticas configuradas para este status" checked={statusForm.send_notifications} onChange={(e) => setStatusForm({ ...statusForm, send_notifications: e.target.checked })}/></> : <Alert variant="warning" className="mb-0">Não há transição de status permitida para seu perfil neste momento.</Alert>}</Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setStatusModal(false)}>Cancelar</Button><Button type="submit" disabled={!allowedStatusTransitions.length || !statusForm.status}>Atualizar</Button></Modal.Footer></Form></Modal>

    <Modal show={messageModal} onHide={() => setMessageModal(false)}><Form onSubmit={sendMessage}><Modal.Header closeButton><Modal.Title>Enviar mensagem da OS</Modal.Title></Modal.Header><Modal.Body><Form.Label>Template</Form.Label><Form.Select value={messageForm.template_id} onChange={(e) => setMessageForm({ template_id: e.target.value })} required><option value="">Selecione</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.channel} - {t.name}</option>)}</Form.Select><div className="small text-muted mt-2">O sistema renderiza o template com cliente, veículo, OS, totais e usuário logado.</div></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setMessageModal(false)}>Cancelar</Button><Button type="submit">Enviar</Button></Modal.Footer></Form></Modal>
  </>;
}
