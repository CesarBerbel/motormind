# Homologação do Sistema Oficina Admin

Este checklist deve ser executado antes de considerar uma entrega pronta para uso em produção ou homologação com usuários finais.

## 1. Preparação

Assuma que você está na raiz do projeto.

### Backend local

```bash
cd backend
.venv\Scripts\activate
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py runserver
```

### Frontend local

Em outro terminal:

```bash
cd frontend
npm install
npm run build
npm run dev
```

### Testes rápidos de regressão

```bash
cd backend
.venv\Scripts\activate
python manage.py test accounts.tests workshop.tests finance.tests purchasing.tests --settings=config.test_settings --noinput
```

### Teste com migrations reais

Este teste é mais lento, pois executa todas as migrations, inclusive cargas iniciais de dados.

```bash
cd backend
.venv\Scripts\activate
python manage.py test accounts.tests workshop.tests finance.tests purchasing.tests --noinput
```

## 2. Saúde do sistema

1. Acesse o frontend.
2. Faça login como Dono ou Administrativo.
3. Acesse `Administração > Saúde do sistema`.
4. Clique em `Atualizar diagnóstico`.
5. Valide:
   - banco de dados: `ok`;
   - migrations: `ok`;
   - diretório de mídia: `ok`;
   - Celery configurado: `ok`;
   - Redis pode aparecer como `warning` se não estiver rodando localmente fora do Docker.

Também é possível testar direto pela API:

```bash
curl http://localhost:8000/api/health/
curl http://localhost:8000/api/health/?deep=true
```

## 3. Login e autenticação

1. Abra `/login`.
2. Tente senha errada e valide mensagem de usuário/senha inválidos.
3. Faça login correto.
4. Atualize a página com `F5`.
5. Confirme que a sessão continua ativa.
6. Acesse telas protegidas e confirme ausência de erro `As credenciais de autenticação não foram fornecidas`.

## 4. Cadastros administrativos

Validar criação, edição, exclusão e mensagens/toasts em:

- Usuários;
- Clientes/contatos;
- Grupos de contatos;
- Veículos;
- Categorias;
- Serviços;
- Peças;
- Fornecedores;
- Templates;
- Automações;
- Regras de notificação.

Critérios:

- nenhuma tela deve quebrar no console;
- formulários devem manter o padrão visual do site;
- mensagens de sucesso devem desaparecer em 3 segundos;
- mensagens de erro devem desaparecer em 5 segundos;
- o usuário deve conseguir fechar a mensagem manualmente;
- exclusões devem usar modal visual do sistema, não `window.confirm`.

## 5. Fluxo de oficina

1. Criar cliente.
2. Criar veículo vinculado ao cliente.
3. Criar serviço.
4. Criar peça.
5. Marcar serviço/peça como preferido.
6. Criar OS.
7. Adicionar múltiplos serviços pela seleção de thumbnails.
8. Adicionar múltiplas peças pela seleção de thumbnails.
9. Validar totais da OS.
10. Adicionar fotos e confirmar que o hash não aparece na interface.
11. Alterar status da OS.
12. Validar eventos/histórico.

## 6. Financeiro

1. Criar conta a pagar à vista.
2. Criar conta a pagar parcelada.
3. Validar que a API retorna `created` e `count`.
4. Criar conta a receber manual.
5. Registrar pagamento parcial.
6. Registrar pagamento total.
7. Validar status:
   - aberta;
   - parcial;
   - paga;
   - vencida;
   - cancelada.
8. Conferir lançamento financeiro no admin ou no banco.

## 7. Compras e estoque

1. Criar fornecedor pessoa jurídica.
2. Criar fornecedor pessoa física.
3. Criar pedido de compra.
4. Adicionar item de compra.
5. Aprovar pedido.
6. Receber item.
7. Confirmar aumento do estoque.
8. Confirmar conta a pagar gerada quando aplicável.

## 8. Mensageria

1. Criar template de email com editor rico.
2. Inserir variável pelo botão do editor.
3. Visualizar renderização.
4. Criar template WhatsApp em texto puro.
5. Fazer envio manual de teste.
6. Criar automação.
7. Validar histórico de mensagens.

## 9. Auditoria

1. Acesse `Administração > Auditoria`.
2. Filtre por usuário.
3. Filtre por ação.
4. Filtre por app/modelo.
5. Execute alguma criação/edição/exclusão e confirme novo registro.

## 10. Docker

```bash
docker compose down
docker compose build --no-cache
docker compose up
```

Em outro terminal:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f beat
```

Valide:

- `postgres` saudável;
- `redis` rodando;
- `backend` saudável;
- `frontend` saudável;
- migrations aplicadas;
- login funcionando em `http://localhost:8080`;
- API docs em `http://localhost:8000/api/docs/`.

## 11. Critério de aprovação

A entrega só deve ser aprovada se:

- `python manage.py check` não apresentar erros;
- `python manage.py makemigrations --check --dry-run` retornar `No changes detected`;
- os testes rápidos passarem;
- o frontend compilar com `npm run build`;
- não houver erros 500 nos principais fluxos;
- não houver erro no console do navegador durante login, navegação e cadastros principais.

