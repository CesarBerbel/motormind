# Implementação: preferidos na OS, unidades controladas e mensagens no canto superior direito

## Objetivo

Ajustar a experiência da ordem de serviço e dos cadastros administrativos para que:

1. O cadastro de peças fique mais largo e acomode as abas sem quebra visual.
2. A unidade da peça deixe de ser campo livre e passe a ser um dropdown controlado.
3. Serviços e peças possam ser marcados manualmente como preferidos/mais usados.
4. A tela de seleção na OS priorize esses itens preferidos.
5. Mensagens do sistema sejam exibidas como notificações no canto superior direito, com fechamento automático e botão de fechar.

## Resumo técnico

### Backend

Foram adicionados os campos:

- `WorkshopService.is_featured`
- `Part.is_featured`

Esses campos permitem marcar manualmente quais serviços e peças devem aparecer com prioridade na seleção da OS.

Também foi adicionada normalização de unidade de peça no backend, evitando variações como:

- `UN`
- `unid`
- `unidade`
- `und`
- `peça`
- `pcs`

A unidade é normalizada para uma lista controlada, por exemplo:

- `un`
- `pc`
- `kit`
- `par`
- `jogo`
- `cx`
- `pct`
- `m`
- `cm`
- `l`
- `ml`
- `kg`
- `g`

### Frontend

Foram alteradas as telas:

- `Peças e estoque`
- `Catálogo de serviços`
- `Detalhe da OS`
- telas com mensagens de erro/sucesso/informação

A seleção da OS agora ordena assim:

1. Itens marcados como preferidos no cadastro.
2. Itens com maior uso histórico em OS.
3. Nome do serviço ou peça.

## Arquivos alterados

### Backend

- `backend/workshop/models.py`
- `backend/workshop/serializers.py`
- `backend/workshop/views.py`
- `backend/workshop/admin.py`
- `backend/workshop/migrations/0014_featured_catalog_items_and_unit_normalization.py`

### Frontend

- `frontend/src/components/SystemToast.jsx`
- `frontend/src/components/ErrorAlert.jsx`
- `frontend/src/pages/PartsPage.jsx`
- `frontend/src/pages/WorkshopServicesPage.jsx`
- `frontend/src/pages/WorkOrderDetailPage.jsx`
- `frontend/src/pages/WorkOrderFormPage.jsx`
- `frontend/src/pages/UsersPage.jsx`
- `frontend/src/pages/WorkOrdersKanbanPage.jsx`
- `frontend/src/pages/TechnicalWorkbenchPage.jsx`
- `frontend/src/pages/SetPasswordPage.jsx`
- `frontend/src/workshopOptions.js`
- `frontend/src/styles.css`

## Comandos Windows para aplicar

Assumindo que você está na raiz do projeto:

```bash
git checkout -b feature/os-preferidos-unidades-toasts
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py check
python manage.py test
python manage.py runserver
```

### Frontend

Em outro terminal, na raiz do projeto:

```bash
cd frontend
npm install
npm run build
npm run dev
```

## Como testar

### 1. Testar cadastro de peças

1. Acesse `Peças e estoque`.
2. Clique em `Nova peça` ou edite uma peça existente.
3. Confirme que o modal está mais largo.
4. Acesse a aba `Estoque e preços`.
5. Confirme que `Unidade` agora é um dropdown.
6. Acesse a aba `Observações`.
7. Marque `Mostrar como mais usada/preferida na seleção da OS`.
8. Salve.

### 2. Testar cadastro de serviços

1. Acesse `Catálogo de serviços`.
2. Clique em `Novo serviço` ou edite um serviço existente.
3. Acesse a aba `Detalhes`.
4. Marque `Mostrar como mais usado/preferido na seleção da OS`.
5. Salve.

### 3. Testar seleção na OS

1. Abra uma ordem de serviço.
2. Clique em `Adicionar serviço`.
3. Confirme que os serviços preferidos aparecem primeiro e com selo `Preferido`.
4. Selecione mais de um serviço.
5. Salve.
6. Clique em `Adicionar peça`.
7. Confirme que as peças preferidas aparecem primeiro e com selo `Preferida`.
8. Selecione mais de uma peça.
9. Salve.

### 4. Testar mensagens

1. Execute uma ação com sucesso, como alterar status da OS.
2. Confirme que a mensagem aparece no canto superior direito.
3. Confirme que some automaticamente em 3 segundos.
4. Gere um erro de validação proposital.
5. Confirme que o erro aparece no canto superior direito.
6. Confirme que some automaticamente em 5 segundos.
7. Clique no botão de fechar antes do tempo e confirme que a mensagem desaparece.

## Observações importantes

- A contagem automática de uso em OS foi mantida.
- A marcação manual como preferido tem prioridade sobre a contagem automática.
- A migration normaliza unidades antigas conhecidas para reduzir duplicidade.
- O hash das imagens da OS continua salvo no banco para auditoria, mas não é exibido na interface.
