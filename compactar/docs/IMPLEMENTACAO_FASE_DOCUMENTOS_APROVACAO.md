# Implementação — PDF profissional e aprovação digital da OS

## Objetivo

Implementar a próxima fase funcional do projeto com documentos profissionais e fluxo de aprovação digital do cliente.

## Funcionalidades entregues

1. PDF profissional de orçamento.
2. PDF profissional de ordem de serviço.
3. PDF profissional de recibo.
4. Link público de aprovação digital.
5. Tela pública para cliente visualizar documento, serviços, peças e totais.
6. Aprovação ou recusa com nome, documento, observação, IP, navegador e data/hora.
7. Histórico de links de aprovação na aba Documentos da OS.
8. Auditoria na linha do tempo da OS quando link é gerado e quando o cliente decide.
9. Testes automatizados para PDF e aprovação digital.

## Backend

### Arquivos criados

- `backend/workshop/documents.py`
- `backend/workshop/migrations/0015_workordercustomerapproval.py`
- `backend/workshop/tests/test_documents_and_approval.py`

### Arquivos alterados

- `backend/workshop/models.py`
- `backend/workshop/serializers.py`
- `backend/workshop/views.py`
- `backend/workshop/urls.py`
- `backend/workshop/admin.py`
- `backend/requirements.txt`

### Endpoints criados

#### PDF autenticado da OS

```http
GET /api/workshop/work-orders/{id}/document/?type=estimate
GET /api/workshop/work-orders/{id}/document/?type=work_order
GET /api/workshop/work-orders/{id}/document/?type=receipt
```

#### Histórico de aprovações da OS

```http
GET /api/workshop/work-orders/{id}/customer_approvals/
```

#### Geração de link público

```http
POST /api/workshop/work-orders/{id}/create_customer_approval/
```

Payload:

```json
{
  "document_type": "estimate",
  "expires_days": 7
}
```

#### Tela pública/API pública de aprovação

```http
GET /api/workshop/customer-approvals/{token}/
POST /api/workshop/customer-approvals/{token}/
GET /api/workshop/customer-approvals/{token}/pdf/
```

Payload de decisão:

```json
{
  "decision": "approved",
  "name": "Nome do cliente",
  "document": "CPF/CNPJ",
  "notes": "Observações opcionais"
}
```

## Frontend

### Arquivos criados

- `frontend/src/pages/CustomerApprovalPage.jsx`

### Arquivos alterados

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/pages/WorkOrderDetailPage.jsx`
- `frontend/src/styles.css`

### Rotas criadas

```text
/aprovar-os/:token
```

### Tela da OS

Foi adicionada a aba:

```text
Documentos
```

Nela o usuário pode:

- abrir PDF de orçamento;
- abrir PDF da OS;
- abrir PDF de recibo;
- gerar link de aprovação digital;
- copiar links gerados anteriormente;
- consultar status de aprovação/recusa.

## Banco de dados

Foi criado o model:

```text
WorkOrderCustomerApproval
```

Campos principais:

- OS vinculada;
- tipo de documento;
- token público;
- status;
- validade;
- snapshot do cliente;
- dados da decisão;
- IP;
- user agent;
- usuário que solicitou.

## Comandos Windows

Na raiz do projeto:

```bash
git checkout -b phase/documentos-pdf-aprovacao-digital
```

Backend:

```bash
cd backend
.venv\Scripts\activate
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test workshop.tests.test_documents_and_approval --settings=config.test_settings --noinput
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run build
npm run dev
```

## Como testar

1. Faça login no sistema.
2. Abra uma OS existente.
3. Acesse a aba `Documentos`.
4. Clique em `Abrir PDF de orçamento`.
5. Clique em `Abrir PDF da OS`.
6. Clique em `Abrir PDF de recibo`.
7. Clique em `Gerar link`.
8. Escolha `Orçamento`.
9. Defina validade de 7 dias.
10. Copie o link gerado.
11. Abra o link em uma aba anônima.
12. Confirme que a página pública abre sem login.
13. Clique em `Abrir PDF`.
14. Preencha nome/documento.
15. Clique em `Aprovar documento`.
16. Volte para a OS.
17. Confirme que o status da aprovação foi atualizado na aba `Documentos`.
18. Confira a linha do tempo da OS.

## Observações de segurança

- O link público usa UUID aleatório e não exige login.
- A decisão registra IP e user agent para rastreabilidade.
- O token só permite visualizar aquela aprovação específica.
- O endpoint público não expõe notas internas da OS.
- A aprovação digital registra evidência operacional, mas não substitui requisitos legais específicos de assinatura eletrônica avançada/certificada quando exigidos por contrato ou legislação aplicável.
