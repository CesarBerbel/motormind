import React, { useState } from "react";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiError } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";
import SystemToast from "../components/SystemToast";

export default function SetPasswordPage() {
  const { uidb64, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password !== passwordConfirm) {
      setError("A confirmação de senha não confere.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/password-setup/confirm/", { uidb64, token, password, password_confirm: passwordConfirm });
      setSuccess("Senha definida com sucesso. Você já pode entrar no sistema.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container fluid className="login-page d-flex align-items-center justify-content-center min-vh-100">
      <Row className="w-100 justify-content-center">
        <Col md={6} lg={4}>
          <Card className="border-0 shadow-lg">
            <Card.Body className="p-4">
              <h3 className="mb-1">Definir senha</h3>
              <p className="text-muted">Crie sua senha definitiva para acessar o sistema da oficina.</p>
              <ErrorAlert error={error} onClose={() => setError("")} />
              <SystemToast message={success} variant="success" delay={3000} onClose={() => setSuccess("")} />
              <Form onSubmit={submit}>
                <Form.Group className="mb-3">
                  <Form.Label>Nova senha</Form.Label>
                  <Form.Control type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoFocus />
                  <div className="small text-muted mt-1">Use uma senha forte, com pelo menos 8 caracteres.</div>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Confirmar senha</Form.Label>
                  <Form.Control type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required minLength={8} />
                </Form.Group>
                <Button type="submit" className="w-100" disabled={saving}>{saving ? "Salvando..." : "Definir senha"}</Button>
              </Form>
              <div className="text-center mt-3"><Link to="/login">Voltar para login</Link></div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
