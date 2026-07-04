# «Светлячок» → Amvera + платформа SUE_system (единый вход через Keycloak)

> **Для кого этот файл.** Контекст для Claude Code, работающего **в репозитории программы «Система учёта ПУ» («Светлячок»)**, либо пошаговая инструкция для ручного применения. Образец рабочей интеграции — репозиторий `siz-control` (файлы `PLATFORM_SSO_INTEGRATION.md`, `backend/app/services/keycloak.py`, `frontend/src/context/AuthContext.jsx`) — паттерн там уже проверен в бою, здесь он адаптирован под монолит Светлячка.
>
> **Работать за фиче-флагом `PLATFORM_SSO` (по умолчанию OFF).** Старый вход по логину/паролю продолжает работать — это страховка на время переезда.

---

## 0. Что уже есть (фундамент, не трогать)

| Что | Значение |
|---|---|
| Keycloak | `https://keycloak-ashinoff.amvera.io`, realm `platform`, public-клиент `web-desktop` |
| Issuer | `https://keycloak-ashinoff.amvera.io/realms/platform` |
| JWKS | `https://keycloak-ashinoff.amvera.io/realms/platform/protocol/openid-connect/certs` |
| Платформа (оболочка) | `https://sue-system-ashinoff.amvera.io` (репо `SUE_system`) |
| Контракт токена | Оболочка постит в iframe `{ type: 'platform-auth', token: '<JWT>' }`; повторно шлёт по пингу `{ type: 'app-ready' }` от приложения (AppFrame.jsx уже понимает `app-ready`) |
| Проверка токена | подпись по JWKS + `iss` + `exp` + `azp === web-desktop` (aud НЕ требовать) |
| Эталон | siz-control уже так работает на Amvera (один Docker-контейнер: node собирает фронт → python отдаёт API и статику) |

Текущее устройство Светлячка: FastAPI-монолит `backend/main.py` (PyJWT + bcrypt, свой JWT по логину/паролю), фронт `frontend/src/App.jsx` (React+Vite, axios с `baseURL: '/api'`). На Render — два сервиса + прокси `_redirects`. Роли: `SUE_ADMIN, LAB_USER, ESK_ADMIN, RES_USER, ESK_USER, OKS_ADMIN, OKS_USER`; роль и подразделение (`unit_id`) хранятся в своей БД. **У пользователей нет email.**

## 1. Ключевое архитектурное решение

**Keycloak даёт только личность и право доступа, а внутренняя роль и подразделение остаются в БД Светлячка.**

Причина: роли Светлячка намертво связаны с `unit_id` (7 РЭС × УРРУ/ЭСК/ОКС) — тащить эту таксономию в Keycloak атрибутами и мапперами сложно и хрупко. Вместо этого:

- В Keycloak заводится **одна** realm-роль `svet-user` — «пускать в приложение».
- Пользователь опознаётся по `keycloak_id` (= `sub` из токена). Первый вход — разовая привязка по **`username == preferred_username`** (email у пользователей Светлячка нет). Не нашли — отказ, молча никого не создаём.
- После привязки роль/подразделение берутся из своей таблицы `users`, как и раньше. Админка пользователей в приложении продолжает работать без изменений.

Итог: чтобы дать человеку доступ — в Keycloak его логин + роль `svet-user`, в Светлячке — учётка с тем же логином, нужной ролью и подразделением (как и сейчас).

---

## 2. Файлы, которые кладутся как есть (в этом пакете)

- `Dockerfile` — в корень репозитория (multi-stage: сборка фронта → python-образ, отдаёт всё на :8000)
- `amvera.yml` — в корень (docker-окружение, containerPort 8000)
- `.dockerignore` — в корень
- `backend/keycloak_platform.py` — модуль проверки токена платформы (PyJWT + JWKS, кэш ключей)

В `backend/requirements.txt` добавить строку:

```
cryptography
```

(PyJWT уже есть; cryptography нужна для проверки RS256-подписи по JWKS.)

---

## 3. Патчи `backend/main.py`

### 3.1. Импорты и раздача статики (переезд в один контейнер)

Фронт больше не отдельный сервис — его собранный `dist` кладётся в образ, и FastAPI раздаёт его сам. `baseURL: '/api'` во фронте при этом менять НЕ нужно (тот же origin).

Вверху файла:

```python
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import keycloak_platform as kc
```

