# Implementação — Checklist técnico, WhatsApp por .env e landing pública

## Objetivo

Esta fase fecha o ciclo operacional da OS e melhora a segurança das configurações sensíveis.

## Entregas

1. Checklist técnico por serviço.
2. Cópia automática do checklist para a OS somente quando a função estiver ativa.
3. Chave liga/desliga no painel administrativo para checklist técnico.
4. Assinatura digital da entrega da OS.
5. Comprovante PDF de entrega com checklist e assinatura.
6. Configurações de WhatsApp movidas para `.env`.
7. Painel administrativo apenas exibe status mascarado do WhatsApp.
8. Landing page pública para visitantes.

## Configurações novas da oficina

No cadastro da oficina foram adicionados:

- `technical_checklist_enabled`;
- `delivery_signature_enabled`;
- `landing_enabled`;
- `landing_headline`;
- `landing_subheadline`;
- `landing_cta_label`;
- `landing_highlight_text`.

## Variáveis novas no backend/.env

```env
WHATSAPP_ENABLED=False
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v24.0
WHATSAPP_PREVIEW_URL=False
```

## Endpoints novos

```http
GET /api/workshop/public/landing/
GET /api/workshop/service-checklist-templates/?service=<id>
POST /api/workshop/service-checklist-templates/
PATCH /api/workshop/service-checklist-templates/{id}/
DELETE /api/workshop/service-checklist-templates/{id}/
GET /api/workshop/work-order-checklist-items/?work_order=<id>
PATCH /api/workshop/work-order-checklist-items/{id}/
GET /api/workshop/work-orders/{id}/delivery-signature/
POST /api/workshop/work-orders/{id}/delivery-signature/
GET /api/workshop/work-orders/{id}/delivery-receipt/
```

## Fluxo operacional

1. O administrador ativa o checklist em `Configurações > Operação`.
2. O administrador cadastra itens de checklist no serviço.
3. Ao adicionar esse serviço na OS, o sistema copia os itens para a OS.
4. O técnico marca cada item como concluído.
5. Itens obrigatórios, com foto ou observação, bloqueiam a conclusão se pendentes.
6. Na entrega, o usuário coleta assinatura digital.
7. O sistema gera comprovante PDF de entrega.

## Observação importante

O checklist é uma função opcional. Se estiver desativado, os cadastros podem existir, mas a OS não é bloqueada por pendências.
