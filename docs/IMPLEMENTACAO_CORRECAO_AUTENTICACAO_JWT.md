# Correção de autenticação JWT no frontend

## Problema

O sistema podia exibir a mensagem:

```text
As credenciais de autenticação não foram fornecidas.
```

Isso acontece quando uma chamada protegida ao backend chega sem o header:

```http
Authorization: Bearer <access_token>
```

O frontend já salvava `access_token` e `refresh_token`, mas o interceptor removia os tokens no primeiro erro 401. Assim, se o access token expirasse, se a página fosse recarregada ou se houvesse uma chamada concorrente, a sessão podia ser encerrada antes de tentar renovar o token.

## Solução implementada

Foram ajustados:

- `frontend/src/api/client.js`
- `frontend/src/auth/AuthContext.jsx`

Agora o frontend:

1. Adiciona o token JWT automaticamente em todas as rotas protegidas.
2. Ignora autenticação apenas em rotas públicas, como `/token/`, `/token/refresh/` e `/password-setup/confirm/`.
3. Ao receber 401, tenta renovar o access token usando o refresh token.
4. Reexecuta a requisição original após renovar o token.
5. Evita múltiplas renovações simultâneas usando uma promessa compartilhada.
6. Só limpa a sessão quando o refresh token também falha ou não existe.
7. Dispara evento global para atualizar o estado do AuthContext.
8. Mostra mensagem amigável no frontend quando a sessão realmente expira.

## Banco de dados

Não há alteração de banco de dados.

Não é necessário criar migration.
