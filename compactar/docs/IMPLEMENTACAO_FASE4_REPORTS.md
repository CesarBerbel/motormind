# Implementação da Fase 4 — Dashboard executivo e relatórios

## Objetivo

Adicionar uma camada gerencial ao sistema, usando os dados já existentes de ordens de serviço, financeiro, estoque, aprovações, peças, serviços e pagamentos.

## Entregas

- Novo app Django `reports`.
- Dashboard executivo consolidado.
- Relatório de ordens de serviço.
- Relatório financeiro.
- Relatório de estoque.
- Exportação CSV para OS, financeiro e estoque.
- Páginas React protegidas por permissão `reports.view`.
- Menu lateral `Relatórios`.
- Testes automatizados dos endpoints JSON e CSV.

## Endpoints criados

```http
GET /api/reports/executive-summary/
GET /api/reports/work-orders/
GET /api/reports/finance/
GET /api/reports/inventory/
GET /api/reports/work-orders/export.csv
GET /api/reports/finance/export.csv
GET /api/reports/inventory/export.csv
```

## Telas criadas

```text
/reports/executive
/reports/work-orders
/reports/finance
/reports/inventory
```

## Banco de dados

Esta fase não cria tabelas novas e não exige migration nova. Os relatórios são calculados em tempo real a partir dos dados já existentes.

## Permissões

Foi adicionada a permissão funcional `reports.view` aos papéis operacionais principais. Dono e Administrativo já possuem acesso total por `*`.

## Validações executadas

```bash
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test accounts.tests workshop.tests finance.tests purchasing.tests reports.tests --settings=config.test_settings --noinput
npm run build
```

Resultado:

```text
Backend: 27 testes OK
Frontend: build concluído com sucesso
```

O Vite exibiu apenas aviso de bundle grande, sem erro de build.
