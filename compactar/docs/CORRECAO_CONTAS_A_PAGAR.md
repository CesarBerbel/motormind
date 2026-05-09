# Correção: erro ao criar conta a pagar

## Problema corrigido

Ao criar uma conta a pagar em `/api/finance/accounts-payable/`, o backend retornava erro:

```text
AttributeError: 'list' object has no attribute 'customer_id'
```

A causa era a existência de métodos duplicados dentro de `AccountPayableViewSet` em `backend/finance/views.py`.

O primeiro `create()` correto de contas a pagar foi sobrescrito por outro `create()` copiado do fluxo de contas a receber. Assim, depois de salvar uma ou mais contas a pagar, a view tentava serializar o retorno com `AccountReceivableDetailSerializer`, que espera `customer_id`, campo inexistente em `AccountPayable`.

## Arquivo alterado

```text
backend/finance/views.py
```

## O que foi ajustado

- Removidos métodos duplicados indevidos dentro de `AccountPayableViewSet`.
- Mantido o `create()` correto usando `AccountPayableDetailSerializer(..., many=True)`.
- Mantido o retorno compatível com criação de uma conta à vista ou várias parcelas:

```json
{
  "created": [],
  "count": 1
}
```

## Teste criado

```text
backend/finance/tests/test_payables_api.py
```

O teste cobre:

1. Criação de conta a pagar à vista.
2. Criação de conta a pagar parcelada.
3. Retorno correto da API sem usar serializer de contas a receber.

## Comandos validados

```bash
cd backend
PYTHONDONTWRITEBYTECODE=1 python manage.py check
PYTHONDONTWRITEBYTECODE=1 python manage.py makemigrations --check --dry-run
PYTHONDONTWRITEBYTECODE=1 python manage.py test accounts.tests workshop.tests finance.tests --noinput
```

Resultado:

```text
Ran 8 tests
OK
```