## Homologação — Documentos, PDF e aprovação digital

- [ ] Abrir uma OS com cliente, veículo, serviços e peças.
- [ ] Acessar a aba `Documentos`.
- [ ] Gerar PDF de orçamento.
- [ ] Gerar PDF de ordem de serviço.
- [ ] Gerar PDF de recibo.
- [ ] Confirmar que os PDFs exibem dados da oficina, cliente, veículo, serviços, peças, totais e assinatura.
- [ ] Gerar link público de aprovação digital.
- [ ] Copiar o link gerado.
- [ ] Abrir o link em aba anônima ou navegador sem login.
- [ ] Confirmar que a tela pública carrega sem autenticação.
- [ ] Confirmar que a tela pública não mostra notas internas.
- [ ] Abrir o PDF pelo link público.
- [ ] Aprovar o documento informando nome e documento.
- [ ] Confirmar que o link passa a aparecer como aprovado.
- [ ] Gerar outro link e testar recusa com observação.
- [ ] Confirmar que a linha do tempo da OS registra a geração do link e a decisão do cliente.

## Homologação — Checklist técnico, WhatsApp por .env e landing pública

### Checklist técnico

- [ ] Acessar `Configurações administrativas > Operação`.
- [ ] Ativar `Usar checklist técnico obrigatório nas OS`.
- [ ] Salvar.
- [ ] Acessar `Catálogo de serviços`.
- [ ] Editar um serviço.
- [ ] Abrir aba `Checklist técnico`.
- [ ] Cadastrar item obrigatório.
- [ ] Cadastrar item que exige observação.
- [ ] Cadastrar item que exige foto.
- [ ] Criar uma OS ou abrir uma OS existente.
- [ ] Adicionar o serviço com checklist.
- [ ] Abrir aba `Execução técnica`.
- [ ] Confirmar que os itens foram copiados para a OS.
- [ ] Tentar concluir serviço com pendência obrigatória.
- [ ] Confirmar bloqueio.
- [ ] Marcar itens como concluídos.
- [ ] Adicionar observação/foto onde exigido.
- [ ] Confirmar que a conclusão passa.
- [ ] Desativar o checklist em configurações.
- [ ] Confirmar que a OS não exige mais checklist.

### Assinatura de entrega

- [ ] Acessar uma OS.
- [ ] Abrir aba `Execução técnica`.
- [ ] Clicar em `Assinar entrega`.
- [ ] Informar nome e documento.
- [ ] Desenhar assinatura.
- [ ] Salvar.
- [ ] Confirmar que a assinatura aparece na OS.
- [ ] Abrir PDF de entrega.
- [ ] Confirmar que o comprovante exibe assinatura e checklist.

### WhatsApp por .env

- [ ] Configurar variáveis `WHATSAPP_*` no `backend/.env`.
- [ ] Reiniciar backend.
- [ ] Acessar `Configurações administrativas > Canais`.
- [ ] Confirmar que WhatsApp aparece como leitura e não como formulário editável.
- [ ] Confirmar que token não aparece em texto claro.

### Landing pública

- [ ] Acessar `Configurações administrativas > Landing pública`.
- [ ] Preencher título, subtítulo, CTA e destaque.
- [ ] Salvar.
- [ ] Abrir `/` em aba anônima.
- [ ] Confirmar que a landing aparece sem login.
- [ ] Fazer login.
- [ ] Acessar `/` logado.
- [ ] Confirmar redirecionamento para o painel interno.

---

# Homologação — Fase 4 Relatórios Gerenciais

## Dashboard executivo

1. Acessar `Relatórios > Dashboard executivo`.
2. Filtrar por data inicial e final.
3. Confirmar cards de recebido, despesas, resultado líquido, ticket médio, OS abertas, aprovações pendentes e baixo estoque.
4. Confirmar listas de OS recentes e peças em baixo estoque.

## Relatório de OS

1. Acessar `Relatórios > Relatório de OS`.
2. Filtrar por período.
3. Filtrar por status.
4. Buscar por número, cliente ou placa.
5. Confirmar status, técnico, total e saldo.
6. Clicar em `Exportar CSV`.
7. Abrir o CSV no Excel ou LibreOffice.

## Relatório financeiro

1. Acessar `Relatórios > Relatório financeiro`.
2. Filtrar por período.
3. Confirmar recebido, pago, resultado, contas vencidas e saldos em aberto.
4. Confirmar listagem combinada de contas a receber e contas a pagar.
5. Exportar CSV.

## Relatório de estoque

1. Acessar `Relatórios > Relatório de estoque`.
2. Filtrar por busca de SKU, peça ou marca.
3. Filtrar somente baixo estoque.
4. Confirmar valor estimado em estoque, itens sem estoque e peças consumidas.
5. Exportar CSV.

## Permissões

1. Usuário Dono deve ver o menu `Relatórios`.
2. Usuário Administrativo deve ver o menu `Relatórios`.
3. Usuários com permissão `reports.view` devem acessar os relatórios.
4. Usuários sem permissão devem receber acesso negado.
