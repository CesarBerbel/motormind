import React from "react";
import { Alert, Button, Card, Container } from "react-bootstrap";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // Mantem o erro visivel no console para desenvolvedores sem derrubar a interface inteira.
    // eslint-disable-next-line no-console
    console.error("Erro capturado pelo ErrorBoundary", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || "Erro inesperado na interface.";

    return (
      <Container className="py-5">
        <Card className="border-0 shadow-sm error-boundary-card mx-auto">
          <Card.Body className="p-4">
            <div className="error-boundary-icon mb-3">!</div>
            <h1 className="h4 mb-2">Algo deu errado ao carregar esta tela</h1>
            <p className="text-muted mb-3">
              A aplicação encontrou um erro visual, mas o navegador não precisa ser fechado. Atualize a página ou volte para uma área segura do sistema.
            </p>
            <Alert variant="danger" className="small">
              {message}
            </Alert>
            <div className="d-flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Atualizar página
              </Button>
              <Button variant="outline-secondary" onClick={() => { window.location.href = "/"; }}>
                Voltar ao painel inicial
              </Button>
              <Button variant="outline-dark" onClick={this.reset}>
                Tentar novamente sem atualizar
              </Button>
            </div>
            {import.meta.env.DEV && this.state.errorInfo?.componentStack ? (
              <details className="mt-4">
                <summary className="text-muted small">Detalhes técnicos em desenvolvimento</summary>
                <pre className="error-boundary-stack mt-2">{this.state.errorInfo.componentStack}</pre>
              </details>
            ) : null}
          </Card.Body>
        </Card>
      </Container>
    );
  }
}
