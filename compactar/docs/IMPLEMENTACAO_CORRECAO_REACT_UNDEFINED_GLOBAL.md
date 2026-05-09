# Correção global de React is not defined

## Problema

O frontend estava exibindo erros como:

```text
ReferenceError: React is not defined
```

O primeiro caso apareceu em `AuthContext.jsx` e o segundo em `ConfirmDialog.jsx`.

## Causa

Mesmo com o plugin React configurado no Vite, o ambiente local pode manter cache antigo ou transformar JSX esperando que a variável global `React` exista. Como vários arquivos `.jsx` usavam JSX sem importar explicitamente `React`, o erro poderia aparecer em sequência, página por página.

## Correção aplicada

Foi adicionada a importação explícita de `React` em todos os arquivos `.jsx` dentro de:

```text
frontend/src
```

Exemplo:

```jsx
import React, { useEffect, useState } from "react";
```

ou:

```jsx
import React from "react";
```

Também foi mantido o arquivo:

```text
frontend/vite.config.js
```

com o plugin oficial do React para Vite.

## Arquivo diretamente relacionado ao erro informado

```text
frontend/src/components/ConfirmDialog.jsx
```

Agora começa com:

```jsx
import React, { useEffect, useState } from "react";
import { Button, Modal } from "react-bootstrap";
```

## Banco de dados

Não houve alteração de banco.

Não é necessário rodar migrations por causa desta correção.

## Como validar no Windows

Na raiz do projeto:

```bash
cd frontend
```

Remova cache e dependências antigas:

```bash
rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
```

Reinstale:

```bash
npm install
```

Rode o servidor:

```bash
npm run dev
```

Se o Vite já estava aberto antes da correção, pare com `Ctrl + C` e inicie novamente.

## Validação recomendada

Abra o sistema e verifique o console do navegador.

Os erros abaixo não devem mais aparecer:

```text
AuthContext.jsx: React is not defined
ConfirmDialog.jsx: React is not defined
```
