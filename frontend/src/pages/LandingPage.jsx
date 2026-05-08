import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import { money } from "../workshopOptions";

function initials(name = "OF") {
  return String(name || "OF").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function LandingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const { data: response } = await api.get("/workshop/public/landing/");
        setData(response);
      } catch (err) {
        setError(apiError(err));
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <Container className="py-5">
        <Alert variant="danger">{error}</Alert>
        <Button as={Link} to="/login" variant="outline-primary">Entrar no sistema</Button>
      </Container>
    );
  }

  if (!data) {
    return <div className="landing-loading"><Spinner animation="border" /><span>Carregando oficina...</span></div>;
  }

  const workshopName = data.display_name || data.trade_name || data.legal_name || "Oficina";
  const headline = data.landing_headline || `Atendimento automotivo com transparência na ${workshopName}`;
  const subheadline = data.landing_subheadline || "Solicite atendimento, acompanhe orçamentos digitais e aprove serviços com segurança.";
  const cta = data.landing_cta_label || "Solicitar atendimento";
  const whatsapp = data.phone_e164 || data.secondary_phone_e164 || "";
  const whatsappUrl = whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, "")}` : "";

  if (!data.landing_enabled) {
    return (
      <Container className="py-5 text-center">
        <h1>{workshopName}</h1>
        <p className="text-muted">Landing page pública desativada no painel administrativo.</p>
        <Button as={Link} to="/login">Entrar no sistema</Button>
      </Container>
    );
  }

  return (
    <div className="public-landing">
      <header className="landing-nav">
        <div className="landing-brand">
          {data.logo_url ? <img src={data.logo_url} alt={`Logo ${workshopName}`} /> : <span>{initials(workshopName)}</span>}
          <strong>{workshopName}</strong>
        </div>
        <Button as={Link} to="/login" variant="outline-light" size="sm">Área restrita</Button>
      </header>

      <section className="landing-hero">
        <Container>
          <Row className="align-items-center g-4">
            <Col lg={7}>
              {data.landing_highlight_text ? <div className="landing-kicker">{data.landing_highlight_text}</div> : null}
              <h1>{headline}</h1>
              <p>{subheadline}</p>
              <div className="d-flex flex-wrap gap-2">
                {whatsappUrl ? <Button as="a" href={whatsappUrl} target="_blank" rel="noreferrer" size="lg" variant="success">{cta}</Button> : null}
                {data.email ? <Button as="a" href={`mailto:${data.email}`} size="lg" variant="outline-light">Enviar email</Button> : null}
              </div>
            </Col>
            <Col lg={5}>
              <Card className="landing-card">
                <Card.Body>
                  <h5>Atendimento digital</h5>
                  <ul className="landing-list">
                    <li>Orçamentos em PDF</li>
                    <li>Aprovação digital pelo cliente</li>
                    <li>Registro de fotos e evidências</li>
                    <li>Recibos e comprovantes de entrega</li>
                  </ul>
                  <hr />
                  <div className="small text-muted">Contato</div>
                  <div className="fw-semibold">{data.phone_e164 || data.secondary_phone_e164 || "Telefone não informado"}</div>
                  <div className="small text-muted mt-2">Endereço</div>
                  <div>{data.address_display || "Endereço não informado"}</div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </section>

      <section className="landing-section">
        <Container>
          <div className="text-center mb-4">
            <h2>Serviços em destaque</h2>
            <p className="text-muted">Alguns serviços preferidos configurados pela oficina.</p>
          </div>
          <Row className="g-3">
            {(data.featured_services || []).length ? data.featured_services.map((service) => (
              <Col md={6} lg={4} key={service.id}>
                <Card className="h-100 landing-service-card">
                  {service.photo_url ? <img src={service.photo_url} alt={service.name} /> : null}
                  <Card.Body>
                    <h5>{service.name}</h5>
                    <p className="text-muted small">{service.description || service.category_name || "Serviço automotivo"}</p>
                    <div className="fw-semibold">A partir de {money(service.default_unit_price)}</div>
                  </Card.Body>
                </Card>
              </Col>
            )) : (
              <Col>
                <Alert variant="light" className="border text-center">Nenhum serviço em destaque configurado ainda.</Alert>
              </Col>
            )}
          </Row>
        </Container>
      </section>

      <footer className="landing-footer">
        <Container className="d-flex flex-wrap justify-content-between gap-2">
          <span>{workshopName}</span>
          <span>{data.email || ""}</span>
        </Container>
      </footer>
    </div>
  );
}
