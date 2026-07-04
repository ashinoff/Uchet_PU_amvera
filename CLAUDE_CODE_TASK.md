# Задание для Claude Code — репозиторий Uchet_PU_amvera

Ты работаешь в репозитории приложения «Система учёта ПУ» («Светлячок»):
FastAPI-монолит `backend/main.py` + React/Vite-монолит `frontend/src/App.jsx`
(`frontend/src/api.js` — axios с `baseURL: '/api'`).

Подготовительные файлы уже в репозитории и МЕНЯТЬ ИХ НЕ НУЖНО:
`Dockerfile`, `amvera.yml`, `.dockerignore`, `backend/keycloak_platform.py`.
Полный контекст, контракт с платформой и готовые куски кода — в файле
`PLATFORM_INTEGRATION.md` в корне репозитория. ПРОЧИТАЙ ЕГО ПЕРВЫМ, затем
выполни разделы 3 и 4 (патчи backend и frontend). Ниже — уточнения и
отличия от плейбука, они имеют приоритет.

## Уточнения (приоритет над PLATFORM_INTEGRATION.md)

1. **JWT-библиотека.** Проект использует python-jose (`from jose import jwt`),
   НЕ PyJWT. `backend/keycloak_platform.py` уже переписан под jose — новых
   зависимостей добавлять НЕ нужно. Строку `cryptography` в requirements.txt
   НЕ добавляй (jose[cryptography] уже там). Пункт про PyJWT в плейбуке —
   устаревший, игнорируй.

2. **Импорт `Request`.** В `backend/main.py` его нет в импортах из fastapi —
   добавь (нужен эндпоинту `/api/auth/platform`).

3. **Порядок в main.py.** Файл — монолит ~3000+ строк. Правки вноси точечно:
   - импорты (`os`, `Request`, `StaticFiles`, `FileResponse`,
     `import keycloak_platform as kc`) — в шапку;
   - CSP-middleware — сразу после `app.add_middleware(CORSMiddleware, ...)`;
   - колонки `keycloak_id`, `email` — в модель `User`; ALTER'ы — в
     `ensure_db_schema()` тем же стилем, что существующие миграции там
     (AUTOCOMMIT, IF NOT EXISTS);
   - `@app.get("/")` (JSON-статус) переименуй в `@app.get("/api/health")`;
   - эндпоинт `/api/auth/platform` — рядом с `/api/auth/login`;
   - блок раздачи фронтенда (mount /assets + SPA catch-all) — В САМЫЙ КОНЕЦ
     файла, ПОСЛЕ всех API-роутов, иначе catch-all перехватит API.

4. **Фронтенд.** В `AuthProvider` (начало `App.jsx`) добавь приём
   `platform-auth` + пинг `app-ready` по коду из плейбука (раздел 4.1).
   Не забудь: `ssoPending` добавить в value контекста, а в `Main()` условие
   загрузки заменить на `if (loading || ssoPending)`. В `api.js` — редирект
   на '/' при 401 только когда `window.self === window.top` (раздел 4.2).

5. **Удали** `frontend/public/_redirects`, если существует (прокси Render,
   больше не нужен).

6. **README.md** обнови: раздел «Деплой на Render» замени кратким разделом
   про Amvera (один Docker-контейнер, переменные окружения из раздела 6
   плейбука) и ссылкой на PLATFORM_INTEGRATION.md.

## Проверки перед завершением

- `python -c "import ast; ast.parse(open('backend/main.py').read())"` — синтаксис.
- `cd frontend && npm install && npm run build` — фронт собирается.
- Убедись, что при `PLATFORM_SSO=false` (по умолчанию) поведение старого
  входа по логину/паролю не изменилось.
- grep-проверь: в коде нигде не логируется и не сохраняется сам токен
  платформы (только причины отказа).

## Ограничения

- Бизнес-логику (ПУ, ТТР, ТЗ, заявки ЭСК, служебки, согласования) не трогать.
- Контракт `platform-auth` / `app-ready` не менять.
- Alembic не добавлять — схема только через `ensure_db_schema()`,
  новые колонки nullable и Postgres-safe.
- Минимально-инвазивные правки в стиле существующего кода.

В конце выдай список изменённых файлов с кратким описанием правок в каждом.
