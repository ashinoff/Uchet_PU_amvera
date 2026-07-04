# CLAUDE.md — рабочий контекст проекта «Светлячок» (Система учёта ПУ)

> Мой (Claude Code) личный конспект по репозиторию. Веду его сам: при каждом
> заметном изменении дополняю разделы и «Журнал изменений» внизу. Читаю его в
> начале сессии, чтобы сразу быть в курсе, что и как устроено. Если код и этот
> файл разошлись — правда в коде, а файл нужно поправить.

## Что это за программа

«Светлячок» — учёт приборов учёта электроэнергии (ПУ) для Россетей: движение
счётчиков между подразделениями, техприсоединение, замены, ТТР, ТЗ, заявки ЭСК,
служебки, согласования. Пользователи — сотрудники СУЭ, лаборатории, РЭС, ЭСК, ОКС.

## Архитектура (кратко)

- **Монолит из двух файлов.** Вся логика бэка — в `backend/main.py` (~5500 строк),
  весь фронт — в `frontend/src/App.jsx` (~6200 строк). Это осознанно; правки вносим
  точечно, файлы не дробим без явной просьбы.
- **Один Docker-контейнер** (переехали с Render на Amvera): `Dockerfile` собирает
  фронт (`npm run build`), кладёт `dist` в python-образ, FastAPI сам раздаёт и API,
  и статику на порту 8000. Фронт и API на одном origin → `baseURL: '/api'`.
- **БД — PostgreSQL** (на Amvera из маркетплейса). Диск контейнера эфемерный —
  ничего важного в ФС не хранить, всё в Postgres. Схема — только через
  `ensure_db_schema()` (nullable-колонки, `ADD COLUMN IF NOT EXISTS`), **alembic нет
  и не тащим**.

## Стек

- **Backend:** FastAPI, SQLAlchemy (declarative), pydantic v1 + pydantic-settings,
  python-jose[cryptography] (JWT), bcrypt, pandas + openpyxl (импорт/экспорт Excel).
  JWT-библиотека — **jose**, НЕ PyJWT.
- **Frontend:** React 18 + Vite 5, axios, tailwind. Без роутера — навигация
  состоянием (`page` в `Main()`). Иконки — свой компонент `Icon` (inline SVG).
- **Деплой:** Amvera, `amvera.yml` (environment: docker, containerPort 8000).

## Backend — карта `backend/main.py`

Порядок в файле: импорты → enum'ы → модели БД → pydantic-схемы → `app` + middleware
→ API-роуты → `ensure_db_schema()` / `init_db()` → **блок раздачи фронтенда в самом
конце** (SPA catch-all `@app.get("/{full_path:path}")` обязан быть последним, иначе
перехватит `/api/...`).

### Enum'ы (строковые, PostgreSQL native enum)
- `UnitType`: SUE, LAB, ESK, RES, ESK_UNIT, OKS, OKS_UNIT
- `RoleCode`: SUE_ADMIN, LAB_USER, ESK_ADMIN, RES_USER, ESK_USER, OKS_ADMIN, OKS_USER
- `PUStatus`: SKLAD (склад, по умолчанию), TECHPRIS, ZAMENA, IZHC, INSTALLED
- `ApprovalStatus`: NONE, PENDING, APPROVED, REJECTED

Добавление новых значений enum в проде — через `ALTER TYPE ... ADD VALUE IF NOT
EXISTS` в `ensure_db_schema()` (create_all это не покрывает для существующих типов).

### Модели БД
Unit, Role, User, PURegister, PUItem (центральная сущность, «карточка ПУ»),
PUMovement, TTR_RES, TTR_ESK, Material, TTR_Material, TTR_PUType, PUMaterial,
ESKMaster, PUTypeReference, VA_Nominal, TT_Nominal.

### Роли и права (главная бизнес-модель)
Роль **намертво связана с `unit_id`**: 7 РЭС × (УРРУ/ЭСК/ОКС). Именно поэтому роли и
подразделения живут в БД Светлячка, а не в Keycloak.
- SUE_ADMIN — видит всё, перемещает РЭС, удаляет, управляет.
- LAB_USER — загружает реестры ПУ.
- ESK_ADMIN / ESK_USER — все ЭСК / своё подразделение ЭСК.
- RES_USER — только свой РЭС; согласует (approve).
- OKS_ADMIN / OKS_USER — все участки ОКС / свой участок.
Хелперы `is_*` (около строки 360-385) и вычисляемые права во фронте (`AuthProvider`).

### Auth
- Свой JWT по логину/паролю: `POST /api/auth/login`, `create_token(user_id)`,
  `get_current_user` (Depends во всех защищённых роутах). Тестовые: admin/admin123,
  lab/lab123, energo/energo123.
- **Единый вход через платформу (Keycloak SSO)** — см. раздел ниже.
- `GET /api/health` — health-check (бывший `GET /`, переименован ради SPA).

### Группы API-роутов (~106 штук)
`/api/pu/*` (список/карточка/загрузка/перемещение/импорты/согласование),
`/api/ttr/res|esk/*`, `/api/tz/*` (техзадания), `/api/requests/*` (заявки ЭСК),
`/api/memo/*` (служебки), `/api/masters|materials|pu-types|va-nominals|tt-nominals`
(справочники), `/api/users|roles|units`, `/api/admin/*` (backup/restore/health).

## Frontend — карта `frontend/src/App.jsx`

