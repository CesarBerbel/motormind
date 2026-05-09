import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Spinner, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import NoticeBox from "../components/NoticeBox";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import PageHeader from "../components/PageHeader";
import SearchableSelect from "../components/SearchableSelect";
import SearchAutocompleteInput from "../components/SearchAutocompleteInput";
import { normalizeSearchText } from "../utils/search";
import { confirmDialog } from "../components/ConfirmDialog";

const empty = () => ({
  customer_id: "",
  plate: "",
  make: "",
  model: "",
  version: "",
  year: "",
  color: "",
  vin: "",
  odometer_km: "",
  notes: "",
  is_active: true,
  fipe_brand_code: "",
  fipe_model_code: "",
  fipe_year_code: "",
});

const vehicleTabs = [
  { key: "owner", label: "Cliente e placa", description: "Vínculo principal do veículo" },
  { key: "fipe", label: "FIPE e modelo", description: "Troque o modelo sem recriar o carro" },
  { key: "details", label: "Detalhes", description: "Cor, chassi, KM e status" },
];

function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function normalizeFipeName(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function formatVehicleKm(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `${number.toLocaleString("pt-BR")} km`;
}

function vehicleSearchSuggestion(vehicle) {
  const vehicleLabel = [vehicle.make, vehicle.model, vehicle.version].filter(Boolean).join(" ").trim() || "Veiculo sem modelo";
  const title = [vehicle.plate || "Sem placa", vehicleLabel, vehicle.year].filter(Boolean).join(" - ");
  const customer = vehicle.customer || {};
  const customerName = vehicle.customer_name || customer.display_name || customer.full_name || "Cliente nao informado";
  const customerDocument = customer.document_number ? `CPF/CNPJ: ${customer.document_number}` : "";
  const customerPhone = customer.phone_e164 ? `WhatsApp: ${customer.phone_e164}` : "";
  const customerEmail = customer.email ? `Email: ${customer.email}` : "";
  const customerLocation = [customer.city, customer.state].filter(Boolean).join(" / ");
  const details = [
    customerName,
    vehicle.color ? `Cor: ${vehicle.color}` : "",
    formatVehicleKm(vehicle.odometer_km),
    vehicle.vin ? `Chassi: ${vehicle.vin}` : "",
  ].filter(Boolean).join(" • ");
  const fipe = vehicle.has_fipe_link || vehicle.fipe_model_code ? "FIPE vinculado" : "Cadastro manual";
  const status = vehicle.is_active ? "Ativo" : "Inativo";

  return {
    key: vehicle.id,
    label: title,
    value: title,
    description: details,
    meta: [customerDocument, customerEmail, customerPhone, customerLocation, fipe, status].filter(Boolean).join(" • "),
    payload: vehicle,
    searchText: [
      title,
      vehicle.display_name,
      vehicle.plate,
      vehicle.make,
      vehicle.model,
      vehicle.version,
      vehicle.year,
      vehicle.color,
      vehicle.vin,
      vehicle.odometer_km,
      vehicle.fipe_brand_code,
      vehicle.fipe_model_code,
      vehicle.fipe_year_code,
      customerName,
      customer.full_name,
      customer.display_name,
      customer.first_name,
      customer.last_name,
      customer.trade_name,
      customer.document_number,
      customer.email,
      customer.phone_e164,
      customer.secondary_phone_e164,
      customer.zip_code,
      customer.address_line,
      customer.address_number,
      customer.address_complement,
      customer.district,
      customer.city,
      customer.state,
      fipe,
      status,
    ].filter(Boolean).join(" "),
  };
}

function buildVehicleSearchSuggestions(vehicles) {
  return (vehicles || []).map(vehicleSearchSuggestion);
}

export default function VehiclesPage() {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [activeTab, setActiveTab] = useState("owner");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [fipeLoading, setFipeLoading] = useState(false);

  async function load(nextSearch = search) {
    const normalizedSearch = String(nextSearch || "").trim();
    try {
      const [vehicles, contactsResponse] = await Promise.all([
        api.get("/workshop/vehicles/", { params: normalizedSearch ? { search: normalizedSearch } : {} }),
        api.get("/contacts/"),
      ]);
      setItems(results(vehicles.data));
      setContacts(results(contactsResponse.data));
    } catch (e) {
      setError(apiError(e));
    }
  }

  function clearSearch() {
    setSearch("");
    load("");
  }

  function selectVehicleSuggestion(suggestion, nextValue) {
    const selectedVehicle = suggestion?.payload;
    setSearch(nextValue || "");

    if (selectedVehicle?.id) {
      setItems([selectedVehicle]);
      return;
    }

    load(nextValue);
  }

  async function loadBrands() {
    try {
      setFipeLoading(true);
      setBrands(results((await api.get("/workshop/fipe/brands/", { params: { vehicle_type: "carros" } })).data));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setFipeLoading(false);
    }
  }

  async function loadModels(brandCode) {
    if (!brandCode) {
      setModels([]);
      return;
    }
    try {
      setFipeLoading(true);
      const response = await api.get("/workshop/fipe/models/", { params: { vehicle_type: "carros", brand_code: brandCode } });
      setModels(response.data?.modelos || []);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setFipeLoading(false);
    }
  }

  async function loadYears(brandCode, modelCode) {
    if (!brandCode || !modelCode) {
      setYears([]);
      return;
    }
    try {
      setFipeLoading(true);
      setYears(results((await api.get("/workshop/fipe/years/", { params: { vehicle_type: "carros", brand_code: brandCode, model_code: modelCode } })).data));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setFipeLoading(false);
    }
  }

  async function loadFipeDetail(brandCode, modelCode, yearCode, yearLabel) {
    const parsedYear = Number(String(yearLabel || "").match(/\d{4}/)?.[0] || "") || "";
    try {
      setFipeLoading(true);
      const response = await api.get("/workshop/fipe/detail/", { params: { vehicle_type: "carros", brand_code: brandCode, model_code: modelCode, year_code: yearCode } });
      const detail = response.data || {};
      setForm((current) => ({
        ...current,
        fipe_year_code: yearCode,
        year: detail.AnoModelo || parsedYear,
        version: yearLabel || [detail.Combustivel, detail.CodigoFipe].filter(Boolean).join(" - "),
      }));
    } catch (e) {
      setForm((current) => ({ ...current, fipe_year_code: yearCode, year: parsedYear, version: yearLabel || current.version }));
      setError(apiError(e));
    } finally {
      setFipeLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!show) return;
    if (brands.length === 0) return;
    if (form.fipe_brand_code || !form.make) return;

    const currentMake = normalizeFipeName(form.make);
    const matchedBrand = brands.find((brand) => normalizeFipeName(brand.nome) === currentMake);
    if (!matchedBrand) return;

    setForm((current) => ({ ...current, fipe_brand_code: matchedBrand.codigo }));
    loadModels(matchedBrand.codigo);
  }, [show, brands, form.fipe_brand_code, form.make]);

  const contactOptions = useMemo(() => [
    { value: "", label: "Selecione o cliente" },
    ...contacts.map((contact) => ({
      value: contact.id,
      label: [contact.full_name, contact.email || contact.phone_e164].filter(Boolean).join(" - "),
    })),
  ], [contacts]);

  const brandOptions = useMemo(() => [
    { value: "", label: form.make ? `Manter marca atual: ${form.make}` : "Selecione a marca FIPE" },
    ...brands.map((brand) => ({ value: brand.codigo, label: brand.nome })),
  ], [brands, form.make]);

  const modelOptions = useMemo(() => [
    { value: "", label: form.model ? `Manter modelo atual: ${form.model}` : "Selecione o modelo FIPE" },
    ...models.map((model) => ({ value: model.codigo, label: model.nome })),
  ], [models, form.model]);

  const yearOptions = useMemo(() => [
    { value: "", label: form.version ? `Manter ano/versão atual: ${form.version}` : "Selecione o ano/versão FIPE" },
    ...years.map((year) => ({ value: year.codigo, label: year.nome })),
  ], [years, form.version]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function open(vehicle = null) {
    const fipeBrandCode = vehicle?.fipe_brand_code || "";
    const fipeModelCode = vehicle?.fipe_model_code || "";

    setEditing(vehicle);
    setActiveTab("owner");
    setModels([]);
    setYears([]);
    setForm(vehicle ? {
      customer_id: vehicle.customer?.id || "",
      plate: vehicle.plate || "",
      make: vehicle.make || "",
      model: vehicle.model || "",
      version: vehicle.version || "",
      year: vehicle.year || "",
      color: vehicle.color || "",
      vin: vehicle.vin || "",
      odometer_km: vehicle.odometer_km || 0,
      notes: vehicle.notes || "",
      is_active: vehicle.is_active,
      fipe_brand_code: fipeBrandCode,
      fipe_model_code: fipeModelCode,
      fipe_year_code: vehicle.fipe_year_code || "",
    } : empty());
    setShow(true);
    if (brands.length === 0) loadBrands();
    if (fipeBrandCode) loadModels(fipeBrandCode);
    if (fipeBrandCode && fipeModelCode) loadYears(fipeBrandCode, fipeModelCode);
  }

  function handleBrandChange(code) {
    if (!code) {
      update({ fipe_brand_code: "", fipe_model_code: "", fipe_year_code: "" });
      setModels([]);
      setYears([]);
      return;
    }

    const brand = brands.find((item) => String(item.codigo) === String(code));
    update({
      fipe_brand_code: code,
      fipe_model_code: "",
      fipe_year_code: "",
      make: brand?.nome || form.make,
      model: "",
      version: "",
      year: "",
    });
    setYears([]);
    loadModels(code);
  }

  function handleModelChange(code) {
    if (!code) {
      update({ fipe_model_code: "", fipe_year_code: "" });
      setYears([]);
      return;
    }

    const model = models.find((item) => String(item.codigo) === String(code));
    update({
      fipe_model_code: code,
      fipe_year_code: "",
      model: model?.nome || form.model,
      version: "",
      year: "",
    });
    loadYears(form.fipe_brand_code, code);
  }

  function handleYearChange(code) {
    const year = years.find((item) => String(item.codigo) === String(code));
    loadFipeDetail(form.fipe_brand_code, form.fipe_model_code, code, year?.nome || "");
  }

  function clearFipeLink() {
    update({
      fipe_brand_code: "",
      fipe_model_code: "",
      fipe_year_code: "",
    });
    setModels([]);
    setYears([]);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.make || !form.model) {
      setActiveTab("fipe");
      setError("Selecione a marca e o modelo na aba FIPE e modelo antes de salvar o veículo.");
      return;
    }
    const payload = {
      customer_id: Number(form.customer_id),
      plate: normalizePlate(form.plate),
      make: form.make,
      model: form.model,
      version: form.version,
      year: form.year || null,
      color: form.color,
      vin: form.vin,
      odometer_km: Number(form.odometer_km || 0),
      notes: form.notes,
      is_active: form.is_active,
      fipe_brand_code: form.fipe_brand_code || "",
      fipe_model_code: form.fipe_model_code || "",
      fipe_year_code: form.fipe_year_code || "",
    };
    try {
      if (editing) await api.put(`/workshop/vehicles/${editing.id}/`, payload);
      else await api.post("/workshop/vehicles/", payload);
      setShow(false);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(vehicle) {
    if (!(await confirmDialog(`Excluir veículo ${vehicle.plate}?`))) return;
    try {
      await api.delete(`/workshop/vehicles/${vehicle.id}/`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <>
      <PageHeader title="Veículos" subtitle="Veículos vinculados aos clientes/contatos, com edição de modelo FIPE sem recriar o cadastro.">
        <Button onClick={() => open()}>Novo veículo</Button>
      </PageHeader>
      <ErrorAlert error={error} onClose={() => setError("")} />

      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={10}>
              <Form.Label>Busca</Form.Label>
              <SearchAutocompleteInput
                placeholder="Buscar por placa, cliente, marca, modelo, ano, cor, chassi ou FIPE"
                value={search}
                onChange={setSearch}
                onSearch={load}
                onSelect={selectVehicleSuggestion}
                suggestions={buildVehicleSearchSuggestions(items)}
              />
            </Col>
            <Col md={2}>
              <Button className="w-100" variant="outline-secondary" onClick={clearSearch} disabled={!search}>Limpar pesquisa</Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {items.length === 0 ? <EmptyState /> : (
            <Table responsive hover className="mb-0">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th>Veículo</th>
                  <th>Ano</th>
                  <th>KM</th>
                  <th>FIPE</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td className="fw-semibold">{vehicle.plate}</td>
                    <td>{vehicle.customer_name}</td>
                    <td>{vehicle.make} {vehicle.model} {vehicle.version}</td>
                    <td>{vehicle.year || "-"}</td>
                    <td>{vehicle.odometer_km}</td>
                    <td>{vehicle.fipe_model_code ? "Vinculado" : "Manual"}</td>
                    <td>{vehicle.is_active ? "Ativo" : "Inativo"}</td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" onClick={() => open(vehicle)} className="me-2">Editar</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(vehicle)}>Excluir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal size="xl" show={show} onHide={() => setShow(false)} className="floating-form-modal">
        <Form onSubmit={save}>
          <Modal.Header closeButton>
            <Modal.Title>{editing ? "Editar" : "Novo"} veículo</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <FormTabs tabs={vehicleTabs} activeKey={activeTab} onSelect={setActiveTab} />

            <TabPanel activeKey={activeTab} eventKey="owner">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="form-section-title">Cliente e identificação principal</div>
                  <Row className="g-3">
                    <Col md={7}>
                      <SearchableSelect
                        label="Cliente"
                        value={form.customer_id}
                        options={contactOptions}
                        onChange={(value) => update({ customer_id: value })}
                        placeholder="Pesquisar cliente"
                        required
                      />
                    </Col>
                    <Col md={3}>
                      <Form.Label>Placa</Form.Label>
                      <Form.Control required value={form.plate} onChange={(event) => update({ plate: normalizePlate(event.target.value) })} placeholder="ABC1D23" />
                    </Col>
                    <Col md={2}>
                      <Form.Label>Status</Form.Label>
                      <Form.Check className="mt-2" label="Ativo" checked={form.is_active} onChange={(event) => update({ is_active: event.target.checked })} />
                    </Col>
                  </Row>

                  <NoticeBox variant="info" className="mt-3 mb-0" title="Modelo separado por etapa">
                    Marca, modelo e ano não aparecem nesta primeira etapa porque agora são escolhidos na aba <strong>FIPE e modelo</strong>. Assim o usuário mantém cliente e placa e altera apenas o modelo quando necessário.
                  </NoticeBox>
                </Card.Body>
              </Card>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="fipe">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <div className="form-section-title mb-1">Dados FIPE</div>
                      <div className="text-muted small">
                        Em veículos já vinculados à FIPE, você pode trocar o modelo selecionando outro modelo da mesma marca, sem alterar cliente, placa ou cadastro do carro.
                      </div>
                    </div>
                    <div>
                      {fipeLoading ? <Spinner animation="border" size="sm" className="me-2" /> : null}
                      <Button type="button" size="sm" variant="outline-secondary" onClick={clearFipeLink}>Limpar vínculo FIPE</Button>
                    </div>
                  </div>

                  <Row className="g-3">
                    <Col md={4}>
                      <SearchableSelect
                        label="Marca FIPE"
                        value={form.fipe_brand_code || ""}
                        options={brandOptions}
                        onChange={handleBrandChange}
                        placeholder="Pesquisar marca"
                        helpText={form.fipe_brand_code ? "A marca está vinculada. Para trocar só o modelo, altere apenas o campo Modelo FIPE." : "Selecione uma marca para carregar os modelos FIPE."}
                      />
                    </Col>
                    <Col md={4}>
                      <SearchableSelect
                        label="Modelo FIPE"
                        value={form.fipe_model_code || ""}
                        options={modelOptions}
                        onChange={handleModelChange}
                        placeholder="Pesquisar modelo"
                        disabled={!form.fipe_brand_code}
                        helpText={!form.fipe_brand_code ? "Selecione ou vincule a marca FIPE primeiro." : "Este campo altera somente o modelo e mantém a marca atual."}
                      />
                    </Col>
                    <Col md={4}>
                      <SearchableSelect
                        label="Ano / versão FIPE"
                        value={form.fipe_year_code || ""}
                        options={yearOptions}
                        onChange={handleYearChange}
                        placeholder="Pesquisar ano/versão"
                        disabled={!form.fipe_model_code}
                        helpText={!form.fipe_model_code ? "Selecione o modelo FIPE primeiro." : "Ao selecionar, ano e versão são atualizados automaticamente."}
                      />
                    </Col>
                  </Row>

                  <Row className="g-3 mt-2">
                    <Col md={4}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Marca atual salva</div>
                        <div className="fw-semibold">{form.make || "-"}</div>
                      </div>
                    </Col>
                    <Col md={4}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Modelo atual salvo</div>
                        <div className="fw-semibold">{form.model || "-"}</div>
                      </div>
                    </Col>
                    <Col md={4}>
                      <div className="form-muted-box">
                        <div className="text-muted small">Ano/versão atual</div>
                        <div className="fw-semibold">{[form.year, form.version].filter(Boolean).join(" - ") || "-"}</div>
                      </div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </TabPanel>

            <TabPanel activeKey={activeTab} eventKey="details">
              <Card className="form-section-card">
                <Card.Body>
                  <div className="form-section-title">Detalhes complementares</div>
                  <Row className="g-3">
                    <Col md={3}>
                      <Form.Label>Cor</Form.Label>
                      <Form.Control value={form.color} onChange={(event) => update({ color: event.target.value })} />
                    </Col>
                    <Col md={3}>
                      <Form.Label>KM</Form.Label>
                      <Form.Control type="number" min="0" value={form.odometer_km} onChange={(event) => update({ odometer_km: event.target.value })} />
                    </Col>
                    <Col md={6}>
                      <Form.Label>VIN/Chassi</Form.Label>
                      <Form.Control value={form.vin} onChange={(event) => update({ vin: event.target.value.toUpperCase() })} />
                    </Col>
                    <Col md={12}>
                      <Form.Label>Versão / combustível</Form.Label>
                      <Form.Control value={form.version} onChange={(event) => update({ version: event.target.value })} />
                    </Col>
                    <Col md={12}>
                      <Form.Label>Notas</Form.Label>
                      <Form.Control as="textarea" rows={4} value={form.notes} onChange={(event) => update({ notes: event.target.value })} />
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </TabPanel>
          </Modal.Body>
          <TabbedFormFooter tabs={vehicleTabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
        </Form>
      </Modal>
    </>
  );
}
