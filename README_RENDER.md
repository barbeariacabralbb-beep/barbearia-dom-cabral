# Deploy no Render

Este projeto deve ser publicado como serviço Python/FastAPI.

## Comandos

Build Command:

```bash
pip install -r requirements.txt && playwright install chromium
```

Start Command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Variáveis recomendadas

- `ADMIN_USER`: usuário do painel.
- `ADMIN_PASS`: senha do painel.
- `DB_PATH`: caminho do banco SQLite. Se não configurar, será usado `agenda.db` na raiz do projeto.

## Observações

- O QR Code do WhatsApp depende do Playwright/Chromium.
- Em serviços gratuitos do Render, o app pode hibernar. Quando isso acontecer, o bot pode precisar reconectar.
- A sessão do WhatsApp fica na pasta `whatsapp_session`. Em redeploy ou reset do serviço, pode ser necessário escanear o QR novamente.
