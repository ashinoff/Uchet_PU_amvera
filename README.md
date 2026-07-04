# Система учета ПУ

**Максимально простая структура — 3 файла:**
- `backend/main.py` — весь бэкенд
- `frontend/src/App.jsx` — весь фронтенд
- `frontend/src/api.js` — API вызовы

## Структура

```
7 РЭС (Краснополянский, Адлерский, Хостинский, Сочинский, Дагомысский, Лазаревский, Туапсинский)
├── УРРУ — участок (видит только себя)
└── ЭСК — (видит только себя)

СУЭ — видит ВСЁ
Энергосервис — видит все ЭСК, перемещает ПУ
Лаборатория — загружает реестры
```

## Роли

| Роль | Видит | Может |
|------|-------|-------|
| SUE_ADMIN | Всё | Всё |
| ENERGOSERVICE_ADMIN | Все ЭСК | Перемещать ПУ |
| LAB_USER | Свои загрузки | Загружать Excel |
| URRU_USER | Свой участок | Просмотр |
| ESK_USER | Свой ЭСК | Просмотр |

## Тестовые учетки
- admin / admin123 — СУЭ
- lab / lab123 — Лаборатория  
- energo / energo123 — Энергосервис

## Деплой на Render

### 1. PostgreSQL
Создай базу, скопируй URL

### 2. Backend
- Root: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Env: `DATABASE_URL`, `SECRET_KEY`
- После деплоя в Shell: `python main.py` (инициализация БД)

### 3. Frontend
- Root: `frontend`
- Build: `npm install && npm run build`
- Publish: `dist`
- Rewrite: `/*` → `/index.html`

### Proxy для API
Создай `frontend/public/_redirects`:
```
/api/*  https://твой-backend.onrender.com/api/:splat  200
```

## Локальная разработка

```bash
# Backend
cd backend
pip install -r requirements.txt
echo "DATABASE_URL=postgresql://..." > .env
python main.py  # инит БД
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Для корректировок

Скинь в чат:
1. `main.py` — если проблема на бэке
2. `App.jsx` — если проблема на фронте
3. Описание что нужно изменить