Существующий корневой роут `@app.get("/")` (возвращает JSON `{"status": "ok"}`) **переименовать** в health-check, чтобы не перекрывал SPA:

```python
@app.get("/api/health")
def health():
    return {"status": "ok", "message": "Система учета ПУ v2"}
```

В САМЫЙ КОНЕЦ файла (после всех API-роутов, до блока `if __name__ == "__main__"` если он есть):

```python
# ==================== РАЗДАЧА ФРОНТЕНДА (один контейнер) ====================
FRONTEND_DIST = os.getenv("FRONTEND_DIST", os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
FRONTEND_DIST = os.path.abspath(FRONTEND_DIST)

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Любой не-API путь -> файл из dist, иначе index.html (SPA-роутинг)
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
```

Catch-all объявлен последним, поэтому все `/api/...` роуты продолжают матчиться раньше него.

### 3.2. Разрешить встраивание в iframe платформы (CSP)

Сразу после `app.add_middleware(CORSMiddleware, ...)`:

```python
@app.middleware("http")
async def frame_ancestors_header(request, call_next):
    """Разрешаем ТОЛЬКО платформе встраивать приложение в iframe.
    Заголовок ставится на каждый ответ (включая index.html и статику).
    Легаси X-Frame-Options убираем — frame-ancestors его заменяет."""
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        f"frame-ancestors 'self' {kc.PLATFORM_ORIGIN}"
    )
    if "x-frame-options" in response.headers:
        del response.headers["X-Frame-Options"]
    return response
```

### 3.3. БД: колонки `keycloak_id` и `email` у пользователя

В модель `User` добавить:

```python
    keycloak_id = Column(String(64), unique=True, nullable=True, index=True)
    email = Column(String(200), nullable=True)
```

И в `ensure_db_schema()` — в секцию добавления колонок (тем же способом, каким там добавляются остальные, через `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`):

```python
        with engine.connect() as conn:
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS keycloak_id VARCHAR(64)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_keycloak_id ON users (keycloak_id)"))
```

Колонки nullable — старые записи не ломаются, alembic не нужен (его в проекте и нет).

### 3.4. Эндпоинт обмена токена платформы на свою сессию

Access-токены Keycloak короткоживущие (~5 мин), а постятся в iframe разово. Поэтому Светлячок, как и СИЗ, обменивает их на **свой** JWT (уже есть `create_token`) и дальше живёт на нём. Рядом с `@app.post("/api/auth/login", ...)`:

```python
@app.post("/api/auth/platform", response_model=TokenResp)
def platform_login(request: Request, db: Session = Depends(get_db)):
    """Единый вход: обмен Keycloak-токена платформы на сессию Светлячка.

    Проверяем токен по JWKS (подпись/iss/exp/azp), требуем realm-роль
    svet-user, находим локального пользователя по keycloak_id, при первом
    входе разово привязываем по username == preferred_username.
    Роль и подразделение берутся из своей БД. Токен не логируем.
    """
    unauthorized = HTTPException(401, "Не удалось проверить токен платформы")
    if not kc.PLATFORM_SSO:
        raise unauthorized

    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        raise unauthorized
    token = header.split(" ", 1)[1].strip()

    try:
        claims = kc.verify_token(token)
    except kc.TokenError as exc:
        print(f"Platform SSO 401: {exc}")  # причина — да, токен — никогда
        raise unauthorized

    ident = kc.identity_from_claims(claims)
    if not ident["keycloak_id"]:
        raise unauthorized
    if not kc.has_svet_access(ident["roles"]):
        raise HTTPException(403, "Нет доступа к приложению")

    user = db.query(User).filter(User.keycloak_id == ident["keycloak_id"]).first()
    if user is None and ident["username"]:
        # Первый вход: разовая привязка существующей учётки по логину
        user = db.query(User).filter(User.username == ident["username"]).first()
        if user is not None and not user.keycloak_id:
            user.keycloak_id = ident["keycloak_id"]
            if ident["email"] and not user.email:
                user.email = ident["email"]
            db.commit()
            print(f"Platform SSO: привязан пользователь id={user.id}")

    if user is None:
        print("Platform SSO 401: пользователь не найден ни по keycloak_id, ни по username")
        raise unauthorized
    if not user.is_active:
        raise HTTPException(403, "Учетная запись заблокирована")

    return {"access_token": create_token(user.id)}
```

