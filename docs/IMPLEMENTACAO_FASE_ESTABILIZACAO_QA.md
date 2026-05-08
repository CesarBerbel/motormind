# Implementação da Fase de Estabilização, QA e Preparação para Produção

## Objetivo

Esta fase consolida a base do sistema antes de avançar para módulos grandes como PDF profissional, aprovação digital, checklist técnico e fechamento de caixa.

## Entregas implementadas

1. Health check público em `/api/health/`.
2. Verificação profunda opcional em `/api/health/?deep=true`.
3. Tela administrativa `Administração > Saúde do sistema`.
4. ErrorBoundary global no React.
5. Tela administrativa `Administração > Auditoria`.
6. API de auditoria em `/api/accounts/audit-logs/`.
7. Testes de regressão para autenticação, auditoria, saúde, fornecedores, contas a pagar, unidades de peças, ledger e fluxo básico de OS.
8. Configuração rápida de testes em `config.test_settings`.
9. Docker Compose com healthcheck de backend e frontend.
10. Checklist formal de homologação em `HOMOLOGACAO_SISTEMA.md`.

## Arquivos criados

```text
backend/config/health.py
backend/config/test_settings.py
backend/accounts/serializers.py
backend/accounts/views.py
backend/accounts/urls.py
backend/accounts/tests/test_health_and_audit_api.py
backend/accounts/tests/test_regression_smoke_api.py
backend/workshop/tests/test_work_order_api_flow.py
frontend/src/components/ErrorBoundary.jsx
frontend/src/pages/SystemHealthPage.jsx
frontend/src/pages/AuditLogsPage.jsx
HOMOLOGACAO_SISTEMA.md
IMPLEMENTACAO_FASE_ESTABILIZACAO_QA.md
```

## Arquivos alterados

```text
backend/config/urls.py
frontend/src/main.jsx
frontend/src/App.jsx
frontend/src/api/client.js
frontend/src/components/Layout.jsx
frontend/src/styles.css
docker-compose.yml
```

## Endpoint de saúde

### Básico

```text
GET /api/health/
```

Verifica:

- banco de dados;
- migrations;
- diretório de mídia;
- configuração de ambiente;
- configuração do Celery.

### Profundo

```text
GET /api/health/?deep=true
```

Inclui também:

- cache;
- Redis/broker Celery.

## Auditoria

A API de auditoria permite consultar registros de `AuditLog` com filtros:

```text
search
action
app_label
model_name
user
date_from
date_to
ordering
```

Exemplo:

```text
/api/accounts/audit-logs/?action=create&app_label=workshop
```

A tela visual fica em:

```text
Administração > Auditoria
```

## ErrorBoundary

O frontend agora tem uma barreira global de erro. Se uma tela quebrar durante renderização, o sistema mostra uma página amigável com botões para:

- atualizar página;
- voltar ao painel inicial;
- tentar novamente sem atualizar.

## Testes

### Testes rápidos recomendados durante desenvolvimento

```bash
cd backend
.venv\Scripts\activate
python manage.py test accounts.tests workshop.tests finance.tests purchasing.tests --settings=config.test_settings --noinput
```

### Testes com migrations reais

```bash
cd backend
.venv\Scripts\activate
python manage.py test accounts.tests workshop.tests finance.tests purchasing.tests --noinput
```

Observação: o teste com migrations reais pode ser mais lento porque executa cargas iniciais de dados, especialmente marcas de peças.

## Docker

O Docker Compose agora possui healthcheck para:

- PostgreSQL;
- backend Django;
- frontend Nginx.

Também foi substituída a chave local fraca `change-me-in-production` por uma chave de desenvolvimento Docker mais longa. Em produção, gere uma chave própria e armazene em `.env` seguro.

## Próxima fase recomendada

Depois desta estabilização, a próxima fase de maior valor operacional é:

```text
PDF profissional de OS, orçamento e recibo + aprovação digital do cliente.
```
