# Correção: VehiclesPage e FinancePayablesPage com rodapé de abas

## Problema corrigido

A tela de veículos quebrava em tempo de execução porque o componente `VehiclesPage.jsx` chamava:

```jsx
<TabbedFormFooter tabs={tabs} ... />
```

mas nessa página o array correto se chama `vehicleTabs`.

Também foi corrigido o mesmo padrão preventivamente em contas a pagar, onde o array correto é `payableFormTabs`.

## Arquivos alterados

- `frontend/src/pages/VehiclesPage.jsx`
- `frontend/src/pages/FinancePayablesPage.jsx`

## Correções aplicadas

### Veículos

Antes:

```jsx
<TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
```

Depois:

```jsx
<TabbedFormFooter tabs={vehicleTabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar" />
```

### Contas a pagar

Antes:

```jsx
<TabbedFormFooter tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar conta a pagar" />
```

Depois:

```jsx
<TabbedFormFooter tabs={payableFormTabs} activeKey={activeTab} onSelect={setActiveTab} onCancel={() => setShow(false)} saveLabel="Salvar conta a pagar" />
```

## Validação executada

```bash
cd frontend
npm ci
npm run build
```

Resultado:

```text
✓ built successfully
```

O Vite manteve apenas o aviso antigo de bundle grande, sem erro de compilação.
