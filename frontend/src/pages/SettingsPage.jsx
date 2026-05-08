import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import api, { apiError } from "../api/client";
import PageHeader from "../components/PageHeader";
import ErrorAlert from "../components/ErrorAlert";
import NoticeBox from "../components/NoticeBox";
import SystemToast from "../components/SystemToast";
import CepLookupButton from "../components/CepLookupButton";
import FormTabs, { TabPanel } from "../components/FormTabs";
import TabbedFormFooter, { InlineTabbedFormFooter } from "../components/TabbedFormFooter";
import PhoneInputBR from "../components/PhoneInputBR";
import { useAuth } from "../auth/AuthContext";
import { hasPermission } from "../auth/permissions";
import { maskCep, maskCpfCnpj } from "../workshopOptions";
import { maskBrazilPhone, normalizeBrazilPhoneToE164 } from "../utils/phone";

const profileTabs = [
  { key: "company", label: "Oficina", description: "Identificação, logo e contatos" },
  { key: "address", label: "Endereço", description: "CEP, cidade, UF e endereço" },
  { key: "print", label: "Impressões", description: "Cabeçalho, rodapé e termos" },
  { key: "channels", label: "Canais", description: "Email e WhatsApp" },
  { key: "operation", label: "Operação", description: "Checklist, entrega e regras" },
  { key: "landing", label: "Landing pública", description: "Página pública da oficina" },
  { key: "registries", label: "Cadastros", description: "Categorias, peças, serviços e usuários" },
];

const adminModules = [
  { title: "Categorias", description: "Categorias de peças, serviços, veículos e OS.", to: "/categories", permission: "categories.manage" },
  { title: "Peças e marcas", description: "Peças, fotos, marcas com autocomplete e estoque mínimo.", to: "/parts", permission: "parts.manage" },
  { title: "Serviços", description: "Catálogo de serviços por categoria pesquisável.", to: "/workshop-services", permission: "services.view" },
  { title: "Pacotes", description: "Combos de serviços para orçamento e OS.", to: "/service-packages", permission: "service_packages.view" },
  { title: "Usuários e funcionários", description: "Grupos de acesso, foto 3x4, contatos e endereços.", to: "/users", permission: "users.manage" },
  { title: "Fornecedores", description: "Cadastro de fornecedores usado em pedidos de compra.", to: "/purchasing/suppliers", permission: "suppliers.manage" },
  { title: "Notificações de OS", description: "Regras automáticas por mudança de status da OS.", to: "/notification-rules", permission: "messaging.manage" },
  { title: "Templates", description: "Modelos de mensagem e variáveis do sistema.", to: "/templates", permission: "messaging.manage" },
];

const emptyProfile = () => ({
  legal_name: "",
  trade_name: "",
  document_number: "",
  state_registration: "",
  municipal_registration: "",
  logo_url: "",
  email: "",
  phone_e164: "",
  secondary_phone_e164: "",
  website: "",
  zip_code: "",
  address_line: "",
  address_number: "",
  address_complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
  responsible_name: "",
  print_header_text: "",
  print_footer_text: "",
  estimate_terms: "",
  work_order_terms: "",
  purchase_order_terms: "",
  bank_info: "",
  pix_key: "",
  technical_checklist_enabled: false,
  delivery_signature_enabled: true,
  landing_enabled: true,
  landing_headline: "",
  landing_subheadline: "",
  landing_cta_label: "Solicitar atendimento",
  landing_highlight_text: "",
  is_active: true,
});

function normalizeProfile(data) {
  return {
    ...emptyProfile(),
    ...data,
    phone_e164: maskBrazilPhone(data?.phone_e164 || ""),
    secondary_phone_e164: maskBrazilPhone(data?.secondary_phone_e164 || ""),
    document_number: data?.document_number || "",
    zip_code: data?.zip_code || "",
  };
}