`AuthProvider` (контекст авторизации, вверху) → страницы, переключаемые через
`page`-стейт в `Main()`. Ключевые компоненты: Sidebar, HomePage, PUListPage,
PUCardModal, UploadPage, ApprovalPage, TZPage, RequestsPage, MemoPage, SettingsPage
(вкладки: Users/Masters/TTRRes/TTREsk/Materials/PUTypes/VA/TT/System/BulkUpdate),
MoveBulkPage, AnalysisPage. `frontend/src/api.js` — axios с `baseURL: '/api'` и
интерсепторами (токен из localStorage; 401 → редирект на '/', НО не внутри iframe).

## Интеграция с платформой SUE_system (Keycloak SSO)

Полный контракт — в `PLATFORM_INTEGRATION.md`. За фиче-флагом **`PLATFORM_SSO`
(по умолчанию OFF)** — старый вход по паролю всегда остаётся как fallback.

- **`backend/keycloak_platform.py`** (импортируется как `kc`) — проверка токена
  платформы по JWKS: подпись + `iss` + `exp` + `azp == web-desktop` (aud НЕ требуем,
  т.к. public-клиент). Роль доступа `svet-user`. JWKS кэшируется. **Токен нигде не
  логируется и не сохраняется — только причины отказа.**
- **`POST /api/auth/platform`** — обмен Keycloak-токена (из заголовка Authorization)
  на свой JWT. Пользователь ищется по `keycloak_id`; при первом входе — разовая
  привязка существующей учётки по `username == preferred_username` (email у юзеров
  нет). Не нашли — 401, авто-создания нет. Нет роли `svet-user` — 403.
- **Ключевая идея:** Keycloak даёт только личность + право входа; роль и `unit_id`
  берутся из БД Светлячка. Чтобы дать доступ: в Keycloak логин + роль `svet-user`,
  в Светлячке — учётка с тем же логином и нужной ролью/подразделением.
- **CSP-middleware** `frame_ancestors_header` — разрешает встраивание в iframe
  только `PLATFORM_ORIGIN`, снимает легаси `X-Frame-Options`.
- **Фронт:** `AuthProvider` внутри iframe (`EMBEDDED = window.self !== window.top`)
  не доверяет старому токену, шлёт `{type:'app-ready'}` платформе, ждёт
  `{type:'platform-auth', token}`, меняет его через чистый `fetch` (не через `api`,
  чтобы 401-интерсептор не редиректил). `ssoPending` держит лоадер; таймаут 5с →
  обычный логин. **Контракт `platform-auth`/`app-ready` не менять.**

### Колонки для SSO (в таблице `users`)
`keycloak_id VARCHAR(64)` (unique, nullable, index), `email VARCHAR(200)` (nullable).
Добавляются в `ensure_db_schema()` через AUTOCOMMIT + `ADD COLUMN IF NOT EXISTS` +
`CREATE UNIQUE INDEX IF NOT EXISTS ix_users_keycloak_id`.

## Переменные окружения (Amvera)
`DATABASE_URL`, `SECRET_KEY` (новый при переезде — разлогинит старые сессии),
`PLATFORM_SSO=true`, `KEYCLOAK_URL`, `KEYCLOAK_REALM=platform`,
`KEYCLOAK_AZP=web-desktop`, `PLATFORM_ORIGIN=https://sue-system-ashinoff.amvera.io`,
`SVET_ACCESS_ROLE=svet-user`. Опц.: `FRONTEND_DIST` (по умолчанию `../frontend/dist`).

## Проверки перед коммитом
- Синтаксис бэка: `python -c "import ast; ast.parse(open('backend/main.py', encoding='utf-8').read())"`
  (на Windows обязательно `encoding='utf-8'` — иначе падает на cp1251).
- Сборка фронта: `cd frontend && npm install && npm run build`.
- При `PLATFORM_SSO=false` старый вход по паролю не изменился.
- grep: токен платформы нигде не логируется/не сохраняется.

## Правила / грабли
- Бизнес-логику (ПУ, ТТР, ТЗ, заявки ЭСК, служебки, согласования) без явной
  просьбы не трогать.
- Схему БД менять только через `ensure_db_schema()`, колонки nullable, Postgres-safe.
- SPA catch-all держать в самом конце `main.py`.
- Подготовительные файлы `Dockerfile`, `amvera.yml`, `.dockerignore`,
  `backend/keycloak_platform.py` — трогать только по делу.
- Bash-tool на Windows: рабочая директория сбрасывается между вызовами — использовать
  абсолютные пути (`cd /c/Windows/system32/Uchet_PU_amvera/...`).
- git push: credential helper = `store`; при 403 нужен свежий PAT со scope `repo`.

## Журнал изменений (дополняю сам)
- **2026-07-04** — Код администратора (`ADMIN_CODE`) вынесен из `Settings` в
  модульную константу (окружение не переопределяет). Проверка кода убрана из
  `create_backup` и `restore_backup` — бэкап/восстановление теперь только под
  ролью СУЭ-админа, без кода (и во фронте убраны prompt'ы). На удаляющих операциях
  (`delete`, `clear-database`) и импортах код оставлен (16 проверок `!= ADMIN_CODE`).
- **2026-07-04** — Интеграция с платформой SUE_system (Keycloak SSO) + переезд
  Render → Amvera (один Docker-контейнер). Добавлены `/api/auth/platform`,
  CSP-middleware, колонки `users.keycloak_id/email`, раздача фронта из FastAPI,
  `GET /` → `GET /api/health`, приём `platform-auth`/`app-ready` во фронте,
  мягкий 401 в iframe. README переписан под Amvera. Коммит `bd0692f`.
- **2026-07-04** — Заведён этот файл (CLAUDE.md) как рабочий контекст.
