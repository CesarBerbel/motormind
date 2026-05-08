import React from "react";
import { Card } from "react-bootstrap";

export const templateVariables = [
  { code: "{{ nome_usuario }}", description: "Nome do usuário logado/remetente" },
  { code: "{{ email_usuario }}", description: "Email do usuário logado/remetente" },
  { code: "{{ usuario.username }}", description: "Login do usuário logado" },
  { code: "{{ contato.first_name }}", description: "Primeiro nome do contato" },
  { code: "{{ nome_contato }}", description: "Nome completo do contato" },
  { code: "{{ contato.email }}", description: "Email do contato" },
  { code: "{{ contato.phone_e164 }}", description: "Telefone WhatsApp do contato" },
  { code: "{{ nome_destinatario }}", description: "Nome do destinatário atual" },
  { code: "{{ email_destinatario }}", description: "Email do destinatário atual" },
  { code: "{{ telefone_destinatario }}", description: "Telefone do destinatário atual" },
  { code: "{{ destinatario.nome }}", description: "Nome do destinatário como objeto" },
  { code: "{{ destinatario.telefone }}", description: "Telefone do destinatário como objeto" },
  { code: "{{ custom.plano }}", description: "Campo extra salvo em custom_data" },
  { code: "{{ numero_os }}", description: "Número da ordem de serviço, quando enviada por uma OS" },
  { code: "{{ status_os }}", description: "Status legível da OS" },
  { code: "{{ total_os }}", description: "Valor total da OS" },
  { code: "{{ saldo_os }}", description: "Saldo em aberto da OS" },
  { code: "{{ nome_cliente }}", description: "Nome do cliente da OS" },
  { code: "{{ cliente.email }}", description: "Email do cliente da OS" },
  { code: "{{ telefone_cliente }}", description: "Telefone do cliente da OS" },
  { code: "{{ placa_veiculo }}", description: "Placa do veículo da OS" },
  { code: "{{ modelo_veiculo }}", description: "Modelo do veículo da OS" },
  { code: "{{ veiculo.marca }}", description: "Marca do veículo da OS" },
  { code: "{{ os.diagnostico }}", description: "Diagnóstico registrado na OS" },
  { code: "{{ os.previsao }}", description: "Data prevista/prometida da OS" },
  { code: "{{ agora }}", description: "Data e hora do envio" },
];

export default function VariableHelp() {
  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <Card.Title className="h6">Variáveis disponíveis</Card.Title>
        <div className="small text-muted mb-2">
          Use variáveis de destinatário para campos que mudam a cada contato. Use variáveis de usuário apenas para o remetente logado.
        </div>
        <div className="d-grid gap-2">
          {templateVariables.map(({ code, description: desc }) => (
            <div key={code}>
              <code className="code-help">{code}</code>
              <div className="text-muted small">{desc}</div>
            </div>
          ))}
        </div>
      </Card.Body>
    </Card>
  );
}