`Request` импортировать из fastapi, если ещё не импортирован. Все остальные эндпоинты не трогаем — они работают на своём JWT через `get_current_user`, как и раньше.

---

## 4. Патчи фронтенда

### 4.1. `frontend/src/App.jsx` — приём токена от платформы

В `AuthProvider` (в начале файла) добавить приём `platform-auth` и пинг готовности `app-ready` (оболочка отвечает на него токеном — это закрывает гонку, когда onLoad iframe сработал раньше, чем повешен слушатель):

```jsx
// Origin платформы, встраивающей приложение в iframe (единый вход)
const PLATFORM_ORIGIN = import.meta.env.VITE_PLATFORM_ORIGIN || 'https://sue-system-ashinoff.amvera.io'
// Мы внутри iframe (то есть, вероятно, внутри платформы)?
const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Пока ждём/обмениваем токен платформы — показываем загрузку, а не форму логина
  const [ssoPending, setSsoPending] = useState(EMBEDDED)

  useEffect(() => {
    // Внутри iframe не доверяем старой сессии из localStorage — ждём свежий
    // токен платформы (иначе мигнёт предыдущий пользователь)
    if (EMBEDDED) {
      localStorage.removeItem('token')
      setLoading(false)
      return
    }
    if (localStorage.getItem('token')) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else setLoading(false)
  }, [])

  // Обмен Keycloak-токена платформы на свою сессию.
  // Идём НЕ через api (его 401-интерсептор редиректит на '/'), а чистым fetch.
  const exchangePlatformToken = async (kcToken) => {
    setSsoPending(true)
    try {
      const resp = await fetch('/api/auth/platform', {
        method: 'POST',
        headers: { Authorization: `Bearer ${kcToken}` },
      })
      if (!resp.ok) throw new Error('sso failed')
      const data = await resp.json()
      localStorage.setItem('token', data.access_token)
      const me = await api.get('/auth/me')
      setUser(me.data)
    } catch {
      localStorage.removeItem('token')
      setUser(null) // упадём на обычную форму логина
    } finally {
      setSsoPending(false)
    }
  }

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== PLATFORM_ORIGIN) return // доверяем только платформе
      const d = event.data
      if (!d || d.type !== 'platform-auth' || !d.token) return
      exchangePlatformToken(d.token)
    }
    window.addEventListener('message', onMessage)
    // Сообщаем платформе, что готовы принять токен (AppFrame отвечает на app-ready)
    if (EMBEDDED) window.parent.postMessage({ type: 'app-ready' }, PLATFORM_ORIGIN)
    // Если встроены, но токен так и не пришёл — через 5с показываем обычный логин
    const timer = EMBEDDED ? setTimeout(() => setSsoPending(false), 5000) : null
    return () => { window.removeEventListener('message', onMessage); if (timer) clearTimeout(timer) }
  }, [])

  // ... login/logout и вычисляемые права — БЕЗ ИЗМЕНЕНИЙ ...
```

В value контекста добавить `ssoPending`, а в `Main()`:

```jsx
if (loading || ssoPending) return <div className="min-h-screen flex items-center justify-center"><RossetiLoader /></div>
if (!user) return <LoginPage />
```

`ssoPending` достать из `useAuth()` рядом с `loading`.

### 4.2. `frontend/src/api.js` — не зациклить 401 в iframe

Интерсептор сейчас на 401 делает `window.location.href = '/'`. Внутри iframe это перезагрузит приложение и потеряет токен. Смягчить:

```js
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('token')
    if (window.self === window.top) window.location.href = '/'
    // во фрейме просто отдаём ошибку — AuthProvider покажет логин/дождётся токена
  }
  return Promise.reject(err)
})
```

`baseURL: '/api'` оставить как есть — в одном контейнере фронт и API на одном origin. Файл `frontend/public/_redirects` (прокси Render) больше не нужен — удалить.

---

## 5. Перенос базы данных Render → Amvera

1. **Создать PostgreSQL на Amvera** (маркетплейс, как делали для Keycloak). Записать: внутреннюю строку подключения (для приложения) и внешнюю (для заливки дампа; внешний доступ включить в настройках сервиса на время миграции).

2. **Снять дамп с Render** (External Database URL из панели Render):

```bash
pg_dump "postgresql://user:pass@host.render.com/dbname" \
  --no-owner --no-privileges -Fc -f svetlyachok.dump
```

