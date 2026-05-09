import React, { useState } from "react";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiError } from "../api/client";
import ErrorAlert from "../components/ErrorAlert";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.dashboard_path || "/"} replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={5} lg={4}>
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-4">
              <h1 className="h4 mb-1">Área do sistema</h1>
              <p className="text-muted mb-4">Entre com seu usuário do grupo autorizado.</p>
              <ErrorAlert error={error} onClose={() => setError("")} />
              <Form onSubmit={submit}>
                <Form.Group className="mb-3">
                  <Form.Label>Usuario</Form.Label>
                  <Form.Control value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Senha</Form.Label>
                  <Form.Control type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                </Form.Group>
                <Button type="submit" className="w-100" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
