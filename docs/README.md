# Sistema de Oficina Mecânica + Ordens de Serviço + Mensageria

Projeto full stack com **Django + Django REST Framework + React + Bootstrap**, contendo uma área administrativa própria, separada do Django Admin. A versão atual une o sistema de mensagens criado anteriormente com um sistema completo de **ordens de serviço para oficina mecânica**.

## Módulos principais

### Oficina / Ordem de Serviço

- Dashboard operacional da oficina.
- Cadastro de clientes/contatos.
- Cadastro de veículos por cliente.
- Catálogo de serviços/mão de obra.
- Cadastro de peças com preço, custo, localização, estoque mínimo e estoque atual.
- Movimentos de estoque com entrada, ajuste, consumo em OS e estorno.
- Ordens de serviço com número automático no formato `OS-ANO-SEQUENCIA`.
- Status de OS:
  - Rascunho
  - Aberta
  - Diagnóstico
  - Aguardando aprovação
  - Aprovada
  - Em execução
  - Conferência
  - Pronta para entrega
  - Entregue
  - Cancelada
- Prioridade da OS: baixa, normal, alta e urgente.
- Serviços lançados na OS, com técnico, quantidade, preço, desconto e status.
- Peças lançadas na OS, com baixa automática de estoque quando a OS é aprovada ou entra em execução.
- Controle financeiro da OS:
  - subtotal de serviços
  - subtotal de peças
  - descontos
  - total geral
  - total pago
  - saldo pendente
- Pagamentos por dinheiro, cartão, transferência, MB Way, Pix ou outro método.
- Linha do tempo/auditoria da OS.
- Mensagens vinculadas à OS.
- Regras de notificação automática por mudança de status.

### Mensageria integrada

- Templates de email e WhatsApp.
- Email com assunto, corpo HTML e fallback texto puro.
- WhatsApp com texto configurável.
- Envio manual.
- Automações agendadas.
- Histórico de envios.
- Configurações de email e WhatsApp.
- Integração com OS para enviar mensagens ao cliente usando dados da OS, veículo, cliente, totais e usuário logado.

## Telas do frontend

- Login
- Dashboard oficina
- Ordens de serviço
- Criação/edição de OS
- Detalhe da OS
- Veículos
- Catálogo de serviços
- Peças / estoque
- Movimentos de estoque
- Notificações automáticas de OS
- Clientes / contatos
- Grupos de contatos
- Templates
- Criação/edição de template
- Envio manual
- Automações
- Criação/edição de automação
- Histórico de mensagens
- Dashboard de mensagens
- Configurações
- Usuários administradores

## Como rodar o backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_workshop_demo
python manage.py runserver
```

No Windows, use:

```bash
.venv\Scripts\activate
```

O superusuário criado por `createsuperuser` já fica com `is_staff=True`. A área administrativa React não usa `/admin/`.

O comando `seed_workshop_demo` cria exemplos de serviços, peças, cliente, veículo, OS e templates de notificação para acelerar os testes.

## Como rodar o frontend

```bash
cd frontend
npm install
npm run dev
```

Por padrão, o frontend aponta para:

```text
http://localhost:8000/api
```

Para alterar:

```bash
VITE_API_URL=http://localhost:8000/api npm run dev
```

## Configuração de email

Em desenvolvimento, o `.env.example` usa:

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

Assim os emails aparecem no terminal do Django, sem tentar conectar em SMTP real.

Para produção, configure um SMTP válido:

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.seudominio.com
EMAIL_PORT=587
EMAIL_HOST_USER=usuario-ou-apikey
EMAIL_HOST_PASSWORD=senha-ou-token
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=no-reply@seudominio.com
```

Não use `smtp.example.com`, pois isso causa erro de DNS como `[Errno 11001] getaddrinfo failed`.

## WhatsApp

Em desenvolvimento, use o provider `dummy` em **Configurações** para testar sem chamar API externa.

Para Meta Cloud API, configure:

- WhatsApp habilitado: sim.
- Provider: `meta`.
- Access token.
- ID do número remetente Meta.
- Versão da Graph API, por exemplo `v24.0`.

O campo **ID do número remetente Meta** não é o telefone do cliente. Os telefones dos clientes ficam em **Clientes / contatos > WhatsApp E.164**, por exemplo:

```text
+351912345678
```

## Variáveis dos templates

Use sintaxe Django Template, por exemplo:

```django
Olá {{ nome_cliente }}, sua OS {{ numero_os }} está {{ status_os }}.
Total: {{ total_os }}.
```

### Usuário logado / remetente

- `{{ nome_usuario }}`
- `{{ email_usuario }}`
- `{{ usuario.username }}`
- `{{ usuario.first_name }}`
- `{{ usuario.last_name }}`
- `{{ usuario_logado.full_name }}`
- `{{ remetente.email }}`

### Destinatário atual

- `{{ nome_destinatario }}`
- `{{ email_destinatario }}`
- `{{ telefone_destinatario }}`
- `{{ destinatario.nome }}`
- `{{ destinatario.email }}`
- `{{ destinatario.telefone }}`

### Contato / cliente

- `{{ nome_contato }}`
- `{{ contato.first_name }}`
- `{{ contato.last_name }}`
- `{{ contato.email }}`
- `{{ contato.phone_e164 }}`
- `{{ custom.campo }}`
- `{{ nome_cliente }}`
- `{{ email_cliente }}`
- `{{ telefone_cliente }}`
- `{{ cliente.nome }}`
- `{{ cliente.email }}`
- `{{ cliente.telefone }}`

