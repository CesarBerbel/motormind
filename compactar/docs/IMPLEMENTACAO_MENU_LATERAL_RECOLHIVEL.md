# Implementação — Menu lateral recolhível no padrão ChatGPT

## Objetivo

Adicionar ao layout principal um menu lateral recolhível, parecido com o comportamento do menu lateral do ChatGPT, sem remover totalmente a navegação da tela. Quando recolhido, o menu mantém uma faixa lateral estreita com botão para reabrir.

## O que foi feito

- Adicionado estado de menu recolhido/expandido no `Layout.jsx`.
- A preferência do usuário é salva em `localStorage` usando a chave `sidebar_collapsed`.
- Adicionado botão no topo do menu para recolher.
- Adicionada faixa lateral estreita quando o menu está recolhido.
- Adicionado botão no topo da barra superior para abrir/recolher o menu.
- Ajustado CSS para transição suave entre menu aberto e recolhido.
- Mantido o conteúdo principal ocupando o espaço disponível automaticamente.

## Arquivos alterados

- `frontend/src/components/Layout.jsx`
- `frontend/src/styles.css`

## Como testar

1. Subir o frontend com `npm run dev`.
2. Fazer login.
3. Clicar no botão do menu lateral.
4. Confirmar que o menu recolhe e deixa uma faixa com ícone.
5. Clicar novamente para reabrir.
6. Atualizar a página e confirmar que a preferência foi mantida.

## Banco de dados

Não houve alteração no banco de dados.

Não é necessário criar ou aplicar migrations para esta alteração.
