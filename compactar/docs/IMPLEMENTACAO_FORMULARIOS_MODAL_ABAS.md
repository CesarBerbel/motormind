# Implementação — formulários em janela flutuante e salvar somente na última aba

## Objetivo

Padronizar o comportamento de cadastros e edições do sistema para que sejam executados em uma janela flutuante/modal e para que, nos formulários com abas, o botão de salvar fique disponível somente na última etapa.

## O que foi alterado

- Criado o componente `frontend/src/components/TabbedFormFooter.jsx`.
- Adicionado estilo de janela flutuante em `frontend/src/styles.css`.
- Criado wrapper de rota flutuante em `frontend/src/App.jsx` para formulários que antes abriam como página cheia.
- Ajustados formulários com abas para exibirem navegação `Anterior`, `Próximo` e `Salvar` apenas na última aba.
- Ajustados salvamentos dos formulários de rota para retornar à lista após salvar.

## Telas cobertas

- Clientes / contatos
- Usuários
- Veículos
- Categorias
- Peças
- Serviços
- Combos / pacotes
- Fornecedores
- Pedidos de compra
- Contas a pagar
- Contas a receber
- Ordem de serviço
- Templates
- Automações
- Orçamentos
- Vendas avulsas
- Regras de notificação

## Comportamento esperado

1. O usuário entra na lista.
2. Clica em novo ou editar.
3. O cadastro abre em janela flutuante.
4. Se o formulário tem abas, aparecem os botões de navegação entre etapas.
5. O botão `Salvar` só aparece na última aba.
6. Após salvar com sucesso, o sistema fecha a janela ou volta para a lista correspondente.

## Banco de dados

Não houve alteração no banco de dados.

Não é necessário criar migrations para esta implementação.

## Validação

Foi executado:

```bash
cd frontend
npm install
npm run build
```

Resultado: build concluído com sucesso.

O backend não foi alterado nesta implementação. A validação de backend não foi executada no sandbox porque as dependências Python não estavam instaladas nesse ambiente extraído.