export default function SettingsPage() {
  const { user, refreshWorkshopProfile } = useAuth();
  const [channelForm, setChannelForm] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfile());
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [activeTab, setActiveTab] = useState("company");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const logoPreview = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    if (!removeLogo && profileForm.logo_url) return profileForm.logo_url;
    return "";
  }, [logoFile, removeLogo, profileForm.logo_url]);

  async function load() {
    try {
      const [channelRes, profileRes] = await Promise.all([
        api.get("/settings/channel/"),
        api.get("/workshop/company-profile/"),
      ]);
      setChannelForm({ ...channelRes.data, whatsapp_access_token: "" });
      setProfileForm(normalizeProfile(profileRes.data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  function updateProfile(patch) {
    setProfileForm((current) => ({ ...current, ...patch }));
  }

  function updateChannel(patch) {
    setChannelForm((current) => ({ ...current, ...patch }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setSaved("");

    const payload = {
      ...profileForm,
      legal_name: profileForm.legal_name.trim(),
      trade_name: profileForm.trade_name.trim(),
      document_number: maskCpfCnpj(profileForm.document_number),
      zip_code: maskCep(profileForm.zip_code),
      phone_e164: normalizeBrazilPhoneToE164(profileForm.phone_e164),
      secondary_phone_e164: normalizeBrazilPhoneToE164(profileForm.secondary_phone_e164),
      state: profileForm.state.trim().toUpperCase(),
      country: profileForm.country || "Brasil",
    };

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (["id", "display_name", "address_display", "logo", "logo_url", "created_at", "updated_at"].includes(key)) return;
      formData.append(key, value ?? "");
    });
    if (logoFile) formData.append("logo", logoFile);
    if (removeLogo) formData.append("remove_logo", "true");

    try {
      const { data } = await api.put("/workshop/company-profile/", formData);
      setProfileForm(normalizeProfile(data));
      setLogoFile(null);
      setRemoveLogo(false);
      await refreshWorkshopProfile();
      setSaved("Cadastro da oficina salvo com sucesso.");
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function saveChannel(event) {
    event.preventDefault();
    setError("");
    setSaved("");
    const payload = {
      email_enabled: !!channelForm.email_enabled,
      default_from_email: channelForm.default_from_email || "",
    };
    try {
      const { data } = await api.put("/settings/channel/", payload);
      setChannelForm({ ...data, whatsapp_access_token: "" });
      setSaved("Configurações de canais salvas com sucesso.");
    } catch (err) {
      setError(apiError(err));
    }
  }

  if (!channelForm) return <div>Carregando...</div>;

  return (
    <>
      <PageHeader title="Configurações administrativas" subtitle="Centralize oficina, impressões, canais e cadastros administrativos em uma única área." />
      <ErrorAlert error={error} onClose={() => setError("")} />
      <SystemToast message={saved} variant="success" delay={3000} onClose={() => setSaved("")} />

      <FormTabs tabs={profileTabs} activeKey={activeTab} onSelect={setActiveTab} className="mb-3" />

      <Form onSubmit={saveProfile}>
        <TabPanel activeKey={activeTab} eventKey="company">
          <Row className="g-3">
            <Col lg={8}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Identificação da oficina</div>
                  <Row className="g-3">
                    <Col md={7}>
                      <Form.Label>Razão social / nome principal</Form.Label>
                      <Form.Control required value={profileForm.legal_name} onChange={(event) => updateProfile({ legal_name: event.target.value })} />
                    </Col>
                    <Col md={5}>
                      <Form.Label>Nome fantasia</Form.Label>
                      <Form.Control value={profileForm.trade_name} onChange={(event) => updateProfile({ trade_name: event.target.value })} />
                    </Col>
                    <Col md={4}>
                      <Form.Label>CNPJ/CPF</Form.Label>
                      <Form.Control value={profileForm.document_number} onChange={(event) => updateProfile({ document_number: maskCpfCnpj(event.target.value) })} placeholder="00.000.000/0000-00" />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Inscrição estadual</Form.Label>
                      <Form.Control value={profileForm.state_registration} onChange={(event) => updateProfile({ state_registration: event.target.value })} />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Inscrição municipal</Form.Label>
                      <Form.Control value={profileForm.municipal_registration} onChange={(event) => updateProfile({ municipal_registration: event.target.value })} />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Email</Form.Label>
                      <Form.Control type="email" value={profileForm.email} onChange={(event) => updateProfile({ email: event.target.value })} />
                    </Col>
                    <Col md={4}>
                      <PhoneInputBR label="Telefone/WhatsApp principal" value={profileForm.phone_e164} onChange={(value) => updateProfile({ phone_e164: value })} />
                    </Col>
                    <Col md={4}>
                      <PhoneInputBR label="Telefone secundário" value={profileForm.secondary_phone_e164} onChange={(value) => updateProfile({ secondary_phone_e164: value })} />
                    </Col>
                    <Col md={6}>
                      <Form.Label>Site</Form.Label>
                      <Form.Control type="url" value={profileForm.website} onChange={(event) => updateProfile({ website: event.target.value })} placeholder="https://www.suaoficina.com.br" />
                    </Col>
                    <Col md={6}>
                      <Form.Label>Responsável técnico/administrativo</Form.Label>
                      <Form.Control value={profileForm.responsible_name} onChange={(event) => updateProfile({ responsible_name: event.target.value })} />
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={4}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Logomarca</div>
                  <div className="logo-preview-card mb-3">
                    {logoPreview ? <img src={logoPreview} alt="Prévia da logomarca" /> : <span className="text-muted">Sem logomarca cadastrada</span>}
                  </div>
                  <Form.Control type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { setLogoFile(event.target.files?.[0] || null); setRemoveLogo(false); }} />
                  <Form.Text>Use PNG, JPG, WEBP ou SVG. Tamanho máximo validado no backend: 3 MB.</Form.Text>
                  <div className="d-grid gap-2 mt-3">
                    <Button type="button" variant="outline-danger" disabled={!profileForm.logo_url && !logoFile} onClick={() => { setLogoFile(null); setRemoveLogo(true); }}>
                      Remover logomarca
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          <Button className="mt-3" type="submit">Salvar cadastro da oficina</Button>
        </TabPanel>

        <TabPanel activeKey={activeTab} eventKey="address">
          <Card className="form-section-card">
            <Card.Body>
              <div className="form-section-title">Endereço com busca por CEP</div>
              <Row className="g-3 align-items-end">
                <Col md={3}>
                  <Form.Label>CEP</Form.Label>
                  <Form.Control value={profileForm.zip_code} onChange={(event) => updateProfile({ zip_code: maskCep(event.target.value) })} placeholder="00000-000" />
                </Col>
                <Col md={2}>
                  <CepLookupButton
                    cep={profileForm.zip_code}
                    onFound={(address) => updateProfile(address)}
                    onError={setError}
                  />
                </Col>
                <Col md={5}>
                  <Form.Label>Endereço</Form.Label>
                  <Form.Control value={profileForm.address_line} onChange={(event) => updateProfile({ address_line: event.target.value })} />
                </Col>
                <Col md={2}>
                  <Form.Label>Número</Form.Label>
                  <Form.Control value={profileForm.address_number} onChange={(event) => updateProfile({ address_number: event.target.value })} />
                </Col>
                <Col md={4}>
                  <Form.Label>Complemento</Form.Label>
                  <Form.Control value={profileForm.address_complement} onChange={(event) => updateProfile({ address_complement: event.target.value })} />
                </Col>
                <Col md={3}>
                  <Form.Label>Bairro</Form.Label>
                  <Form.Control value={profileForm.district} onChange={(event) => updateProfile({ district: event.target.value })} />
                </Col>
                <Col md={3}>
                  <Form.Label>Cidade</Form.Label>
                  <Form.Control value={profileForm.city} onChange={(event) => updateProfile({ city: event.target.value })} />
                </Col>
                <Col md={2}>
                  <Form.Label>UF</Form.Label>
                  <Form.Control maxLength={2} value={profileForm.state} onChange={(event) => updateProfile({ state: event.target.value.toUpperCase() })} />
                </Col>
                <Col md={3}>
                  <Form.Label>País</Form.Label>
                  <Form.Control value={profileForm.country} onChange={(event) => updateProfile({ country: event.target.value })} />
                </Col>
              </Row>
            </Card.Body>
          </Card>
          <Button className="mt-3" type="submit">Salvar endereço</Button>
        </TabPanel>

        <TabPanel activeKey={activeTab} eventKey="print">
          <Row className="g-3">
            <Col lg={6}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Cabeçalho e rodapé</div>
                  <Form.Group className="mb-3">
                    <Form.Label>Texto curto do cabeçalho</Form.Label>
                    <Form.Control value={profileForm.print_header_text} onChange={(event) => updateProfile({ print_header_text: event.target.value })} placeholder="Ex.: Oficina especializada em mecânica, elétrica e diagnóstico" />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Rodapé padrão</Form.Label>
                    <Form.Control as="textarea" rows={5} value={profileForm.print_footer_text} onChange={(event) => updateProfile({ print_footer_text: event.target.value })} placeholder="Texto exibido em documentos imprimíveis." />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Dados bancários</Form.Label>
                    <Form.Control as="textarea" rows={4} value={profileForm.bank_info} onChange={(event) => updateProfile({ bank_info: event.target.value })} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Chave Pix</Form.Label>
                    <Form.Control value={profileForm.pix_key} onChange={(event) => updateProfile({ pix_key: event.target.value })} />
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={6}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Termos por documento</div>
                  <Form.Group className="mb-3">
                    <Form.Label>Termos de orçamento</Form.Label>
                    <Form.Control as="textarea" rows={4} value={profileForm.estimate_terms} onChange={(event) => updateProfile({ estimate_terms: event.target.value })} />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Termos de OS</Form.Label>
                    <Form.Control as="textarea" rows={4} value={profileForm.work_order_terms} onChange={(event) => updateProfile({ work_order_terms: event.target.value })} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Termos de pedido de compra</Form.Label>
                    <Form.Control as="textarea" rows={4} value={profileForm.purchase_order_terms} onChange={(event) => updateProfile({ purchase_order_terms: event.target.value })} />
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          <Button className="mt-3" type="submit">Salvar dados de impressão</Button>
        </TabPanel>
      </Form>

      <TabPanel activeKey={activeTab} eventKey="channels">
        <NoticeBox variant="info" className="mb-3" title="Configuração global dos canais">
          As configurações desta aba são globais do canal. O campo “ID do número remetente Meta” não é o telefone do destinatário; os telefones dos destinatários ficam em Contatos, no formato E.164.
        </NoticeBox>
        <Form onSubmit={saveChannel}>
          <Row className="g-3">
            <Col lg={6}>
              <Card className="form-section-card h-100">
                <Card.Header className="bg-white fw-semibold">Email</Card.Header>
                <Card.Body>
                  <Form.Check className="mb-3" label="Email habilitado" checked={!!channelForm.email_enabled} onChange={(event) => updateChannel({ email_enabled: event.target.checked })} />
                  <Form.Group>
                    <Form.Label>Remetente padrão</Form.Label>
                    <Form.Control type="email" value={channelForm.default_from_email || ""} onChange={(event) => updateChannel({ default_from_email: event.target.value })} placeholder="no-reply@example.com" />
                    <Form.Text>SMTP fica no arquivo .env do backend. Em desenvolvimento, use o backend console para não depender de DNS/SMTP real.</Form.Text>
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={6}>
              <Card className="form-section-card h-100">
                <Card.Header className="bg-white fw-semibold">WhatsApp</Card.Header>
                <Card.Body>
                  <NoticeBox variant="warning" title="WhatsApp agora é configurado no .env" className="mb-3">
                    Token, provider, Phone Number ID, versão da API e preview de links não são mais salvos pelo painel administrativo. Configure esses valores no arquivo <code>backend/.env</code> para evitar exposição acidental de credenciais.
                  </NoticeBox>
                  <div className="small text-muted mb-2">Origem: {channelForm.whatsapp_source || ".env do backend"}</div>
                  <Table size="sm" className="mb-0">
                    <tbody>
                      <tr><td>Habilitado</td><td>{channelForm.whatsapp_enabled ? "Sim" : "Não"}</td></tr>
                      <tr><td>Provider</td><td>{channelForm.whatsapp_provider || "meta"}</td></tr>
                      <tr><td>Token configurado</td><td>{channelForm.whatsapp_token_configured ? "Sim" : "Não"}</td></tr>
                      <tr><td>Phone Number ID</td><td>{channelForm.whatsapp_phone_number_id || "Não configurado"}</td></tr>
                      <tr><td>Versão da API</td><td>{channelForm.whatsapp_api_version || "v24.0"}</td></tr>
                      <tr><td>Preview de links</td><td>{channelForm.whatsapp_preview_url ? "Sim" : "Não"}</td></tr>
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          <Button className="mt-3" type="submit">Salvar canais</Button>
        </Form>
      </TabPanel>

      <Form onSubmit={saveProfile}>
        <TabPanel activeKey={activeTab} eventKey="operation">
          <Row className="g-3">
            <Col lg={7}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Execução técnica</div>
                  <Form.Check
                    type="switch"
                    className="mb-3"
                    label="Usar checklist técnico obrigatório nas OS"
                    checked={!!profileForm.technical_checklist_enabled}
                    onChange={(event) => updateProfile({ technical_checklist_enabled: event.target.checked })}
                  />
                  <Form.Text className="d-block mb-3">
                    Quando ativo, os itens de checklist cadastrados nos serviços são copiados para a OS e podem bloquear a conclusão do serviço se estiverem pendentes.
                  </Form.Text>
                  <Form.Check
                    type="switch"
                    className="mb-3"
                    label="Usar assinatura digital na entrega da OS"
                    checked={!!profileForm.delivery_signature_enabled}
                    onChange={(event) => updateProfile({ delivery_signature_enabled: event.target.checked })}
                  />
                  <Form.Text className="d-block">
                    Quando ativo, a OS pode registrar assinatura desenhada na tela, nome, documento, IP, navegador e data/hora da entrega.
                  </Form.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={5}>
              <NoticeBox variant="info" title="Controle operacional">
                Desative o checklist se a oficina ainda não quiser exigir conferência técnica por item. Os cadastros de checklist podem continuar existindo; eles só serão exigidos quando a função estiver ligada.
              </NoticeBox>
            </Col>
          </Row>
          <Button className="mt-3" type="submit">Salvar operação</Button>
        </TabPanel>
      </Form>

      <Form onSubmit={saveProfile}>
        <TabPanel activeKey={activeTab} eventKey="landing">
          <Row className="g-3">
            <Col lg={8}>
              <Card className="form-section-card h-100">
                <Card.Body>
                  <div className="form-section-title">Landing page pública</div>
                  <Form.Check
                    type="switch"
                    className="mb-3"
                    label="Habilitar landing page pública"
                    checked={!!profileForm.landing_enabled}
                    onChange={(event) => updateProfile({ landing_enabled: event.target.checked })}
                  />
                  <Form.Group className="mb-3">
                    <Form.Label>Título principal</Form.Label>
                    <Form.Control value={profileForm.landing_headline || ""} onChange={(event) => updateProfile({ landing_headline: event.target.value })} placeholder="Ex.: Cuidamos do seu veículo com transparência" />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Subtítulo</Form.Label>
                    <Form.Control as="textarea" rows={4} value={profileForm.landing_subheadline || ""} onChange={(event) => updateProfile({ landing_subheadline: event.target.value })} />
                  </Form.Group>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Label>Texto do botão principal</Form.Label>
                      <Form.Control value={profileForm.landing_cta_label || ""} onChange={(event) => updateProfile({ landing_cta_label: event.target.value })} />
                    </Col>
                    <Col md={6}>
                      <Form.Label>Destaque curto</Form.Label>
                      <Form.Control value={profileForm.landing_highlight_text || ""} onChange={(event) => updateProfile({ landing_highlight_text: event.target.value })} placeholder="Ex.: Orçamento digital e aprovação online" />
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={4}>
              <NoticeBox variant="info" title="Página pública">
                A landing fica disponível na raiz do frontend para visitantes. Usuários já logados continuam sendo enviados ao painel interno.
              </NoticeBox>
              <Button as={Link} to="/" target="_blank" rel="noreferrer" variant="outline-primary" className="mt-3 w-100">Abrir landing pública</Button>
            </Col>
          </Row>
          <Button className="mt-3" type="submit">Salvar landing</Button>
        </TabPanel>
      </Form>

      <TabPanel activeKey={activeTab} eventKey="registries">
        <Row className="g-3">
          {adminModules.filter((module) => hasPermission(user, module.permission)).map((module) => (
            <Col md={6} xl={3} key={module.to}>
              <Card className="form-section-card h-100 admin-module-card">
                <Card.Body className="d-flex flex-column">
                  <div className="form-section-title">{module.title}</div>
                  <p className="text-muted small flex-grow-1">{module.description}</p>
                  <Button as={Link} to={module.to} variant="outline-primary">Abrir cadastro</Button>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
        <NoticeBox variant="info" className="mt-3 mb-0" title="Central administrativa">
          Esta aba funciona como a central administrativa dos cadastros auxiliares. As rotas antigas continuam existindo para não quebrar permissões e links, mas o menu pode ser operado a partir desta área.
        </NoticeBox>
      </TabPanel>
    </>
  );
}
