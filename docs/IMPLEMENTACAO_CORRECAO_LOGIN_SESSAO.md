# Correção do aviso de sessão expirada durante o login

## Problema

Ao tentar fazer login, o frontend exibia a mensagem:

```text
Sua sessão expirou ou o login não foi identificado. Entre novamente para continuar.
```

Essa mensagem era inadequada para a tela de login, porque uma resposta `401` do endpoint `/api/token/` normalmente significa usuário ou senha inválidos, não sessão expirada.

## Causa

O helper `apiError()` tratava qualquer status `401` como sessão expirada, inclusive quando a requisição era o próprio login.

Além disso, o `AuthContext` não limpava tokens antigos antes de iniciar um novo login, o que podia deixar o fluxo visual confuso quando havia credenciais antigas no `localStorage`.

## Arquivos alterados

- `frontend/src/api/client.js`
- `frontend/src/auth/AuthContext.jsx`

## Correções aplicadas

1. O endpoint `/token/` passou a ter tratamento específico no `apiError()`.
2. Erro de login agora mostra mensagem de usuário/senha inválidos.
3. O login limpa tokens antigos silenciosamente antes de autenticar.
4. A validação inicial de sessão não dispara aviso visual de sessão expirada na tela de login.
5. Se o token for emitido, mas `/me/` falhar, o sistema mostra mensagem própria de falha ao carregar usuário.

## Como testar

1. Limpe o localStorage no navegador.
2. Abra `/login`.
3. Digite uma senha errada.
4. Confirme que aparece mensagem de usuário/senha inválidos.
5. Digite uma senha correta.
6. Confirme que o sistema entra normalmente.
