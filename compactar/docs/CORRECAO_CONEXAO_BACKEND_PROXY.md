# Correção de conexão com o backend

## Problema

O frontend exibia:

```text
Não foi possível conectar ao backend. Verifique se o servidor está rodando.
```

Essa mensagem aparece quando o navegador não recebe resposta HTTP do Django. A causa mais comum é o frontend tentar chamar diretamente `http://localhost:8000/api` em vez de usar uma rota relativa estável.

## Correção aplicada

- `frontend/src/api/client.js` agora usa `/api` como URL padrão da API.
- `frontend/vite.config.js` agora encaminha `/api` e `/media` para `http://localhost:8000` durante desenvolvimento.
- `frontend/nginx.conf` agora encaminha `/api/` e `/media/` para o container `backend` quando usar Docker.
- `docker-compose.yml` agora define `FRONTEND_BASE_URL=http://localhost:8080` para links públicos em Docker.

## Como testar localmente

Backend:

```bash
cd backend
.venv\Scripts\activate
python manage.py migrate
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Acesse:

```text
http://localhost:5173
```

Teste o proxy do Vite:

```bash
curl http://localhost:5173/api/health/
```

## Como testar com Docker

```bash
docker compose down
docker compose build --no-cache
docker compose up
```

Acesse:

```text
http://localhost:8080
```

Teste o proxy do Nginx:

```bash
curl http://localhost:8080/api/health/
```
