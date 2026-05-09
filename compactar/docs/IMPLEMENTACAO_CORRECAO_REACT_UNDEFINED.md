# Correção: React is not defined no AuthContext

## Problema

O frontend apresentou o erro:

```text
AuthContext.jsx:83 Uncaught ReferenceError: React is not defined
```

Isso ocorreu porque o projeto estava sem `vite.config.js` configurando oficialmente o plugin React do Vite. Sem essa configuração, o JSX pode ser transformado no modo clássico, gerando chamadas para `React.createElement`. Nesse modo, cada arquivo com JSX precisa ter `React` importado no escopo.

## Correção aplicada

1. Criado `frontend/vite.config.js` com `@vitejs/plugin-react`.
2. Ajustado `frontend/src/auth/AuthContext.jsx` para importar `React` explicitamente, protegendo o componente mesmo em transformações clássicas de JSX.

## Arquivos alterados

- `frontend/vite.config.js`
- `frontend/src/auth/AuthContext.jsx`

## Como aplicar no Windows

Na raiz do projeto:

```bash
cd frontend
npm install
npm run dev
```

Se o servidor Vite já estiver aberto, pare com `Ctrl + C` e inicie novamente:

```bash
npm run dev
```

## Como validar

1. Abra o sistema no navegador.
2. Faça login.
3. Confirme que o erro `React is not defined` não aparece mais no console.
4. Acesse telas protegidas como Fornecedores, Contas a pagar e OS.
