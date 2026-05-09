import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import MoneyInput from "../components/MoneyInput";
import PageHeader from "../components/PageHeader";
import SearchableSelect from "../components/SearchableSelect";
import { datetimeLocalValue, fromDatetimeLocal, money, priorities, todayDatetimeLocalValue, workOrderTypes } from "../workshopOptions";

function empty() {
  return {
    customer_id: "",
    vehicle_id: "",
    assigned_to_id: "",
    title: "",
    complaint: "",
    diagnosis: "",
    solution: "",
    internal_notes: "",
    customer_notes: "",
    priority: "normal",
    order_type: "standard",
    reference_work_order_id: "",
    mileage_in: "",
    mileage_out: "",
    promised_at: todayDatetimeLocalValue(),
    manual_discount_amount: "",
  };
}

function decimal(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function contactName(contact) {
  return contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Cliente sem nome";
}

function contactSearchText(contact) {
  return normalize(`${contactName(contact)} ${contact.email || ""} ${contact.phone_e164 || ""} ${contact.id}`);
}

function serviceLineFromService(service) {
  return {
    local_id: crypto.randomUUID(),
    service_id: service.id,
    source_package_id: null,
    source_package_name: "",
    description: service.name,
    quantity: "",
    unit_price: service.default_unit_price || "0.00",
    discount_amount: "0.00",
    notes: "",
  };
}

function serviceLineFromPackageItem(item, servicePackage) {
  return {
    local_id: crypto.randomUUID(),
    service_id: item.service || item.service_id || null,
    source_package_id: servicePackage.id,
    source_package_name: servicePackage.name,
    description: item.description,
    quantity: item.quantity || "1.00",
    unit_price: item.unit_price || "0.00",
    discount_amount: "0.00",
    notes: `Origem: pacote ${servicePackage.name}`,
  };
}

function lineSubtotal(line) {
  return decimal(line.quantity) * decimal(line.unit_price);
}

function lineTotal(line) {
  return Math.max(lineSubtotal(line) - decimal(line.discount_amount), 0);
}

function photoPreviewUrl(file) {
  return file ? URL.createObjectURL(file) : "";
}

export default function WorkOrderFormPage({ embedded = false }) {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty());
  const [contacts, setContacts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [servicePackages, setServicePackages] = useState([]);
  const [referenceOrders, setReferenceOrders] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerOptions, setShowCustomerOptions] = useState(false);
  const [customerMenuStyle, setCustomerMenuStyle] = useState(null);
  const customerInputRef = useRef(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [initialServiceItems, setInitialServiceItems] = useState([]);
  const [openingPhotos, setOpeningPhotos] = useState([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [activeTab, setActiveTab] = useState("customer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const vehiclesForCustomer = useMemo(() => {
    if (!form.customer_id) return [];
    return vehicles.filter((vehicle) => String(vehicle.customer?.id) === String(form.customer_id));
  }, [form.customer_id, vehicles]);

  const filteredContacts = useMemo(() => {
    const query = normalize(customerSearch);
    const candidates = query ? contacts.filter((contact) => contactSearchText(contact).includes(query)) : contacts;
    return candidates.slice(0, 10);
  }, [contacts, customerSearch]);

  const serviceSubtotal = useMemo(() => initialServiceItems.reduce((total, line) => total + lineSubtotal(line), 0), [initialServiceItems]);
  const serviceLineDiscount = useMemo(() => initialServiceItems.reduce((total, line) => total + decimal(line.discount_amount), 0), [initialServiceItems]);
  const manualDiscount = decimal(form.manual_discount_amount);
  const predictedTotal = Math.max(serviceSubtotal - serviceLineDiscount - manualDiscount, 0);
  const serviceOptions = useMemo(() => [
    { value: "", label: "Selecione um serviço" },
    ...services.map((service) => ({
      value: service.id,
      label: [service.code, service.name, money(service.default_unit_price)].filter(Boolean).join(" - "),
    })),
  ], [services]);
  const packageOptions = useMemo(() => [
    { value: "", label: "Selecione um pacote" },
    ...servicePackages.map((servicePackage) => ({
      value: servicePackage.id,
      label: [servicePackage.code, servicePackage.name, money(servicePackage.total_amount)].filter(Boolean).join(" - "),
    })),
  ], [servicePackages]);
  const selectedOpeningPhotoSummary = useMemo(() => {
    if (!openingPhotos.length) return "Nenhuma foto selecionada";
    const visibleNames = openingPhotos.slice(0, 2).map((item) => item.file.name).join(", ");
    const remaining = openingPhotos.length > 2 ? ` +${openingPhotos.length - 2}` : "";
    return `${openingPhotos.length} foto${openingPhotos.length > 1 ? "s" : ""} selecionada${openingPhotos.length > 1 ? "s" : ""}: ${visibleNames}${remaining}`;
  }, [openingPhotos]);

  const updateCustomerMenuPosition = useCallback(() => {
    if (!customerInputRef.current) return;
    const rect = customerInputRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableHeight = openUp ? spaceAbove : spaceBelow;

    setCustomerMenuStyle({
      position: "fixed",
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      left: Math.max(viewportPadding, rect.left),
      width: Math.max(280, rect.width),
      maxHeight: Math.min(360, Math.max(180, availableHeight)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!showCustomerOptions || filteredContacts.length === 0) return undefined;
    updateCustomerMenuPosition();
    return undefined;
  }, [showCustomerOptions, filteredContacts.length, updateCustomerMenuPosition]);

  useEffect(() => {
    if (!showCustomerOptions) return undefined;
    window.addEventListener("resize", updateCustomerMenuPosition);
    window.addEventListener("scroll", updateCustomerMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateCustomerMenuPosition);
      window.removeEventListener("scroll", updateCustomerMenuPosition, true);
    };
  }, [showCustomerOptions, updateCustomerMenuPosition]);

  const tabs = [
    { key: "customer", label: "Cliente e veículo", description: "Identificação do atendimento" },
    { key: "opening", label: "Dados da OS", description: "Tipo, prioridade, prazo e KM" },
    { key: "notes", label: "Relato técnico", description: "Queixa, diagnóstico e solução" },
    !editing
      ? { key: "items", label: "Serviços e pacotes", description: "Composição inicial", badge: initialServiceItems.length || "" }
      : { key: "items", label: "Serviços", description: "Ajuste os itens no detalhe da OS" },
    { key: "financial", label: "Financeiro", description: "Descontos e valor previsto" },
    { key: "protection", label: "Fotos de entrada", description: "Proteção e evidências", badge: openingPhotos.length || "" },
  ];

  async function loadReferenceOrders(customerId, vehicleId) {
    if (!customerId || !vehicleId) {
      setReferenceOrders([]);
      return [];
    }

    const response = await api.get("/workshop/work-orders/", {
      params: {
        customer: customerId,
        vehicle: vehicleId,
        status: "delivered",
      },
    });
    const items = results(response.data).filter((order) => String(order.id) !== String(id || ""));
    setReferenceOrders(items);
    return items;
  }

  async function markReturnIfNeeded(customerId, vehicleId) {
    if (!customerId || !vehicleId) {
      setNotice("");
      return;
    }

    try {
      const finishedOrders = await loadReferenceOrders(customerId, vehicleId);
      if (finishedOrders.length > 0) {
        setForm((current) => {
          if (current.order_type === "warranty") return current;
          return { ...current, order_type: "return", reference_work_order_id: "" };
        });
        setNotice(`Este cliente já possui OS finalizada para este veículo. Tipo marcado automaticamente como Retorno usando a OS ${finishedOrders[0].number} como evidência.`);
      } else {
        setForm((current) => {
          if (current.order_type !== "return") return current;
          return { ...current, order_type: "standard", reference_work_order_id: "" };
        });
        setNotice("");
      }
    } catch (err) {
      setError(apiError(err));
    }
  }

  function clearCustomerSelection(value) {
    setCustomerSearch(value);
    setForm((current) => ({
      ...current,
      customer_id: "",
      vehicle_id: "",
      order_type: current.order_type === "warranty" ? current.order_type : "standard",
      reference_work_order_id: "",
    }));
    setReferenceOrders([]);
    setNotice("");
  }

  function applyCustomerSelection(contact, allVehicles = vehicles) {
    const customerVehicles = allVehicles.filter((vehicle) => String(vehicle.customer?.id) === String(contact.id));
    const selectedVehicleId = customerVehicles[0]?.id ? String(customerVehicles[0].id) : "";

    setCustomerSearch(contactName(contact));
    setShowCustomerOptions(false);
    setForm((current) => ({
      ...current,
      customer_id: String(contact.id),
      vehicle_id: selectedVehicleId,
      order_type: current.order_type === "warranty" ? current.order_type : "standard",
      reference_work_order_id: current.order_type === "warranty" ? current.reference_work_order_id : "",
    }));

    if (selectedVehicleId) {
      markReturnIfNeeded(contact.id, selectedVehicleId);
    } else {
      setReferenceOrders([]);
      setNotice("Cliente selecionado, mas nenhum veículo foi encontrado para preencher automaticamente.");
    }
  }

  async function load() {
    try {
      const [contactRes, vehicleRes, userRes, serviceRes, packageRes] = await Promise.all([
        api.get("/contacts/"),
        api.get("/workshop/vehicles/", { params: { active: "true" } }),
        api.get("/users/"),
        api.get("/workshop/services/", { params: { active: "true" } }),
        api.get("/workshop/service-packages/", { params: { active: "true" } }),
      ]);

      const loadedContacts = results(contactRes.data);
      const loadedVehicles = results(vehicleRes.data);
      setContacts(loadedContacts);
      setVehicles(loadedVehicles);
      setUsers(results(userRes.data));
      setServices(results(serviceRes.data));
      setServicePackages(results(packageRes.data));

      if (editing) {
        const { data } = await api.get(`/workshop/work-orders/${id}/`);
        setForm({
          customer_id: data.customer?.id || "",
          vehicle_id: data.vehicle?.id || "",
          assigned_to_id: data.assigned_to || "",
          title: data.title || "",
          complaint: data.complaint || "",
          diagnosis: data.diagnosis || "",
          solution: data.solution || "",
          internal_notes: data.internal_notes || "",
          customer_notes: data.customer_notes || "",
          priority: data.priority || "normal",
          order_type: data.order_type || "standard",
          reference_work_order_id: data.reference_work_order || "",
          mileage_in: data.mileage_in || "",
          mileage_out: data.mileage_out || "",
          promised_at: datetimeLocalValue(data.promised_at) || todayDatetimeLocalValue(),
          manual_discount_amount: data.manual_discount_amount || "",
        });
        setCustomerSearch(data.customer ? contactName(data.customer) : "");
        await loadReferenceOrders(data.customer?.id, data.vehicle?.id);
      }
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function onCustomerInputChange(event) {
    const value = event.target.value;
    const selected = contacts.find((contact) => String(contact.id) === String(form.customer_id));
    if (selected && value === contactName(selected)) {
      setCustomerSearch(value);
      return;
    }
    clearCustomerSelection(value);
    setShowCustomerOptions(true);
  }

  function onVehicleChange(event) {
    const vehicleId = event.target.value;
    setForm((current) => ({ ...current, vehicle_id: vehicleId, reference_work_order_id: "" }));
    markReturnIfNeeded(form.customer_id, vehicleId);
  }

  function onOrderTypeChange(event) {
    const orderType = event.target.value;
    setForm((current) => ({
      ...current,
      order_type: orderType,
      reference_work_order_id: orderType === "warranty" ? current.reference_work_order_id : "",
    }));

    if (orderType === "warranty") {
      loadReferenceOrders(form.customer_id, form.vehicle_id);
    }
  }

  function addSelectedService() {
    const service = services.find((item) => String(item.id) === String(selectedServiceId));
    if (!service) return;
    setInitialServiceItems((current) => [...current, serviceLineFromService(service)]);
    setSelectedServiceId("");
  }

  function addSelectedPackage() {
    const servicePackage = servicePackages.find((item) => String(item.id) === String(selectedPackageId));
    if (!servicePackage) return;
    const packageItems = servicePackage.items || [];
    if (packageItems.length === 0) {
      setNotice("O pacote selecionado não possui serviços cadastrados.");
      return;
    }
    setInitialServiceItems((current) => [...current, ...packageItems.map((item) => serviceLineFromPackageItem(item, servicePackage))]);
    const packageDiscount = decimal(servicePackage.discount_amount);
    if (packageDiscount > 0) {
      setForm((current) => ({
        ...current,
        manual_discount_amount: String(decimal(current.manual_discount_amount) + packageDiscount),
      }));
      setNotice(`Desconto do pacote ${servicePackage.name} aplicado ao desconto geral da OS.`);
    }
    setSelectedPackageId("");
  }

  function updateInitialServiceItem(localId, changes) {
    setInitialServiceItems((current) => current.map((line) => (line.local_id === localId ? { ...line, ...changes } : line)));
  }

  function removeInitialServiceItem(localId) {
    setInitialServiceItems((current) => current.filter((line) => line.local_id !== localId));
  }

  function addOpeningPhotos(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setOpeningPhotos((current) => [
      ...current,
      ...files.map((file) => ({ local_id: crypto.randomUUID(), file, caption: photoCaption || "Foto de abertura da OS" })),
    ]);
  }

  function onOpeningPhotoInputChange(event) {
    addOpeningPhotos(event.target.files);
    event.target.value = "";
  }

  function clearOpeningPhotos() {
    setOpeningPhotos([]);
  }

  function updateOpeningPhoto(localId, patch) {
    setOpeningPhotos((current) => current.map((item) => (item.local_id === localId ? { ...item, ...patch } : item)));
  }

  function removeOpeningPhoto(localId) {
    setOpeningPhotos((current) => current.filter((item) => item.local_id !== localId));
  }

  async function uploadOpeningPhotos(workOrderId) {
    for (const item of openingPhotos) {
      const formData = new FormData();
      formData.append("work_order", workOrderId);
      formData.append("photo_type", "opening");
      formData.append("caption", item.caption || "Foto de abertura da OS");
      formData.append("is_customer_visible", "true");
      formData.append("image", item.file);
      await api.post("/workshop/work-order-photos/", formData);
    }
  }

  function validateBeforeSave() {
    if (!form.customer_id) {
      setActiveTab("customer");
      setError("Selecione um cliente válido na lista do autocomplete antes de salvar a OS.");
      return false;
    }
    if (form.order_type === "warranty" && !form.reference_work_order_id) {
      setActiveTab("opening");
      setError("Selecione a OS de referência para salvar uma OS de garantia.");
      return false;
    }
    return true;
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    if (!validateBeforeSave()) return;

    const payload = {
      customer_id: Number(form.customer_id),
      vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
      assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : null,
      title: form.title,
      complaint: form.complaint,
      diagnosis: form.diagnosis,
      solution: form.solution,
      internal_notes: form.internal_notes,
      customer_notes: form.customer_notes,
      priority: form.priority,
      order_type: form.order_type,
      reference_work_order_id: form.order_type === "warranty" && form.reference_work_order_id ? Number(form.reference_work_order_id) : null,
      mileage_in: Number(form.mileage_in || 0),
      mileage_out: form.mileage_out === "" ? null : Number(form.mileage_out),
      promised_at: fromDatetimeLocal(form.promised_at),
      manual_discount_amount: form.manual_discount_amount || "0.00",
      initial_service_items: initialServiceItems.map((line) => ({
        service_id: line.service_id ? Number(line.service_id) : null,
        source_package_id: line.source_package_id ? Number(line.source_package_id) : null,
        description: line.description,
        quantity: line.quantity || "1.00",
        unit_price: line.unit_price || "0.00",
        discount_amount: line.discount_amount || "0.00",
        notes: line.notes || "",
      })),
    };

    try {
      const response = editing
        ? await api.put(`/workshop/work-orders/${id}/`, payload)
        : await api.post("/workshop/work-orders/", payload);
      if (openingPhotos.length) {
        await uploadOpeningPhotos(response.data.id);
      }
      navigate("/work-orders");
    } catch (err) {
      setError(apiError(err));
    }
  }

  return <>
    {!embedded ? (
      <>
        <PageHeader title={editing ? "Editar ordem de serviço" : "Nova ordem de serviço"} subtitle="Cadastro de OS separado por abas para facilitar atendimento, revisão e conferência.">
          <Button as={Link} to={editing ? `/work-orders/${id}` : "/work-orders"} variant="outline-secondary">Voltar</Button>
        </PageHeader>
        <AreaTabs area="attendance" />
      </>
    ) : null}
    <ErrorAlert error={error} onClose={() => setError("")}/>
    <SystemToast message={notice} variant="info" delay={3000} onClose={() => setNotice("")} />

    <Form onSubmit={save} noValidate>
      <FormTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />
      <Card className="border-0 shadow-sm">
        <Card.Body>
          <TabPanel activeKey={activeTab} eventKey="customer">
            <Row>
              <Col md={6}>
                <Form.Label>Cliente</Form.Label>
                <div className="autocomplete-box">
                  <Form.Control
                    ref={customerInputRef}
                    required
                    autoComplete="off"
                    placeholder="Digite o nome, telefone ou email do cliente"
                    value={customerSearch}
                    onFocus={() => setShowCustomerOptions(true)}
                    onBlur={() => setTimeout(() => setShowCustomerOptions(false), 150)}
                    onChange={onCustomerInputChange}
                  />
                  {showCustomerOptions && filteredContacts.length > 0 && customerMenuStyle
                    ? createPortal(
                        <div className="autocomplete-menu autocomplete-menu-portal shadow-lg" style={customerMenuStyle}>
                          {filteredContacts.map((contact) => <button
                            type="button"
                            key={contact.id}
                            className="autocomplete-item"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applyCustomerSelection(contact)}
                          >
                            <span className="fw-semibold d-block">{contactName(contact)}</span>
                            <span className="small text-muted d-block">{contact.phone_e164 || "sem telefone"} · {contact.email || "sem email"}</span>
                          </button>)}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
                <div className="small text-muted mt-1">O input exibe apenas o nome completo. Telefone e email aparecem somente na lista para ajudar na escolha.</div>
              </Col>
              <Col md={6}>
                <Form.Label>Veículo</Form.Label>
                <Form.Select value={form.vehicle_id} onChange={onVehicleChange} disabled={!form.customer_id}>
                  <option value="">Sem veículo</option>
                  {vehiclesForCustomer.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.display_name}</option>)}
                </Form.Select>
              </Col>
            </Row>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="opening">
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Tipo</Form.Label>
                <Form.Select value={form.order_type} onChange={onOrderTypeChange}>
                  {workOrderTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Prioridade</Form.Label>
                <Form.Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Responsável</Form.Label>
                <Form.Select value={form.assigned_to_id} onChange={(event) => setForm({ ...form, assigned_to_id: event.target.value })}>
                  <option value="">Sem responsável</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
                </Form.Select>
              </Col>

              {form.order_type === "warranty" && <Col md={12}>
                <Form.Label>OS de referência da garantia</Form.Label>
                <Form.Select
                  required
                  value={form.reference_work_order_id}
                  onChange={(event) => setForm({ ...form, reference_work_order_id: event.target.value })}
                >
                  <option value="">Selecione a OS finalizada que originou a garantia</option>
                  {referenceOrders.map((order) => <option key={order.id} value={order.id}>{order.number} - {order.title || order.vehicle_display || "OS finalizada"}</option>)}
                </Form.Select>
                {referenceOrders.length === 0 && <div className="small text-danger mt-1">Nenhuma OS entregue foi encontrada para este cliente e veículo. Cadastre ou entregue a OS anterior antes de salvar como garantia.</div>}
              </Col>}

              <Col md={6}>
                <Form.Label>Título</Form.Label>
                <Form.Control value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/>
              </Col>
              <Col md={3}>
                <Form.Label>KM entrada</Form.Label>
                <Form.Control type="number" min="0" value={form.mileage_in} onChange={(event) => setForm({ ...form, mileage_in: event.target.value })}/>
              </Col>
              <Col md={3}>
                <Form.Label>KM saída</Form.Label>
                <Form.Control type="number" min="0" value={form.mileage_out} onChange={(event) => setForm({ ...form, mileage_out: event.target.value })}/>
              </Col>
              <Col md={4}>
                <Form.Label>Previsão</Form.Label>
                <Form.Control type="datetime-local" value={form.promised_at} onChange={(event) => setForm({ ...form, promised_at: event.target.value })}/>
                <div className="small text-muted mt-1">A data de abertura continua oculta. Apenas a previsão fica visível e pode ser alterada.</div>
              </Col>
            </Row>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="protection">
            <Card className="form-section-card protection-photo-card">
              <Card.Body>
                <div className="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
                  <div>
                    <div className="form-section-title mb-1">Fotos de proteção na abertura da OS</div>
                    <div className="text-muted small">Registre imagens do veículo antes do serviço para documentar o estado de entrada.</div>
                  </div>
                  <span className="protection-photo-counter align-self-lg-start">{openingPhotos.length} foto{openingPhotos.length === 1 ? "" : "s"}</span>
                </div>

                <div className="protection-help-box">
                  <strong>Boa prática operacional:</strong> fotografe exterior, interior, painel/hodômetro, rodas, pintura e qualquer avaria pré-existente. As imagens ficam vinculadas à OS com usuário, data/hora e hash SHA-256 no backend.
                </div>

                <div className="protection-upload-panel">
                  <Row className="g-3 align-items-end">
                    <Col lg={6}>
                      <Form.Label>Legenda padrão das próximas fotos</Form.Label>
                      <Form.Control value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value)} placeholder="Ex.: Lateral direita na entrada" />
                    </Col>
                    <Col lg={4}>
                      <Form.Label>Selecionar fotos</Form.Label>
                      <div className="protection-file-picker">
                        <input
                          id="openingPhotosInput"
                          className="visually-hidden"
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp"
                          onChange={onOpeningPhotoInputChange}
                        />
                        <Button as="label" htmlFor="openingPhotosInput" type="button" variant="outline-primary" className="mb-0">
                          Escolher fotos
                        </Button>
                        <span className="protection-file-summary" title={selectedOpeningPhotoSummary}>{selectedOpeningPhotoSummary}</span>
                      </div>
                      <Form.Text>Use fotos nítidas. Tamanho máximo por foto validado no backend: 8 MB.</Form.Text>
                    </Col>
                    <Col lg={2}>
                      <Button type="button" variant="outline-secondary" className="w-100" onClick={clearOpeningPhotos} disabled={!openingPhotos.length}>Limpar</Button>
                    </Col>
                  </Row>
                </div>

                {openingPhotos.length ? (
                  <Row className="g-3 mt-1">
                    {openingPhotos.map((item) => (
                      <Col lg={4} md={6} key={item.local_id}>
                        <Card className="evidence-photo-card h-100">
                          <img src={photoPreviewUrl(item.file)} alt={item.file.name} />
                          <Card.Body>
                            <div className="small fw-semibold text-truncate" title={item.file.name}>{item.file.name}</div>
                            <div className="small text-muted mb-2">{Math.round(item.file.size / 1024)} KB</div>
                            <Form.Control size="sm" value={item.caption} onChange={(event) => updateOpeningPhoto(item.local_id, { caption: event.target.value })} placeholder="Legenda da foto" />
                            <Button type="button" size="sm" variant="outline-danger" className="mt-2" onClick={() => removeOpeningPhoto(item.local_id)}>Remover</Button>
                          </Card.Body>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <div className="protection-empty-state">Nenhuma foto selecionada ainda. O cadastro da OS funciona sem foto, mas o ideal operacional é registrar pelo menos exterior, interior, painel/hodômetro e avarias visíveis.</div>
                )}
              </Card.Body>
            </Card>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="items">
            {!editing && <>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h5 className="mb-1">Serviços e pacotes iniciais</h5>
                  <div className="small text-muted">Adicione primeiro a composição técnica da OS. A conferência de desconto e total fica na aba Financeiro.</div>
                </div>
              </div>

              <Row className="g-2">
                <Col md={5}>
                  <SearchableSelect
                    label="Adicionar serviço"
                    value={selectedServiceId}
                    options={serviceOptions}
                    onChange={setSelectedServiceId}
                    placeholder="Pesquisar serviço"
                    emptyMessage="Nenhum serviço encontrado."
                  />
                </Col>
                <Col md={1} className="d-flex align-items-end">
                  <Button type="button" variant="outline-primary" className="w-100" onClick={addSelectedService} disabled={!selectedServiceId}>+</Button>
                </Col>
                <Col md={5}>
                  <SearchableSelect
                    label="Adicionar pacote"
                    value={selectedPackageId}
                    options={packageOptions}
                    onChange={setSelectedPackageId}
                    placeholder="Pesquisar pacote"
                    emptyMessage="Nenhum pacote encontrado."
                  />
                </Col>
                <Col md={1} className="d-flex align-items-end">
                  <Button type="button" variant="outline-primary" className="w-100" onClick={addSelectedPackage} disabled={!selectedPackageId}>+</Button>
                </Col>
              </Row>

              {initialServiceItems.length > 0 ? <Table responsive bordered hover className="mt-3 bg-white">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Descrição</th>
                    <th style={{ width: 120 }}>Qtd.</th>
                    <th style={{ width: 140 }}>Unitário</th>
                    <th style={{ width: 140 }}>Desconto</th>
                    <th style={{ width: 140 }}>Total</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {initialServiceItems.map((line) => <tr key={line.local_id}>
                    <td>{line.source_package_name || "Serviço avulso"}</td>
                    <td><Form.Control value={line.description} onChange={(event) => updateInitialServiceItem(line.local_id, { description: event.target.value })}/></td>
                    <td><Form.Control type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateInitialServiceItem(line.local_id, { quantity: event.target.value })}/></td>
                    <td><MoneyInput value={line.unit_price} onChange={(value) => updateInitialServiceItem(line.local_id, { unit_price: value })}/></td>
                    <td><MoneyInput value={line.discount_amount} onChange={(value) => updateInitialServiceItem(line.local_id, { discount_amount: value })}/></td>
                    <td>{money(lineTotal(line))}</td>
                    <td className="text-end"><Button type="button" size="sm" variant="outline-danger" onClick={() => removeInitialServiceItem(line.local_id)}>Remover</Button></td>
                  </tr>)}
                </tbody>
              </Table> : <Alert variant="light" className="border mt-3 mb-0">Nenhum serviço ou pacote adicionado ainda. A OS pode ser salva sem itens iniciais e receber serviços depois na tela de detalhes.</Alert>}
            </>}

            {editing && <Alert variant="info" className="mb-0">
              Os serviços, pacotes e peças já lançados são mantidos no detalhe da OS. Use a tela de detalhes para incluir, editar ou remover itens técnicos.
            </Alert>}
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="financial">
            <Row className="g-3 justify-content-end">
              {!editing ? <>
                <Col md={3}>
                  <Form.Label>Subtotal dos serviços/combos</Form.Label>
                  <Form.Control readOnly value={money(serviceSubtotal)}/>
                </Col>
                <Col md={3}>
                  <Form.Label>Desconto geral da OS</Form.Label>
                  <MoneyInput value={form.manual_discount_amount} onChange={(value) => setForm({ ...form, manual_discount_amount: value })}/>
                  {serviceLineDiscount > 0 && <div className="small text-muted mt-1">Descontos por item: {money(serviceLineDiscount)}</div>}
                </Col>
                <Col md={3}>
                  <Form.Label>Valor final previsto</Form.Label>
                  <Form.Control readOnly value={money(predictedTotal)}/>
                </Col>
              </> : <>
                <Col md={4}>
                  <Form.Label>Desconto geral da OS</Form.Label>
                  <MoneyInput value={form.manual_discount_amount} onChange={(value) => setForm({ ...form, manual_discount_amount: value })}/>
                  <div className="small text-muted mt-1">Serviços, peças, pagamentos e saldo ficam no detalhe da OS.</div>
                </Col>
              </>}
            </Row>
          </TabPanel>

          <TabPanel activeKey={activeTab} eventKey="notes">
            <Row className="g-3">
              {[
                ["complaint", "Relato do cliente"],
                ["diagnosis", "Diagnóstico"],
                ["solution", "Solução"],
                ["internal_notes", "Observações internas"],
                ["customer_notes", "Observações para o cliente"],
              ].map(([key, label]) => <Col md={key === "solution" ? 12 : 6} key={key}>
                <Form.Label>{label}</Form.Label>
                <Form.Control as="textarea" rows={3} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}/>
              </Col>)}
            </Row>
          </TabPanel>

          <InlineTabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => navigate("/work-orders")} saveLabel="Salvar" />
        </Card.Body>
      </Card>
    </Form>
  </>;
}