3. **Залить в Amvera** (внешняя строка подключения):

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "postgresql://user:pass@amvera-host/dbname" svetlyachok.dump
```

4. **Проверить**: `psql ... -c "select count(*) from pu_items; select count(*) from users;"` — сравнить с Render.

5. Версии клиента и сервера: `pg_dump` должен быть НЕ старше сервера Render (`pg_dump --version`). При несовпадении — поставить нужную версию postgresql-client.

6. После проверки прод-работы на Amvera внешний доступ к БД можно выключить, Render — остановить (не удалять пару недель, это резерв).

⚠️ Диск контейнера на Amvera эфемерный (см. грабли siz-control) — ничего важного в файловой системе приложения не хранить, всё в Postgres.

## 6. Настройка проекта приложения в Amvera

- Создать приложение (Docker), привязать git-репозиторий. `amvera.yml` и `Dockerfile` уже в корне.
- Переменные окружения:

```
DATABASE_URL=postgresql://...внутренняя строка Amvera Postgres...
SECRET_KEY=<длинная случайная строка — НОВАЯ, не с Render>
PLATFORM_SSO=true
KEYCLOAK_URL=https://keycloak-ashinoff.amvera.io
KEYCLOAK_REALM=platform
KEYCLOAK_AZP=web-desktop
PLATFORM_ORIGIN=https://sue-system-ashinoff.amvera.io
SVET_ACCESS_ROLE=svet-user
```

⚠️ Новый `SECRET_KEY` разлогинит все старые сессии — это нормально и даже желательно при переезде.

- После первого деплоя открыть `https://<app>.amvera.io/api/health` — должен ответить `{"status":"ok"}`, затем корень — должна открыться форма логина, старый вход по паролю работает (данные уже перенесены).

## 7. Настройка Keycloak

1. Realm `platform` → Roles → создать realm-роль **`svet-user`**.
2. Пользователям, которым нужен Светлячок, назначить `svet-user`. **Логин в Keycloak (username) должен совпадать с логином в Светлячке** — по нему происходит разовая привязка при первом входе.
3. Больше ничего: мапперы/атрибуты не нужны, роль и подразделение живут в БД приложения.

## 8. Подключение к платформе (репозиторий SUE_system)

1. `src/config/apps.js` — добавить в `APPS` (иконку взять из lucide, например `Zap` — фирменная «молния» Светлячка):

```js
import { ShieldCheck, Boxes, BarChart3, Zap } from 'lucide-react'
// ...
  {
    id: 'svet',
    name: 'Светлячок',
    icon: Zap,
    url: import.meta.env.VITE_APP_SVET_URL || 'about:blank',
    roles: ['svet-user', 'admin'],
    window: { width: 1200, height: 760 },
  },
```

2. `.env.production` платформы:

```
VITE_APP_SVET_URL=https://<app>.amvera.io
```

Именно **корень**, не `/login`. Пересобрать платформу (VITE_* вшиваются на этапе сборки).

3. Проверка: вход в платформу → иконка «Светлячок» → приложение открывается в окне **уже залогиненным** под тем же пользователем.

---

## 9. Критерии готовности

- [ ] Приложение целиком (фронт+API) живёт в одном контейнере на Amvera, `/api/health` отвечает.
- [ ] Данные в Amvera Postgres совпадают с Render (счётчики строк ключевых таблиц).
- [ ] Прямое открытие URL приложения → обычный логин по паролю работает (fallback).
- [ ] Открытие из платформы → автологин без ввода пароля; предыдущий пользователь не «мигает».
- [ ] Токен без роли `svet-user` → 403; протухший/чужой токен → 401; причины в логах, сам токен — никогда.
- [ ] Пользователь без учётки в Светлячке (даже с ролью svet-user) → отказ, авто-создания нет.
- [ ] При `PLATFORM_SSO=false` всё работает по-старому.
- [ ] Приложение открывается во фрейме платформы (CSP frame-ancestors), с чужого сайта во фрейм не встраивается.

## 10. Чего НЕ делать

- Не ломать вход по логину/паролю (это fallback и страховка).
- Не трогать бизнес-логику (ПУ, ТТР, ТЗ, заявки ЭСК, служебки, согласования).
- Не логировать и не хранить токены платформы.
- Не менять контракт `platform-auth` / `app-ready` — на него завязана оболочка.
- Схему БД менять только через `ensure_db_schema()` (nullable-колонки, Postgres-safe), alembic в проект не тащить.