### Ordem de serviço

- `{{ numero_os }}`
- `{{ status_os }}`
- `{{ total_os }}`
- `{{ saldo_os }}`
- `{{ os.numero }}`
- `{{ os.status_label }}`
- `{{ os.titulo }}`
- `{{ os.reclamacao }}`
- `{{ os.diagnostico }}`
- `{{ os.solucao }}`
- `{{ os.total_servicos }}`
- `{{ os.total_pecas }}`
- `{{ os.total }}`
- `{{ os.pago }}`
- `{{ os.saldo }}`
- `{{ os.previsao }}`

### Veículo

- `{{ placa_veiculo }}`
- `{{ modelo_veiculo }}`
- `{{ veiculo.placa }}`
- `{{ veiculo.marca }}`
- `{{ veiculo.modelo }}`
- `{{ veiculo.versao }}`
- `{{ veiculo.ano }}`
- `{{ veiculo.cor }}`
- `{{ veiculo.km }}`
- `{{ veiculo.display }}`

## Regras automáticas de OS

Na tela **Notificações de OS**, configure regras como:

- Quando a OS mudar para **Aguardando aprovação**, enviar WhatsApp pedindo aprovação.
- Quando a OS mudar para **Pronta para entrega**, enviar email informando total e saldo.
- Quando a OS mudar para **Entregue**, enviar mensagem de agradecimento.

Cada regra tem:

- nome
- status gatilho
- canal
- template
- ativo/inativo
- opção de enviar apenas uma vez por status em cada OS

As regras são executadas automaticamente quando o status é alterado pela tela da OS. Também há o botão **Rodar regras automáticas** no detalhe da OS.

## API principal

Base:

```text
/api/
```

Endpoints de oficina:

```text
/api/workshop/dashboard/
/api/workshop/vehicles/
/api/workshop/services/
/api/workshop/parts/
/api/workshop/parts/{id}/adjust_stock/
/api/workshop/stock-movements/
/api/workshop/work-orders/
/api/workshop/work-orders/{id}/change_status/
/api/workshop/work-orders/{id}/send_message/
/api/workshop/work-orders/{id}/trigger_notifications/
/api/workshop/work-order-services/
/api/workshop/work-order-parts/
/api/workshop/work-order-payments/
/api/workshop/work-order-events/
/api/workshop/work-order-messages/
/api/workshop/notification-rules/
```

Endpoints de mensageria já existentes:

```text
/api/auth/login/
/api/auth/refresh/
/api/auth/me/
/api/contacts/
/api/groups/
/api/templates/
/api/send/manual/
/api/automations/
/api/logs/
/api/settings/
/api/users/
```

## Estoque e baixa automática

Ao aprovar a OS ou mover para **Em execução**, o backend tenta consumir o estoque das peças lançadas na OS que estejam marcadas com `consume_inventory=True`.

Se uma peça não tiver estoque suficiente, a mudança de status é bloqueada com erro de validação. Isso evita que a oficina aprove/inicie uma OS que não possui peças suficientes no estoque.

## Estrutura

```text
backend/
  config/
  messaging/
    models.py
    serializers.py
    services.py
    views.py
    providers/
    management/commands/process_due_automations.py
  workshop/
    models.py
    serializers.py
    services.py
    views.py
    urls.py
    management/commands/seed_workshop_demo.py
frontend/
  src/
    api/
    auth/
    components/
    pages/
    workshopOptions.js
```

## Validação feita no pacote

Foram executadas validações de sintaxe:

```bash
python -m compileall config messaging workshop
```

E validação estática dos arquivos React/JSX com `tsc --noEmit`. O build final com `npm run build` deve ser executado no seu ambiente depois de instalar as dependências com `npm install`.

## Próximos ajustes recomendados para produção

- Criar permissões por perfil: atendente, mecânico, gerente e financeiro.
- Adicionar impressão/PDF de OS e orçamento.
- Adicionar assinatura digital do cliente para aprovação.
- Criar aceite de orçamento por link público seguro.
- Adicionar fotos/anexos de diagnóstico e execução.
- Criar suporte a templates oficiais do WhatsApp fora da janela de atendimento.
- Adicionar testes automatizados e OpenAPI/Swagger.
- Armazenar tokens e senhas em vault/secret manager.
- Adicionar opt-in, opt-out e trilha LGPD/RGPD por contato.

## Alterações recentes

- CRUD de categorias gerais em `/api/workshop/categories/` e tela `/categories` no frontend.
- Integração FIPE via proxy backend usando a API Parallelum:
  - `/api/workshop/fipe/brands/?vehicle_type=carros`
  - `/api/workshop/fipe/models/?vehicle_type=carros&brand_code=<codigo>`
  - `/api/workshop/fipe/years/?vehicle_type=carros&brand_code=<codigo>&model_code=<codigo>`
  - `/api/workshop/fipe/detail/?vehicle_type=carros&brand_code=<codigo>&model_code=<codigo>&year_code=<codigo>`
- Cadastro de veículos agora possui selects encadeados de marca, modelo e ano/versão FIPE para carros, mantendo campos manuais editáveis.

Após atualizar o backend, execute:

```bash
python manage.py migrate
```
