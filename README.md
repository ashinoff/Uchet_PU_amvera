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

## Деплой на Amvera

Приложение целиком (фронт + API) живёт в **одном Docker-контейнере**: `Dockerfile`
собирает фронт (`npm run build`) и кладёт `dist` в python-образ, а FastAPI отдаёт и
API, и статику на порту 8000. Отдельного прокси и `_redirects` больше не нужно —
фронт и API на одном origin (`baseURL: '/api'`).

Единый вход через платформу SUE_system (Keycloak) работает за фиче-флагом
`PLATFORM_SSO` (по умолчанию OFF — старый вход по логину/паролю продолжает работать).
Подробности контракта и интеграции — в [PLATFORM_INTEGRATION.md](PLATFORM_INTEGRATION.md).

### Настройка
- Создать приложение (Docker) в Amvera, привязать git-репозиторий (`amvera.yml` и
  `Dockerfile` уже в корне).
- PostgreSQL — из маркетплейса Amvera; в приложение передать внутреннюю строку.
- Переменные окружения:

```
DATABASE_URL=postgresql://...внутренняя строка Amvera Postgres...
SECRET_KEY=<длинная случайная строка>
PLATFORM_SSO=true
KEYCLOAK_URL=https://keycloak-ashinoff.amvera.io
KEYCLOAK_REALM=platform
KEYCLOAK_AZP=web-desktop
PLATFORM_ORIGIN=https://sue-system-ashinoff.amvera.io
SVET_ACCESS_ROLE=svet-user
```

- После деплоя `https://<app>.amvera.io/api/health` должен ответить `{"status":"ok"}`,
  затем корень — форма логина (fallback-вход по паролю работает).

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
