# Implementação — Dropdown de veículos sem corte e visual global mais suave

## Objetivo

Corrigir o problema em que listas de seleção, principalmente na tela de veículos/carros, ficavam presas dentro do box/modal e difíceis de usar. Também suavizar o visual global do sistema, reduzindo contraste agressivo, sombras pesadas e estados muito fortes.

## Alterações principais

### 1. Dropdown/autocomplete fora do box

Foram alterados:

- `frontend/src/components/SearchableSelect.jsx`
- `frontend/src/components/SearchAutocompleteInput.jsx`

Os menus de opções agora são renderizados com `createPortal` diretamente no `document.body`.

Isso evita que eles fiquem limitados por:

- `overflow: hidden`
- `overflow-y: auto`
- `Modal.Body`
- cards internos
- boxes de formulário
- tabelas responsivas

Também foi adicionada lógica para reposicionar o menu ao rolar ou redimensionar a tela. Quando não há espaço abaixo do campo, o menu abre para cima.

### 2. Visual global suavizado

Foi alterado:

- `frontend/src/styles.css`

Foram adicionados ajustes globais para:

- fundo mais claro e menos contrastado;
- sidebar com tom menos agressivo;
- botões primários em azul mais suave;
- cards com sombra mais leve;
- tabelas com cabeçalho mais discreto;
- campos com foco menos forte;
- abas com seleção mais suave;
- modais com sombra e borda mais elegantes;
- autocomplete com z-index alto e visual mais limpo.

## Validação

Foi executado:

```bash
cd frontend
npm run build
```

Resultado: build concluído com sucesso.

O Vite manteve apenas o aviso antigo de bundle grande, sem erro de compilação.

## Como testar

1. Acessar a tela `Veículos`.
2. Clicar em `Novo veículo` ou `Editar`.
3. Ir para a aba `FIPE e modelo`.
4. Abrir os campos `Marca FIPE`, `Modelo FIPE` e `Ano / versão FIPE`.
5. Confirmar que a lista aparece por cima do modal e não fica presa dentro do box.
6. Testar também o campo de busca da lista de veículos.
7. Navegar pelo sistema e verificar visual mais suave em cards, botões, sidebar, formulários, tabelas e modais.
