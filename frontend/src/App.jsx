import { useState, useEffect, createContext, useContext, Fragment, useRef } from 'react'
import api from './api'

// ==================== КОНТЕКСТ АВТОРИЗАЦИИ ====================

const AuthContext = createContext(null)

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
        .catch(err => {
          console.error('Auth error:', err)
          localStorage.removeItem('token')
        })
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

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password })
    localStorage.setItem('token', r.data.access_token)
    const me = await api.get('/auth/me')
    setUser(me.data)
  }

  const logout = () => { localStorage.removeItem('token'); setUser(null) }

  const isSueAdmin = user?.role_code === 'SUE_ADMIN'
  const isLabUser = user?.role_code === 'LAB_USER'
  const isEskAdmin = user?.role_code === 'ESK_ADMIN'
  const isResUser = user?.role_code === 'RES_USER'
  const isEskUser = user?.role_code === 'ESK_USER'
  const isOksAdmin = user?.role_code === 'OKS_ADMIN'
  const isOksUser = user?.role_code === 'OKS_USER'
  
  const canUpload = isLabUser
  const canMove = isSueAdmin || isEskAdmin || isOksAdmin
  const canDelete = isSueAdmin
  const canManageUsers = isSueAdmin
  const canApprove = isResUser || isSueAdmin
  const canCreateTZ = isSueAdmin
  const canManageReferences = isSueAdmin
  const canManageMasters = isEskAdmin

  return <AuthContext.Provider value={{
    user, loading, ssoPending, login, logout,
    isSueAdmin, isLabUser, isEskAdmin, isResUser, isEskUser, isOksAdmin, isOksUser,
    canUpload, canMove, canDelete, canManageUsers, canApprove, canCreateTZ, canManageReferences, canManageMasters
  }}>{children}</AuthContext.Provider>
}

// Анимация «полусгоревшей лампочки» для названия «Светлячок»
function FlickerStyle() {
  return (
    <style>{`
      @keyframes svetFlicker {
        0%, 14%   { opacity: 1; }
        15%       { opacity: .22; }
        16%       { opacity: 1; }
        17%       { opacity: .3; }
        18%       { opacity: 1; }
        19%       { opacity: .2; }
        20%, 52%  { opacity: 1; }
        53%       { opacity: .25; }
        54%       { opacity: 1; }
        55%       { opacity: .3; }
        56%       { opacity: 1; }
        58%       { opacity: .12; }
        60%, 66%  { opacity: .05; }
        67%       { opacity: .55; }
        68%       { opacity: .12; }
        70%, 100% { opacity: 1; }
      }
      .svetlyachok {
        color: #ffffff;
        text-shadow: 0 0 4px rgba(255,255,255,.95), 0 0 10px rgba(255,255,255,.7), 0 0 18px rgba(191,219,254,.6), 0 0 30px rgba(147,197,253,.4);
        animation: svetFlicker 5.5s infinite both; will-change: opacity;
      }
      .svetlyachok-light {
        color: #0B4DA2;
        text-shadow: 0 0 4px rgba(37,99,235,.45), 0 0 10px rgba(37,99,235,.3), 0 0 16px rgba(59,130,246,.25);
        animation: svetFlicker 5.5s infinite both; will-change: opacity;
      }
      @media (prefers-reduced-motion: reduce) { .svetlyachok, .svetlyachok-light { animation: none; } }
    `}</style>
  )
}

const useAuth = () => useContext(AuthContext)

// ==================== ДИЗАЙН-СИСТЕМА ====================
// Палитра: белый фон, фирменный синий РОССЕТИ, нейтральный slate, семантика.
const BRAND = '#0B4DA2'        // основной синий
const BRAND_DARK = '#08376f'   // ховер/нажатие

// Единые стили кнопок (используются по всему интерфейсу)
const btn = {
  primary: "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0B4DA2] text-white text-sm font-medium shadow-sm hover:bg-[#093f86] active:bg-[#08376f] disabled:opacity-50 disabled:pointer-events-none transition-colors",
  secondary: "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-700 text-sm font-medium border border-slate-200 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors",
  success: "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors",
  danger: "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium shadow-sm hover:bg-rose-700 disabled:opacity-50 transition-colors",
  ghost: "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors",
}

// Набор SVG-иконок (тонкая линия, наследует currentColor). Заменяют эмодзи.
function Icon({ name, className = "w-5 h-5", strokeWidth = 1.8 }) {
  const p = {
    home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>,
    package: <><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></>,
    upload: <><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/></>,
    download: <><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/></>,
    warehouse: <><path d="M3 21V8l9-4 9 4v13"/><path d="M3 21h18"/><path d="M7 21v-7h10v7"/></>,
    check: <path d="m5 12 5 5 9-10"/>,
    checkCircle: <><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8 10h8M8 14h8M8 18h5"/></>,
    chart: <><path d="M4 20V4M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></>,
    fileText: <><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8 13h8M8 17h6"/></>,
    fileEdit: <><path d="M6 3h7l4 4v5"/><path d="M5 4a1 1 0 0 1 1-1m11 18H6a1 1 0 0 1-1-1V4"/><path d="M13 3v4h4"/><path d="m16 19 4-4-2-2-4 4v2z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.6-1.2-1.8-3.1-1.9.8a7.6 7.6 0 0 0-2.6-1.5L13.5 2.5h-3l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-1.9-.8L3.9 8.3l1.6 1.2a7.6 7.6 0 0 0 0 3l-1.6 1.2 1.8 3.1 1.9-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h3l.3-2a7.6 7.6 0 0 0 2.6-1.5l1.9.8 1.8-3.1z"/></>,
    logout: <><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M15 12H9"/><path d="m13 8 4 4-4 4"/></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
    zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z"/>,
    building: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/></>,
    crane: <><path d="M5 21V5l9 3"/><path d="M5 5h13"/><path d="M14 5v3"/><path d="M14 8v3"/><path d="M3 21h7"/><path d="M14 11h3v3a2 2 0 0 1-4 0"/></>,
    wrench: <path d="M15 4a4 4 0 0 0-5 5L4 15l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>,
    plug: <><path d="M9 3v5M15 3v5"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    trash: <><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/></>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-4l-2 2"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 4l2-2"/><path d="M20 19v-4h-4"/></>,
    x: <path d="M6 6l12 12M18 6 6 18"/>,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6"/>,
    arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6"/>,
    send: <path d="M4 12 20 4l-6 16-3-7z"/>,
    unlock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></>,
    tag: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/></>,
    ruble: <><path d="M8 21V4h5a4 4 0 0 1 0 8H6"/><path d="M6 16h6"/></>,
    bulb: <><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0 0 12 3z"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6a3 3 0 0 1 0 5"/><path d="M17 14a6 6 0 0 1 4 6"/></>,
    hardhat: <><path d="M4 17a8 8 0 0 1 16 0"/><path d="M3 17h18v2H3z"/><path d="M10 9V6h4v3"/></>,
    ban: <><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,
    alert: <><path d="M12 4 2 20h20z"/><path d="M12 10v5M12 18h.01"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    ruler: <><rect x="3" y="8" width="18" height="8" rx="1" transform="rotate(0 12 12)"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/></>,
    save: <><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7"/><rect x="8" y="13" width="8" height="6"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      {p[name] || null}
    </svg>
  )
}

// Логотип-марка РОССЕТИ (молния в скруглённом квадрате)
function BrandMark({ className = "w-9 h-9" }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-xl bg-[#0B4DA2] text-white ${className}`}>
      <Icon name="zap" className="w-1/2 h-1/2" strokeWidth={2} />
    </span>
  )
}

// Компонент загрузки РОССЕТИ
function RossetiLoader({ size = 'normal' }) {
  const letters = ['Р', 'О', 'С', 'С', 'Е', 'Т', 'И']
  const fontSize = size === 'small' ? 'text-xl' : 'text-4xl'
  
  return (
    <div className="flex gap-1 justify-center items-center">
      {letters.map((letter, idx) => (
        <span
          key={idx}
          className={`${fontSize} font-bold rosseti-letter`}
          style={{ animationDelay: `${idx * 0.3}s` }}
        >
          {letter}
        </span>
      ))}
    </div>
  )
}


// ==================== ГЛАВНЫЙ КОМПОНЕНТ ====================
export default function App() {
  return <AuthProvider><FlickerStyle /><Main /></AuthProvider>
}

function Main() {
  const { user, loading, ssoPending } = useAuth()
  const [page, setPage] = useState('home')
  const [puPreset, setPuPreset] = useState(null)

  // Навигация по меню сбрасывает пресет фильтров ПУ
  const go = (p) => { setPuPreset(null); setPage(p) }
  // Открыть список ПУ с заранее выставленными фильтрами (клик по цифре на главной)
  const openPU = (preset) => { setPuPreset(preset); setPage('pu') }

  if (loading || ssoPending) return <div className="min-h-screen flex items-center justify-center"><RossetiLoader /></div>
  if (!user) return <LoginPage />

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      <Sidebar page={page} setPage={go} />
      <div className="flex-1 ml-60 min-w-0">
        <Header />
        <div className="p-4 sm:p-6">
          {page === 'home' && <HomePage setPage={go} onOpenPU={openPU} />}
          {page === 'pu' && <PUListPage filter="all" preset={puPreset} />}
          {page === 'pu-sklad' && <PUListPage filter="sklad" />}
          {page === 'pu-done' && <PUListPage filter="done" />}
          {page === 'pu-actioned' && <PUListPage filter="actioned" />}
          {page === 'upload' && <UploadPage />}
          {page === 'approval' && <ApprovalPage />}
          {page === 'tz' && <TZPage />}
          {page === 'requests' && <RequestsPage />}
          {page === 'memo' && <MemoPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'move-bulk' && <MoveBulkPage />}
          {page === 'analysis' && <AnalysisPage />}
        </div>
      </div>
    </div>
  )
}

// ==================== САЙДБАР ====================
function Sidebar({ page, setPage }) {
  const { user, logout, canUpload, canManageUsers, canApprove, canCreateTZ, isEskAdmin, isSueAdmin, isResUser, isEskUser, isOksAdmin } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (canApprove) {
      api.get('/pu/pending-approval').then(r => setPendingCount(r.data.length)).catch(() => {})
    }
  }, [canApprove, page])

  const items = [
    { id: 'home', icon: 'home', label: 'Главная', show: true },
    { id: 'pu', icon: 'package', label: 'Приборы учёта', show: true },
    { id: 'upload', icon: 'upload', label: 'Загрузка', show: canUpload },
    { id: 'pu-sklad', icon: 'warehouse', label: 'Склад', show: true },
    { id: 'pu-done', icon: 'check', label: 'Завершённые СМР', show: true },
    { id: 'pu-actioned', icon: 'tag', label: 'Актированные ПУ', show: true },
    { id: 'analysis', icon: 'chart', label: 'Анализ остатков', show: true },
    { id: 'approval', icon: 'checkCircle', label: 'Согласование', show: canApprove, badge: pendingCount },
    { id: 'tz', icon: 'clipboard', label: 'Техн. задания', show: isSueAdmin || isOksAdmin },
    { id: 'requests', icon: 'fileEdit', label: 'Заявки ЭСК', show: isSueAdmin || isEskAdmin || isEskUser || isOksAdmin },
    { id: 'memo', icon: 'fileText', label: 'Служебки', show: isSueAdmin },
    { id: 'settings', icon: 'settings', label: 'Настройки', show: canManageUsers || isEskAdmin || isResUser || isEskUser },
    ].filter(i => i.show)

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-900 text-slate-300 flex flex-col">
      <div className="px-4 py-5 flex items-center gap-3 border-b border-white/5">
        <BrandMark className="w-9 h-9" />
        <div className="leading-tight">
          <div className="font-semibold text-white text-sm">Система учёта ПУ</div>
          <div className="text-[11px] svetlyachok">ПК «Светлячок»</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {items.map(i => {
          const active = page === i.id
          return (
            <button key={i.id} onClick={() => setPage(i.id)}
              className={`group w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 text-sm transition-colors ${active ? 'bg-[#0B4DA2] text-white font-medium shadow-sm' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <Icon name={i.icon} className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
              <span className="flex-1 truncate">{i.label}</span>
              {i.badge > 0 && <span className="bg-rose-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">{i.badge}</span>}
            </button>
          )
        })}
      </nav>
      <div className="px-3 pb-2 pt-3 border-t border-white/5">
        <div className="bg-white/5 rounded-lg px-3 py-2.5 mb-2">
          <div className="font-medium text-white text-sm truncate">{user?.full_name}</div>
          <div className="text-xs text-slate-400 truncate">{user?.unit_name}</div>
          <div className="text-[11px] text-slate-500 truncate">{user?.role_name}</div>
        </div>
        <button onClick={logout} className="w-full px-3 py-2 flex items-center gap-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white rounded-lg transition-colors">
          <Icon name="logout" className="w-[18px] h-[18px]" /> Выйти
        </button>
      </div>
      <div className="px-4 py-3 border-t border-white/5 text-[11px] text-slate-500">
        <div className="text-slate-400 font-medium mb-0.5">Техническая поддержка</div>
        <div>Элла Сергеевна</div>
        <div>+7 (988) 414-93-74</div>
      </div>
    </aside>
  )
}

function Header() {
  const { user } = useAuth()
  return <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
    <h1 className="font-semibold text-slate-900">{user?.unit_name || 'Система учёта ПУ'}</h1>
    <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{user?.role_name}</span>
  </header>
}

// ==================== СТРАНИЦА ЛОГИНА ====================
function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try { await login(username, password) } 
    catch (err) { setError(err.response?.data?.detail || 'Ошибка входа') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Фоновый акцент */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0B4DA2] to-[#08213f]" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/5" />

      <div className="relative bg-white rounded-2xl shadow-xl shadow-black/20 p-8 w-full max-w-md border border-white/10">
        <div className="flex flex-col items-center text-center mb-8">
          <BrandMark className="w-14 h-14" />
          <h1 className="text-xl font-semibold text-slate-900 mt-4">Система учёта ПУ</h1>
          <p className="svetlyachok-light text-sm mt-1 font-medium">ПК «Светлячок»</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Логин</label>
            <input type="text" placeholder="Введите логин" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B4DA2]/30 focus:border-[#0B4DA2] transition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Пароль</label>
            <input type="password" placeholder="Введите пароль" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B4DA2]/30 focus:border-[#0B4DA2] transition" />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              <Icon name="alert" className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#0B4DA2] text-white font-medium rounded-lg hover:bg-[#093f86] active:bg-[#08376f] disabled:opacity-50 transition-colors">
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==================== ГЛАВНАЯ СТРАНИЦА ====================
function HomePage({ setPage, onOpenPU }) {
  const { user, canUpload, canManageUsers, canApprove, isSueAdmin, isEskAdmin, isOksAdmin } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { 
    api.get('/pu/dashboard')
      .then(r => setStats(r.data))
      .catch(err => {
        console.error('Dashboard error:', err)
        setError(err.message)
      })
  }, [])

  if (error) {
    return <div className="p-4 bg-red-100 text-red-700 rounded">Ошибка: {error}</div>
  }

  const shortcuts = [
    { id: 'pu', icon: 'package', label: 'Приборы учёта', desc: 'Просмотр и управление', show: true },
    { id: 'upload', icon: 'upload', label: 'Загрузить реестр', desc: 'Импорт из Excel', show: canUpload },
    { id: 'approval', icon: 'checkCircle', label: 'Согласование', desc: 'СМР от ЭСК и ОКС', show: canApprove },
    { id: 'tz', icon: 'clipboard', label: 'Тех. задания', desc: 'Формирование ТЗ', show: isSueAdmin || isOksAdmin },
    { id: 'requests', icon: 'fileEdit', label: 'Заявки ЭСК', desc: 'Реестр заявок', show: isSueAdmin || isOksAdmin },
    { id: 'settings', icon: 'settings', label: 'Настройки', desc: 'Справочники и доступ', show: canManageUsers || isEskAdmin },
  ].filter(s => s.show)

  return (
    <div className="space-y-6">
      <div className="rounded-xl px-5 py-3.5 text-white bg-gradient-to-r from-[#0B4DA2] to-[#1565C0] shadow-sm">
        <h1 className="text-lg font-semibold">Добро пожаловать, {user?.full_name}!</h1>
        <p className="text-blue-100/90 text-xs mt-0.5">{user?.unit_name} • {user?.role_name}</p>
      </div>

      {stats && (
        <div className="space-y-4">
          {isSueAdmin && <StatGroup icon="chart" title="Все подразделения" data={stats.all} unitType="all" onPick={onOpenPU} />}
          {isSueAdmin && <StatGroup icon="building" title="РЭС (РСК)" data={stats.res} unitType="res" onPick={onOpenPU} />}
          {(isSueAdmin || isEskAdmin) && <StatGroup icon="zap" title="ЭСК" data={stats.esk} unitType="esk" onPick={onOpenPU} />}
          {(isSueAdmin || isOksAdmin) && <StatGroup icon="crane" title="ОКС" data={stats.oks} unitType="oks" onPick={onOpenPU} />}
        </div>
      )}
      {stats?.pending_approval > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-600 shrink-0"><Icon name="bell" className="w-5 h-5" /></span>
            <div>
              <span className="text-amber-800 font-medium">На согласовании: {stats.pending_approval}</span>
              <p className="text-amber-700/80 text-sm">Требуется проверка СМР от ЭСК / ОКС</p>
            </div>
          </div>
          <button onClick={() => setPage('approval')} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium whitespace-nowrap transition-colors">Перейти</button>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Быстрый доступ</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {shortcuts.map(s => (
            <button key={s.id} onClick={() => setPage(s.id)} className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-[#0B4DA2]/40 hover:shadow-md text-left transition">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#0B4DA2]/8 text-[#0B4DA2] mb-3 group-hover:bg-[#0B4DA2] group-hover:text-white transition-colors">
                <Icon name={s.icon} className="w-5 h-5" />
              </span>
              <div className="font-semibold text-slate-900">{s.label}</div>
              <div className="text-sm text-slate-500">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Компонент заголовка с сортировкой
function SortHeader({ field, label, sortField, sortDir, onSort }) {
  const isActive = sortField === field
  const handleClick = () => {
    if (isActive) {
      onSort(field, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(field, 'asc')
    }
  }
  
  return (
    <th 
      className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 select-none"
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform ${isActive ? 'text-[#0B4DA2]' : 'text-slate-300'} ${isActive && sortDir === 'asc' ? 'rotate-180' : ''}`} />
      </div>
    </th>
  )
}

function StatCard({ label, value, color = 'blue' }) {
  const accent = {
    blue: 'text-[#0B4DA2]', gray: 'text-slate-500', green: 'text-green-600',
    yellow: 'text-amber-500', purple: 'text-violet-600', emerald: 'text-emerald-600',
  }
  const dot = {
    blue: 'bg-[#0B4DA2]', gray: 'bg-slate-400', green: 'bg-green-500',
    yellow: 'bg-amber-400', purple: 'bg-violet-500', emerald: 'bg-emerald-500',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm hover:border-slate-300 transition">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dot[color] || dot.blue}`} />
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent[color] || accent.blue}`}>{value}</div>
    </div>
  )
}

// Группа остатков подразделения: заголовок + сетка компактных кликабельных карточек.
// Клик по карточке открывает список ПУ с соответствующими фильтрами.
function StatGroup({ icon, title, data, unitType, onPick }) {
  if (!data) return null
  const metrics = [
    { key: 'total',     label: 'Всего',       value: data.total || 0,     color: 'text-[#0B4DA2]',  dot: 'bg-[#0B4DA2]', preset: { unitType, status: '',         filter: 'all' } },
    { key: 'installed', label: 'Установлено', value: data.installed || 0, color: 'text-emerald-600', dot: 'bg-emerald-500', preset: { unitType, status: '',       filter: 'done' } },
    { key: 'sklad',     label: 'На складе',   value: data.sklad || 0,     color: 'text-slate-600',  dot: 'bg-slate-400', preset: { unitType, status: 'SKLAD',    filter: 'all' } },
    { key: 'techpris',  label: 'Техприс',     value: data.techpris || 0,  color: 'text-green-600',  dot: 'bg-green-500', preset: { unitType, status: 'TECHPRIS', filter: 'all' } },
    { key: 'zamena',    label: 'Замена',      value: data.zamena || 0,    color: 'text-amber-500',  dot: 'bg-amber-400', preset: { unitType, status: 'ZAMENA',   filter: 'all' } },
    { key: 'izhc',      label: 'ИЖЦ',         value: data.izhc || 0,      color: 'text-violet-600', dot: 'bg-violet-500', preset: { unitType, status: 'IZHC',     filter: 'all' } },
  ]
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-2">
        <Icon name={icon} className="w-4 h-4" /> {title}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {metrics.map(m => (
          <button key={m.key} onClick={() => onPick(m.preset)} title={`Открыть: ${m.label}`}
            className="bg-white rounded-xl border border-slate-200 p-3 text-left hover:shadow-sm hover:border-[#0B4DA2]/40 active:bg-slate-50 transition">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
              <div className="text-[11px] text-slate-500 truncate">{m.label}</div>
            </div>
            <div className={`text-xl font-bold tabular-nums ${m.color}`}>{m.value}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ==================== СПИСОК ПУ ====================
function PUListPage({ filter = 'all', preset = null }) {
  const { canMove, canDelete, isSueAdmin, isEskAdmin, isEskUser, isOksAdmin, isOksUser } = useAuth()
  const [items, setItems] = useState([])
  const [units, setUnits] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(preset?.status || '')
  const [unitFilter, setUnitFilter] = useState('')
  const [unitTypeFilter, setUnitTypeFilter] = useState(preset?.unitType || 'all')
  const [contractSearch, setContractSearch] = useState('')
  const [lsSearch, setLsSearch] = useState('')
  // Активный «режим» списка (sklad/done/actioned/all). База — из prop filter, может переопределяться пресетом с главной.
  const [dynFilter, setDynFilter] = useState(preset?.filter || filter)
  // Debounced-значения поиска (запрос уходит после паузы в наборе, а не на каждую букву)
  const [debSearch, setDebSearch] = useState('')
  const [debContract, setDebContract] = useState('')
  const [debLs, setDebLs] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [selected, setSelected] = useState([])
  const [moveModal, setMoveModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [cardModal, setCardModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Debounce: после паузы переносим введённое в debounced-значения и сбрасываем на 1-ю страницу
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebSearch(search)
      setDebContract(contractSearch)
      setDebLs(lsSearch)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search, contractSearch, lsSearch])

  useEffect(() => { api.get('/units').then(r => setUnits(r.data)) }, [])

  // Базовый режим из prop filter (смена раздела меню)
  useEffect(() => { setDynFilter(filter) }, [filter])

  // Пресет с главной: выставляем фильтры под выбранную цифру
  useEffect(() => {
    if (preset) {
      setUnitTypeFilter(preset.unitType || 'all')
      setStatus(preset.status || '')
      setDynFilter(preset.filter || 'all')
      setUnitFilter('')
      setSearch(''); setContractSearch(''); setLsSearch('')
      setDebSearch(''); setDebContract(''); setDebLs('')
      setPage(1)
    }
  }, [preset])

  useEffect(() => { load() }, [page, status, unitFilter, unitTypeFilter, dynFilter, sortField, sortDir, debSearch, debContract, debLs])

  const reqIdRef = useRef(0)
  const load = async () => {
    const myId = ++reqIdRef.current
    setLoading(true)
    const params = { page, size: 50, sort_field: sortField, sort_dir: sortDir }
    if (debSearch) params.search = debSearch
    if (status) params.status = status
    if (unitFilter) params.unit_id = unitFilter
    if (unitTypeFilter !== 'all') params.unit_type_filter = unitTypeFilter
    if (debContract) params.contract = debContract
    if (debLs) params.ls = debLs
    if (dynFilter) params.filter = dynFilter  // all, sklad, done, actioned
    try {
      const r = await api.get('/pu/items', { params })
      if (myId !== reqIdRef.current) return  // пришёл устаревший ответ — игнорируем
      setItems(r.data.items)
      setTotal(r.data.total)
      setPages(r.data.pages)
    } finally {
      if (myId === reqIdRef.current) setLoading(false)
    }
  }

  

  const handleMove = async (toUnitId, comment) => {
    await api.post('/pu/move', { pu_item_ids: selected, to_unit_id: toUnitId, comment })
    setSelected([])
    setMoveModal(false)
    load()
  }

  const handleExport = async () => {
  try {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (status) params.append('status', status)
    if (unitFilter) params.append('unit_id', unitFilter)
    if (unitTypeFilter !== 'all') params.append('unit_type_filter', unitTypeFilter)
    if (contractSearch) params.append('contract', contractSearch)
    if (lsSearch) params.append('ls', lsSearch)
    if (filter) params.append('filter', filter)
    
    const response = await api.get(`/pu/export?${params.toString()}`, { responseType: 'blob' })
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    
    // Получаем имя файла из заголовка или генерируем
    const filterName = {sklad: 'Склад', done: 'Завершенные_СМР', actioned: 'Актированные'}[filter] || 'Все'
    link.setAttribute('download', `Реестр_ПУ_${filterName}_${new Date().toISOString().slice(0,10)}.xlsx`)
    
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    alert('Ошибка выгрузки: ' + (err.response?.data?.detail || err.message))
  }
}

  const handleDelete = async (adminCode) => {
    try {
      await api.post('/pu/delete', { pu_item_ids: selected, admin_code: adminCode })
      setSelected([])
      setDeleteModal(false)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка удаления')
    }
  }


  const handleSendApprovalBatch = async () => {
  try {
    await api.post('/pu/send-approval-batch', { item_ids: selected })
    alert(`Отправлено на согласование: ${selected.length} ПУ`)
    setSelected([])
    load()
  } catch (err) {
    alert(err.response?.data?.detail || 'Ошибка отправки')
  }
}
  
  const statusLabels = { SKLAD: 'Склад', TECHPRIS: 'Техприс', ZAMENA: 'Замена', IZHC: 'ИЖЦ', INSTALLED: 'Установлен' }
  const statusColors = { SKLAD: 'bg-gray-100', TECHPRIS: 'bg-green-100 text-green-800', ZAMENA: 'bg-yellow-100 text-yellow-800', IZHC: 'bg-purple-100 text-purple-800', INSTALLED: 'bg-emerald-100 text-emerald-800' }

  // Фильтруем подразделения для списка и перемещения
  const visibleUnits = isEskAdmin 
    ? units.filter(u => u.unit_type === 'ESK' || u.unit_type === 'ESK_UNIT')
    : isOksAdmin
    ? units.filter(u => u.unit_type === 'OKS' || u.unit_type === 'OKS_UNIT')
    : units

  const moveUnits = units.filter(u => {
    if (isSueAdmin) return u.unit_type === 'RES'
    if (isEskAdmin) return u.unit_type === 'ESK' || u.unit_type === 'ESK_UNIT'
    if (isOksAdmin) return u.unit_type === 'OKS' || u.unit_type === 'OKS_UNIT'
    return false
  })

  // Для ЭСК и ОКС только Техприс и Склад
  const statusOptions = (isEskAdmin || isOksAdmin)
    ? [{ value: 'SKLAD', label: 'Склад' }, { value: 'TECHPRIS', label: 'Техприс' }]
    : Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v }))

  return (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold">
          {dynFilter === 'all' && 'Все приборы учёта'}
          {dynFilter === 'sklad' && 'Склад'}
          {dynFilter === 'done' && 'Завершённые СМР'}
          {dynFilter === 'actioned' && 'Актированные ПУ'}
        </h1>
        <p className="text-gray-500">Всего: {total}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Выгрузить в Excel</button>
        <button onClick={load} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Icon name="refresh" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Обновить</button>
      </div>
    </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
  <input 
    type="text" 
    placeholder="Поиск по номеру ПУ..." 
    value={search} 
    onChange={e => setSearch(e.target.value)} 
    className="w-full px-3 py-2 pr-8 border rounded-lg" 
  />
  {search && (
    <button 
      onClick={() => setSearch('')} 
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
    >
      <Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" />
    </button>
  )}
</div>

<div className="relative w-48">
  <input 
    type="text" 
    placeholder="Договор ТП..." 
    value={contractSearch} 
    onChange={e => setContractSearch(e.target.value)} 
    className="w-full px-3 py-2 pr-8 border rounded-lg" 
  />
  {contractSearch && (
    <button 
      onClick={() => setContractSearch('')} 
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
    >
      <Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" />
    </button>
  )}
</div>

{!isEskAdmin && !isOksAdmin && (
  <div className="relative w-40">
    <input 
      type="text" 
      placeholder="Номер ЛС..." 
      value={lsSearch} 
      onChange={e => setLsSearch(e.target.value)} 
      className="w-full px-3 py-2 pr-8 border rounded-lg" 
    />
    {lsSearch && (
      <button 
        onClick={() => setLsSearch('')} 
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" />
      </button>
    )}
  </div>
)}
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="px-3 py-2 border rounded-lg">
            <option value="">Все статусы</option>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {(isSueAdmin || isEskAdmin || isOksAdmin) && (
            <select value={unitFilter} onChange={e => { setUnitFilter(e.target.value); setPage(1) }} className="px-3 py-2 border rounded-lg">
              <option value="">Все подразделения</option>
              {visibleUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {isSueAdmin && (
            <div className="flex items-center gap-1 px-2 py-1 border rounded-lg">
              <button onClick={() => { setUnitTypeFilter('all'); setPage(1) }} className={`px-3 py-1 rounded ${unitTypeFilter === 'all' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>Все</button>
              <button onClick={() => { setUnitTypeFilter('res'); setPage(1) }} className={`px-3 py-1 rounded ${unitTypeFilter === 'res' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>РЭС</button>
              <button onClick={() => { setUnitTypeFilter('esk'); setPage(1) }} className={`px-3 py-1 rounded ${unitTypeFilter === 'esk' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>ЭСК</button>
              <button onClick={() => { setUnitTypeFilter('oks'); setPage(1) }} className={`px-3 py-1 rounded ${unitTypeFilter === 'oks' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>ОКС</button>
            </div>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-blue-700 font-medium">Выбрано: {selected.length}</span>
          <div className="flex gap-2">
            {canMove && <button onClick={() => setMoveModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="arrowRight" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Переместить</button>}
            {(isEskUser || isEskAdmin || isOksUser || isOksAdmin) && (
              <button onClick={handleSendApprovalBatch} className="px-4 py-2 bg-orange-500 text-white rounded-lg"><Icon name="send" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> На согласование</button>
            )}
            {canDelete && <button onClick={() => setDeleteModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg"><Icon name="trash" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Удалить</button>}
            <button onClick={() => setSelected([])} className="px-4 py-2 bg-gray-100 rounded-lg">Отменить</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        {loading ? <div className="p-8"><RossetiLoader /></div> : (
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-gray-50">
              <tr>
                {canMove && <th className="w-10 px-4 py-3"><input type="checkbox" onChange={e => setSelected(e.target.checked ? items.map(i => i.id) : [])} checked={selected.length === items.length && items.length > 0} /></th>}
                <SortHeader field="serial_number" label="Серийный номер" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="pu_type" label="Тип" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="current_unit_name" label="Подразделение" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="status" label="Статус" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <th className="px-4 py-3 text-left">Назначение</th>
                <SortHeader field="tz_number" label="№ ТЗ" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="request_number" label="№ Заявки" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="approval_status" label="Согласование" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <SortHeader field="created_at" label="Дата" sortField={sortField} sortDir={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); setPage(1) }} />
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-t hover:bg-gray-50">
                  {canMove && <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(i.id)} onChange={() => setSelected(s => s.includes(i.id) ? s.filter(x => x !== i.id) : [...s, i.id])} /></td>}
                  <td className="px-4 py-3 font-mono">{i.serial_number}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={i.pu_type}>{i.pu_type || '—'}</td>
                  <td className="px-4 py-3">{i.current_unit_name || '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${statusColors[i.status] || 'bg-gray-100'}`}>{statusLabels[i.status] || i.status}</span></td>
                  <td className="px-4 py-3">{i.naznachenie === 'IZHC' ? 'ИЖЦ' : i.naznachenie === 'TECHPRIS' ? 'Техприс' : i.naznachenie === 'ZAMENA' ? 'Замена' : '—'}</td>
                  <td className="px-4 py-3">{i.tz_number || '—'}</td>
                  <td className="px-4 py-3">{i.request_number || '—'}</td>
                  <td className="px-4 py-3">
                    {i.approval_status === 'APPROVED' && <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs"><Icon name="check" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Согласовано</span>}
                    {i.approval_status === 'PENDING' && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs"><Icon name="clock" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> На согласовании</span>}
                    {i.approval_status === 'REJECTED' && <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs"><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Отклонено</span>}
                    {(!i.approval_status || i.approval_status === 'NONE') && <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{i.uploaded_at ? new Date(i.uploaded_at).toLocaleDateString('ru') : '—'}</td>
                  <td className="px-4 py-3"><button onClick={() => setCardModal(i.id)} className="text-blue-600 hover:underline"><Icon name="clipboard" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <span className="text-sm text-gray-500">Страница {page} из {pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50"><Icon name="arrowLeft" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 border rounded disabled:opacity-50"><Icon name="arrowRight" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
            </div>
          </div>
        )}
      </div>

      {moveModal && <MoveModal units={moveUnits} onClose={() => setMoveModal(false)} onMove={handleMove} count={selected.length} />}
      {deleteModal && (
        <DeleteWithCodeModal
          title={`Удалить ${selected.length} ПУ?`}
          onClose={() => setDeleteModal(false)}
          onDelete={handleDelete}
        />
      )}
      {cardModal && <PUCardModal itemId={cardModal} onClose={() => { setCardModal(null); load() }} />}
    </div>
  )
}

function MoveModal({ units, onClose, onMove, count }) {
  const [unitId, setUnitId] = useState('')
  const [comment, setComment] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Переместить {count} ПУ</h2>
        <select value={unitId} onChange={e => setUnitId(e.target.value)} className="w-full px-3 py-2 border rounded-lg mb-4">
          <option value="">Выберите подразделение...</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" className="w-full px-3 py-2 border rounded-lg mb-4" rows={3} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={() => unitId && onMove(parseInt(unitId), comment)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Переместить</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ onClose, onDelete, count }) {
  const [code, setCode] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-red-600"><Icon name="trash" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Удалить {count} ПУ?</h2>
        <p className="text-gray-600 mb-4">Это действие нельзя отменить. Введите код администратора:</p>
        <input type="password" placeholder="Код админа" value={code} onChange={e => setCode(e.target.value)} className="w-full px-3 py-2 border rounded-lg mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={() => code && onDelete(code)} className="px-4 py-2 bg-red-600 text-white rounded-lg">Удалить</button>
        </div>
      </div>
    </div>
  )
}



function DeleteWithCodeModal({ title, onClose, onDelete }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!code) return
    setLoading(true)
    await onDelete(code)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-red-600"><Icon name="trash" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> {title}</h2>
        <p className="text-gray-600 mb-4">Это действие нельзя отменить. Введите код администратора:</p>
        <input 
          type="password" 
          placeholder="Код админа" 
          value={code} 
          onChange={e => setCode(e.target.value)} 
          className="w-full px-3 py-2 border rounded-lg mb-4" 
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={handleDelete} disabled={!code || loading} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== КАРТОЧКА ПУ ====================
function PUCardModal({ itemId, onClose }) {
  const { isSueAdmin, isResUser, isEskUser, isEskAdmin, isOksUser } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [ttrRes, setTtrRes] = useState([])
  const [ttrEsk, setTtrEsk] = useState([])
  const [masters, setMasters] = useState([])
  const [importing, setImporting] = useState(false)
  const [materials, setMaterials] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [vaNominals, setVaNominals] = useState([])
  const [ttNominals, setTtNominals] = useState([])

useEffect(() => {
  const loadItem = async () => {
    try {
      const r = await api.get(`/pu/items/${itemId}`)
      let itemData = r.data
      
      // Автоопределение если form_factor пустой но есть pu_type
      if (itemData.pu_type && !itemData.form_factor) {
        try {
          const detectRes = await api.get('/pu/detect-type', { params: { pu_type: itemData.pu_type } })
          if (detectRes.data.form_factor) {
            itemData = { ...itemData, form_factor: detectRes.data.form_factor }
          }
          if (detectRes.data.faza && !itemData.faza) {
            itemData = { ...itemData, faza: detectRes.data.faza }
          }
          if (detectRes.data.voltage && !itemData.voltage) {
            itemData = { ...itemData, voltage: detectRes.data.voltage }
          }
        } catch (err) { /* игнорируем */ }
      }
      
      setItem(itemData)
      
      // Загружаем ТТР привязанные к типу ПУ
      if (itemData.pu_type) {
        try {
          const [ouRes, olRes, orRes, allTtrRes] = await Promise.all([
            api.get('/ttr/res/for-pu', { params: { pu_type: itemData.pu_type, ttr_type: 'OU' } }),
            api.get('/ttr/res/for-pu', { params: { pu_type: itemData.pu_type, ttr_type: 'OL' } }),
            api.get('/ttr/res/for-pu', { params: { pu_type: itemData.pu_type, ttr_type: 'OR' } }),
            api.get('/ttr/res')  // Загружаем все ТТР чтобы взять TT (У-27 универсален, не привязан к типу ПУ)
          ])
          // Берём OU/OL/OR из for-pu (привязанные к типу ПУ), а TT — из общего справочника
          const ttItems = allTtrRes.data.filter(t => t.code && t.code.trim() === 'У-27')
          const allTtrData = [...ouRes.data, ...olRes.data, ...orRes.data, ...ttItems]
          setTtrRes(allTtrData)
          
          // Авто-привязка У-27: если ЗАМЕНА и выбран У-25, ставим ttr_tt_id автоматически
          if (itemData.status === 'ZAMENA' && !itemData.ttr_tt_id) {
            const hasU25 = allTtrData.some(t => 
              (t.id === itemData.ttr_ou_id || t.id === itemData.ttr_ol_id || t.id === itemData.ttr_or_id) && t.code && t.code.trim() === 'У-25'
            )
            if (hasU25) {
              const ttTtr = allTtrData.find(t => t.code && t.code.trim() === 'У-27')
              if (ttTtr) {
                itemData.ttr_tt_id = ttTtr.id
                setItem(prev => prev ? { ...prev, ttr_tt_id: ttTtr.id } : prev)
              }
            }
          }
        } catch (err) {
          // Если ошибка — загружаем все ТТР
          const allTtr = await api.get('/ttr/res')
          setTtrRes(allTtr.data)
        }
      } else {
        const allTtr = await api.get('/ttr/res')
        setTtrRes(allTtr.data)
      }
      
      setLoading(false)
    } catch (err) {
      console.error('Ошибка загрузки ПУ:', err)
      setLoading(false)
    }
  }
  
  loadItem()
  api.get('/ttr/esk').then(r => setTtrEsk(r.data))
  api.get('/masters').then(r => setMasters(r.data))
  api.get('/va-nominals').then(r => setVaNominals(r.data))
  api.get('/tt-nominals').then(r => setTtNominals(r.data))
}, [itemId])

// Для ОКС исполнитель СМР всегда "ОКС" (без выбора РСК/ЭСК)
useEffect(() => {
  if (!item) return
  const oks = item.current_unit_type === 'OKS_UNIT' || item.current_unit_type === 'OKS'
  if (oks && item.smr_executor !== 'ОКС') {
    setItem(prev => prev ? { ...prev, smr_executor: 'ОКС' } : prev)
  }
}, [item?.current_unit_type, item?.id])

// Очищаем материалы когда ВСЕ ТТР сброшены (с задержкой чтобы перекрыть левый вызов)
useEffect(() => {
  if (item && !item.ttr_ou_id && !item.ttr_ol_id && !item.ttr_or_id && !item.ttr_tt_id) {
    const timer = setTimeout(() => {
      console.log('Force clearing materials')
      setMaterials([])
    }, 200)
    return () => clearTimeout(timer)
  }
}, [item?.ttr_ou_id, item?.ttr_ol_id, item?.ttr_or_id, item?.ttr_tt_id])

// Загружаем материалы при открытии карточки (если ТТР уже выбраны)
useEffect(() => {
  if (item && !loading && (item.ttr_ou_id || item.ttr_ol_id || item.ttr_or_id || item.ttr_tt_id)) {
    loadMaterials({
      ttr_ou_id: item.ttr_ou_id,
      ttr_ol_id: item.ttr_ol_id,
      ttr_or_id: item.ttr_or_id,
      ttr_tt_id: item.ttr_tt_id
    })
  }
}, [item?.id, loading])

  // Автоформат договора с дефисами
  const formatContract = (value) => {
    const digits = value.replace(/\D/g, '')
    let formatted = ''
    if (digits.length > 0) formatted += digits.slice(0, 5)
    if (digits.length > 5) formatted += '-' + digits.slice(5, 7)
    if (digits.length > 7) formatted += '-' + digits.slice(7, 15)
    if (digits.length > 15) formatted += '-' + digits.slice(15, 16)
    return formatted
  }

  const validate = () => {
    const errs = {}
    if (item.status !== 'SKLAD') {
      // Обязательные поля для не-склада
      if (item.status === 'TECHPRIS') {
        if (!item.contract_number) errs.contract_number = 'Обязательно'
        else if (!/^\d{5}-\d{2}-\d{8}-\d$/.test(item.contract_number)) errs.contract_number = 'Формат: ххххх-хх-хххххххх-х'
      }
      if ((item.status === 'ZAMENA' || item.status === 'IZHC') && !item.ls_number) {
        errs.ls_number = 'Обязательно'
      }
      // Если ВА установлен — ТТР распред. щита обязателен
      if (item.has_va && !item.ttr_or_id) {
        errs.ttr_or_id = 'Обязательно при ВА'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

const handleSave = async () => {
  if (!validate()) return
  setSaving(true)
  try {
    await api.put(`/pu/items/${itemId}`, item)
    
    // Сохраняем материалы если есть
    if (materials.length > 0) {
      await api.post(`/pu/items/${itemId}/materials`, {
        materials: materials.map(m => ({
          material_id: m.material_id,
          quantity: m.quantity,
          used: m.used
        }))
      })
    }
    
    onClose()
  } catch (err) {
    alert(err.response?.data?.detail || 'Ошибка сохранения')
  }
  setSaving(false)
}

  const handleImport = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  setImporting(true)
  const formData = new FormData()
  formData.append('file', file)
  
  try {
    if (item.status === 'TECHPRIS') {
      // Импорт по номеру договора
      if (!item.contract_number) {
        alert('Сначала введите номер договора')
        setImporting(false)
        return
      }
      formData.append('contract_number', item.contract_number)
      const r = await api.post('/pu/import-lookup-techpris', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (r.data.found) {
        setItem({ ...item, 
          consumer: r.data.consumer || item.consumer,
          address: r.data.address || item.address,
          power: r.data.power || item.power,
          contract_date: r.data.contract_date || item.contract_date,
          plan_date: r.data.plan_date || item.plan_date
        })
        alert('Данные загружены')
      } else {
        alert('Договор не найден в файле')
      }
    } else if (item.status === 'ZAMENA' || item.status === 'IZHC') {
      // Импорт по серийному номеру
      formData.append('serial_number', item.serial_number)
      const r = await api.post('/pu/import-lookup-zamena', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (r.data.found) {
        setItem({ ...item, ls_number: r.data.ls_number })
        alert('ЛС загружен')
      } else {
        alert('Счётчик не найден в файле')
      }
    }
  } catch (err) {
    alert(err.response?.data?.detail || 'Ошибка импорта')
  }
  setImporting(false)
  e.target.value = '' // сброс input
}

const handleSendApproval = async () => {
  // ОКС работает по логике РЭС (техприс): другие обязательные поля, без ЭСК-ЛСР/мастера
  const _isOks = item?.current_unit_type === 'OKS_UNIT' || item?.current_unit_type === 'OKS'
  // Проверяем обязательные поля для согласования
  const requiredFields = []
  
  if (_isOks) {
    if (!item.contract_number) requiredFields.push('Номер договора')
    if (!item.consumer) requiredFields.push('Потребитель')
    if (!item.address) requiredFields.push('Адрес')
    if (!item.smr_date) requiredFields.push('Дата СМР')
  } else {
    if (!item.faza) requiredFields.push('Фазность')
    if (!item.form_factor) requiredFields.push('Форм-фактор')
    if (!item.va_type) requiredFields.push('Щит с ВА')
    if (!item.contract_number) requiredFields.push('Номер договора')
    if (!item.consumer) requiredFields.push('Потребитель')
    if (!item.address) requiredFields.push('Адрес')
    if (!item.smr_master_id) requiredFields.push('СМР выполнил (мастер)')
    if (!item.smr_date) requiredFields.push('Дата СМР')
    
    // Проверяем ЛСР
    if (!item.lsr_va && !item.lsr_truba) requiredFields.push('ЛСР (выберите Щит с ВА или Трубостойку)')
  }
  
  if (requiredFields.length > 0) {
    // Подсвечиваем ошибки
    const newErrors = {}
    if (_isOks) {
      if (!item.contract_number) newErrors.contract_number = 'Обязательно'
      if (!item.consumer) newErrors.consumer = 'Обязательно'
      if (!item.address) newErrors.address = 'Обязательно'
      if (!item.smr_date) newErrors.smr_date = 'Обязательно'
    } else {
      if (!item.faza) newErrors.faza = 'Обязательно'
      if (!item.form_factor) newErrors.form_factor = 'Обязательно'
      if (!item.va_type) newErrors.va_type = 'Обязательно'
      if (!item.contract_number) newErrors.contract_number = 'Обязательно'
      if (!item.consumer) newErrors.consumer = 'Обязательно'
      if (!item.address) newErrors.address = 'Обязательно'
      if (!item.smr_master_id) newErrors.smr_master_id = 'Обязательно'
      if (!item.smr_date) newErrors.smr_date = 'Обязательно'
    }
    setErrors(newErrors)
    
    alert(`Заполните обязательные поля:\n\n• ${requiredFields.join('\n• ')}`)
    return
  }
  
  if (!validate()) return
  setSaving(true)
  try {
    await api.put(`/pu/items/${itemId}`, item)
    await api.post(`/pu/items/${itemId}/send-approval`)
    onClose()
  } catch (err) {
    alert(err.response?.data?.detail || 'Ошибка отправки')
  }
  setSaving(false)
}
  
const update = async (field, value) => {
  if (field === 'contract_number') {
    value = formatContract(value)
    
    // Проверяем дубликат если номер полный (19 символов)
    if (value && value.length === 19) {
      try {
        const r = await api.get('/pu/check-contract', { 
          params: { contract_number: value, exclude_id: item.id } 
        })
        if (r.data.duplicate) {
          setErrors(prev => ({ 
            ...prev, 
            contract_number: `Дубликат! ПУ: ${r.data.existing_serial} (${r.data.existing_unit || '—'})` 
          }))
        } else {
          setErrors(prev => ({ ...prev, contract_number: null }))
        }
      } catch (err) { /* игнорируем */ }
    }
  }
  
  let newItem = { ...item, [field]: value }
  
  // Сброс ТТР орг. учета при смене статуса (фильтр меняется: Установка/Замена)
  if (field === 'status' && value !== item.status && ['TECHPRIS', 'ZAMENA', 'IZHC'].includes(value)) {
    const prevGroup = (item.status === 'ZAMENA' || item.status === 'IZHC') ? 'zamena' : 'techpris'
    const newGroup = (value === 'ZAMENA' || value === 'IZHC') ? 'zamena' : 'techpris'
    if (prevGroup !== newGroup && item.ttr_ou_id) {
      newItem.ttr_ou_id = null
      newItem.ttr_tt_id = null
    }
  }

  // Автозаполнение при смене статуса со Склада
  if (field === 'status' && value !== 'SKLAD' && item.status === 'SKLAD') {
    if (!item.faza || !item.voltage || !item.form_factor) {
      try {
        const r = await api.get('/pu/detect-type', { params: { pu_type: item.pu_type } })
        if (r.data.faza && !item.faza) newItem.faza = r.data.faza
        if (r.data.voltage && !item.voltage) newItem.voltage = r.data.voltage
        if (r.data.form_factor && !item.form_factor) newItem.form_factor = r.data.form_factor
      } catch (err) { /* игнорируем */ }
    }
  }

  // Автоматика трубостойки
if (field === 'trubostoyka' && isEsk) {
  if (value === true) {
    // Трубостойка ДА ставим ВА = трубостойка
    newItem.va_type = 'trubostoyka'
  } else {
    // Трубостойка НЕТ сбрасываем если было trubostoyka
    if (newItem.va_type === 'trubostoyka') {
      newItem.va_type = ''
    }
    // Очищаем ЛСР трубостойки
    newItem.lsr_truba = null
    newItem.price_truba_no_nds = null
    newItem.price_truba_with_nds = null
  }
}
  
  // Автоподбор ЛСР при изменении параметров (для ЭСК)
  if (['faza', 'form_factor', 'va_type', 'trubostoyka'].includes(field) && isEsk) {
    const updatedItem = { ...newItem }
    
    try {
      const params = {
        faza: updatedItem.faza,
        form_factor: updatedItem.form_factor,
        va_type: updatedItem.va_type,
        pu_type: item.pu_type,
        need_trubostoyka: updatedItem.trubostoyka === true
      }
      
      const r = await api.get('/ttr/esk/lookup', { params })
      
      // Трубостойка
      if (r.data.trubostoyka) {
        newItem.lsr_truba = r.data.trubostoyka.lsr_number
        newItem.price_truba_no_nds = r.data.trubostoyka.price_no_nds
        newItem.price_truba_with_nds = r.data.trubostoyka.price_with_nds
      } else {
        newItem.lsr_truba = null
        newItem.price_truba_no_nds = null
        newItem.price_truba_with_nds = null
      }
      
      // ВА
      if (r.data.va) {
        newItem.ttr_esk_id = r.data.va.id
        newItem.lsr_va = r.data.va.lsr_number
        newItem.price_va_no_nds = r.data.va.price_no_nds
        newItem.price_va_with_nds = r.data.va.price_with_nds
      } else {
        newItem.ttr_esk_id = null
        newItem.lsr_va = null
        newItem.price_va_no_nds = null
        newItem.price_va_with_nds = null
      }
      
      // Старые поля для совместимости
      newItem.lsr_number = newItem.lsr_va
      newItem.price_no_nds = r.data.total_no_nds
      newItem.price_with_nds = r.data.total_with_nds
      
    } catch (err) { 
      console.error('Ошибка подбора ЛСР:', err)
    }
  }
  
  setItem(newItem)
if (errors[field]) setErrors({ ...errors, [field]: null })

// Если сменили СМР на ЭСК — исключаем все материалы
if (field === 'smr_executor' && value === 'ЭСК') {
  setMaterials(prev => prev.map(m => ({ ...m, used: false })))
}
// Если сменили СМР на РСК — включаем все материалы обратно
if (field === 'smr_executor' && value === 'РСК') {
  setMaterials(prev => prev.map(m => ({ ...m, used: true })))
}

// Загружаем материалы при выборе ТТР + автопривязка У-27 (жёстко только при У-25)
if (['ttr_ou_id', 'ttr_ol_id', 'ttr_or_id'].includes(field)) {
  // Проверяем есть ли среди выбранных ТТР именно У-25
  const hasU25 = ttrRes.some(t => 
    (t.id === newItem.ttr_ou_id || t.id === newItem.ttr_ol_id || t.id === newItem.ttr_or_id) && t.code && t.code.trim() === 'У-25'
  )
  if (hasU25 && newItem.status === 'ZAMENA') {
    // Автоматически ставим У-27
    const ttTtr = ttrRes.find(t => t.code && t.code.trim() === 'У-27')
    if (ttTtr) newItem.ttr_tt_id = ttTtr.id
  } else {
    // Снимаем У-27 если У-25 не выбран
    newItem.ttr_tt_id = null
  }
  setItem(newItem)
  loadMaterials({
    ttr_ou_id: newItem.ttr_ou_id,
    ttr_ol_id: newItem.ttr_ol_id,
    ttr_or_id: newItem.ttr_or_id,
    ttr_tt_id: newItem.ttr_tt_id
  })
} else if (field === 'ttr_tt_id') {
  loadMaterials({
    ttr_ou_id: newItem.ttr_ou_id,
    ttr_ol_id: newItem.ttr_ol_id,
    ttr_or_id: newItem.ttr_or_id,
    ttr_tt_id: newItem.ttr_tt_id
  })
}
}
const loadMaterials = async (overrideTtr = null) => {

    if (!overrideTtr) {
    console.log('loadMaterials: ignored call without overrideTtr')
    return
  }
  
  // Если передали override — используем его, иначе берём из item
  const ttrOuId = overrideTtr ? overrideTtr.ttr_ou_id : item?.ttr_ou_id
  const ttrOlId = overrideTtr ? overrideTtr.ttr_ol_id : item?.ttr_ol_id  
  const ttrOrId = overrideTtr ? overrideTtr.ttr_or_id : item?.ttr_or_id
  const ttrTtId = overrideTtr ? overrideTtr.ttr_tt_id : item?.ttr_tt_id

  console.log('loadMaterials called:', { overrideTtr, ttrOuId, ttrOlId, ttrOrId, ttrTtId })
  console.trace('Call stack:')
  
  if (!ttrOuId && !ttrOlId && !ttrOrId && !ttrTtId) {
    setMaterials([])
    return
  }
  
  setLoadingMaterials(true)
  try {
    // Передаём текущие выбранные ТТР как параметры
    const params = new URLSearchParams()
    if (ttrOuId) params.append('ttr_ou_id', ttrOuId)
    if (ttrOlId) params.append('ttr_ol_id', ttrOlId)
    if (ttrOrId) params.append('ttr_or_id', ttrOrId)
    if (ttrTtId) params.append('ttr_tt_id', ttrTtId)
    
    const r = await api.get(`/pu/items/${itemId}/materials?${params.toString()}`)
    
    // Если есть факт - используем его, иначе дефолты
// Берём defaults как базу и накладываем facts если есть
const defaults = r.data.defaults || []
const facts = r.data.facts || []

// Создаём map из facts для быстрого поиска
const factsMap = {}
facts.forEach(f => {
  factsMap[f.material_id] = f
})

// Объединяем: берём все defaults, но если есть fact — используем его quantity/used
const merged = defaults.map(d => {
  const fact = factsMap[d.material_id]
  return {
    material_id: d.material_id,
    material_name: d.material_name,
    unit: d.unit,
    quantity: fact ? fact.quantity : d.quantity,
    default_qty: d.quantity,
    used: fact ? fact.used : true
  }
})

// Если СМР выполнил ЭСК — исключаем все материалы
if (item?.smr_executor === 'ЭСК') {
  setMaterials(merged.map(m => ({ ...m, used: false })))
} else {
  setMaterials(merged)
}
  } catch (err) {
    console.error('Ошибка загрузки материалов:', err)
  }
  setLoadingMaterials(false)
}

  const toggleMaterialUsed = (materialId) => {
  setMaterials(prev => prev.map(m => 
    m.material_id === materialId ? { ...m, used: !m.used } : m
  ))
}

const updateMaterialQty = (materialId, qty) => {
  setMaterials(prev => prev.map(m => 
    m.material_id === materialId ? { ...m, quantity: parseFloat(qty) || 0 } : m
  ))
}

  if (loading) return (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl p-8">
      <RossetiLoader />
    </div>
  </div>
)

    const isEsk = item?.current_unit_type === 'ESK_UNIT' || item?.current_unit_type === 'ESK'
    const isRes = item?.current_unit_type === 'RES'
    const isOks = item?.current_unit_type === 'OKS_UNIT' || item?.current_unit_type === 'OKS'
    // ОКС по содержанию карточки идентичен РЭС (ТТР РЭС, материалы, ВА/ТТ),
    // но отправляет на согласование как ЭСК. isResLike — для контентных секций.
    const isResLike = isRes || isOks
// СУЭ может редактировать карточки РЭС, РЭС редактирует свои, ЭСК/ОКС редактируют свои
    
    const isApproved = item?.approval_status === 'APPROVED'
    const isRejected = item?.approval_status === 'REJECTED'
    const hasTZ = item?.tz_number && item.tz_number.trim() !== ''
    const canEdit = (isSueAdmin && isRes) || (((isResUser && isRes) || (isEskUser && isEsk) || (isOksUser && isOks)) && !isApproved && !hasTZ)
    // ЭСК/ОКС могут редактировать если REJECTED или NONE
    const canEditEsk = (isEskUser && isEsk || isOksUser && isOks) && (item?.approval_status === 'REJECTED' || item?.approval_status === 'NONE' || !item?.approval_status)

  // Для ЭСК и ОКС только Техприс и Склад
  const statusOptions = (isEsk || isOks)
    ? [{ value: 'SKLAD', label: 'На складе' }, { value: 'TECHPRIS', label: 'Техприс' }]
    : [
        { value: 'SKLAD', label: 'На складе' },
        { value: 'TECHPRIS', label: 'Техприс' },
        { value: 'ZAMENA', label: 'Замена' },
        { value: 'IZHC', label: 'ИЖЦ' },
      ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Карточка ПУ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Основное */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Серийный номер</label>
              <input type="text" value={item.serial_number || ''} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Подразделение</label>
              <input type="text" value={item.current_unit_name || ''} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Тип ПУ</label>
            <input type="text" value={item.pu_type || ''} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
          </div>

          <div className={`grid ${isEsk ? 'grid-cols-3' : 'grid-cols-4'} gap-4`}>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Статус *</label>
              <select value={item.status || ''} onChange={e => update('status', e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg">
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {!isEsk && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Назначение</label>
                <input type="text" value={
                  item.naznachenie === 'IZHC' ? 'ИЖЦ' : 
                  item.naznachenie === 'TECHPRIS' ? 'Техприс' : 
                  item.naznachenie === 'ZAMENA' ? 'Замена' : 
                  item.naznachenie || '—'
                } disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Фазность</label>
              <select value={item.faza || ''} onChange={e => update('faza', e.target.value)} disabled={!canEdit || item.status === 'SKLAD'} className="w-full px-3 py-2 border rounded-lg">
                <option value="">—</option>
                <option value="1ф">1 фаза</option>
                <option value="3ф">3 фазы</option>
                <option value="3фтт">3 фазы ТТ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Напряжение</label>
              <select value={item.voltage || ''} onChange={e => update('voltage', e.target.value)} disabled={!canEdit || item.status === 'SKLAD'} className="w-full px-3 py-2 border rounded-lg">
                <option value="">—</option>
                <option value="0.23">0,23 кВ</option>
                <option value="0.4">0,4 кВ</option>
                <option value="6">6 кВ</option>
                <option value="10">10 кВ</option>
              </select>
            </div>
          </div>

          {/* Для Техприс (РЭС и ЭСК) */}
          {item.status === 'TECHPRIS' && (
            <>
              <hr />
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Данные техприсоединения</h3>
                {canEdit && (
                  <label className={`px-3 py-1 text-sm rounded-lg cursor-pointer ${importing ? 'bg-gray-300' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                    {importing ? 'Загрузка...' : 'Импорт из Excel'}
                    <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={importing} className="hidden" />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Номер договора *</label>
                  <input 
                    type="text" 
                    value={item.contract_number || ''} 
                    onChange={e => update('contract_number', e.target.value)} 
                    disabled={!canEdit} 
                    placeholder="ххххх-хх-хххххххх-х" 
                    maxLength={19}
                    className={`w-full px-3 py-2 border rounded-lg ${errors.contract_number ? 'border-red-500' : ''}`} 
                  />
                  {errors.contract_number && <span className="text-red-500 text-xs">{errors.contract_number}</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Мощность, кВт</label>
                  <input type="number" value={item.power || ''} onChange={e => update('power', parseFloat(e.target.value) || null)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Дата заключения</label>
                  <input type="date" value={item.contract_date || ''} onChange={e => update('contract_date', e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Планируемая дата</label>
                  <input type="date" value={item.plan_date || ''} onChange={e => update('plan_date', e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Потребитель *</label>
                <input type="text" value={item.consumer || ''} onChange={e => update('consumer', e.target.value)} disabled={!canEdit} className={`w-full px-3 py-2 border rounded-lg ${errors.consumer ? 'border-red-500 bg-red-50' : ''}`} />
                {errors.consumer && <span className="text-red-500 text-xs">{errors.consumer}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Адрес *</label>
                <textarea value={item.address || ''} onChange={e => update('address', e.target.value)} disabled={!canEdit} rows={2} className={`w-full px-3 py-2 border rounded-lg ${errors.address ? 'border-red-500 bg-red-50' : ''}`} />
                {errors.address && <span className="text-red-500 text-xs">{errors.address}</span>}
              </div>
            </>
          )}

          {/* Для Замена и ИЖЦ (только РЭС) */}
          {(item.status === 'ZAMENA' || item.status === 'IZHC') && isRes && (
            <>
              <hr />
              <div className="flex justify-between items-center mb-2">
               <h3 className="font-medium">Данные для замены/ИЖЦ</h3>
               {canEdit && (
                 <label className={`px-3 py-1 text-sm rounded-lg cursor-pointer ${importing ? 'bg-gray-300' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                   {importing ? 'Загрузка...' : 'Импорт из 1С'}
                   <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={importing} className="hidden" />
                 </label>
               )}
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-600 mb-1">Лицевой счет (ЛС) *</label>
                <input 
                  type="text" 
                  value={item.ls_number || ''} 
                  onChange={e => update('ls_number', e.target.value)} 
                  disabled={!canEdit} 
                  className={`w-full px-3 py-2 border rounded-lg ${errors.ls_number ? 'border-red-500' : ''}`} 
                />
                {errors.ls_number && <span className="text-red-500 text-xs">{errors.ls_number}</span>}
              </div>
            </>
          )}

          {/* ТТР для РЭС / ОКС */}
          {isResLike && item.status !== 'SKLAD' && (
            <>
              <hr />
              <h3 className="font-medium">ТТР (для РЭС)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">ТТР орг. учета</label>
                  <select value={item.ttr_ou_id || ''} onChange={e => update('ttr_ou_id', parseInt(e.target.value) || null)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">—</option>
                    {ttrRes.filter(t => {
                      if (t.ttr_type !== 'OU') return false
                      // Фильтр по статусу: Техприс только Установка, Замена/ИЖЦ только Замена
                      const nameLow = (t.name || '').trim().toLowerCase()
                      if (item.status === 'TECHPRIS') return nameLow.startsWith('установка') || nameLow.includes('установка ')
                      if (item.status === 'ZAMENA' || item.status === 'IZHC') return nameLow.startsWith('замена') || nameLow.includes('замена ')
                      return true
                    }).map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">ТТР обуст. линии</label>
                  <select value={item.ttr_ol_id || ''} onChange={e => update('ttr_ol_id', parseInt(e.target.value) || null)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">—</option>
                    {ttrRes.filter(t => t.ttr_type === 'OL').map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${errors.ttr_or_id ? 'text-red-600' : 'text-gray-600'}`}>
                    ТТР распред. щита {item.has_va ? <span className="text-red-500">*</span> : ''}
                  </label>
                  <select value={item.ttr_or_id || ''} onChange={e => update('ttr_or_id', parseInt(e.target.value) || null)} disabled={!canEdit} className={`w-full px-3 py-2 border rounded-lg ${errors.ttr_or_id ? 'border-red-500 bg-red-50' : ''}`}>
                    <option value="">—</option>
                    {ttrRes.filter(t => t.ttr_type === 'OR').map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
                  </select>
                  {errors.ttr_or_id && <p className="text-red-500 text-xs mt-1"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> {errors.ttr_or_id}</p>}
                </div>
              </div>
              {/* ТТР для ТТ (У-27) — автоматически только при выборе У-25 */}
              {item.status === 'ZAMENA' && ttrRes.some(t => 
                (t.id === item?.ttr_ou_id || t.id === item?.ttr_ol_id || t.id === item?.ttr_or_id) && t.code && t.code.trim() === 'У-25'
              ) && (() => {
                const ttTtr = ttrRes.find(t => t.code && t.code.trim() === 'У-27')
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <label className="block text-sm font-medium text-amber-700 mb-1"><Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ТТР для ТТ</label>
                    <div className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-100 font-medium text-amber-900">
                      {ttTtr ? `${ttTtr.code} — ${ttTtr.name}` : 'У-27 (не найден в справочнике)'}
                    </div>
                    <p className="text-xs text-amber-600 mt-1">Назначен автоматически для ПУ с трансформаторами тока</p>
                  </div>
                )
              })()}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">СМР выполнил</label>
                  {isOks ? (
                    <input type="text" value="ОКС" disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50 font-medium" />
                  ) : (
                    <select value={item.smr_executor || ''} onChange={e => update('smr_executor', e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">—</option>
                      <option value="РСК">РСК</option>
                      <option value="ЭСК">ЭСК</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Дата СМР</label>
                  <input type="date" value={item.smr_date || ''} onChange={e => update('smr_date', e.target.value)} disabled={!canEdit} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </>
          )}

          {/* ТТР для ЭСК */}
          {/* Параметры СМР/ЛСР для ЭСК */}
{/* Параметры СМР/ЛСР для ЭСК */}
{isEsk && item.status !== 'SKLAD' && (
  <>
    <hr />
    <h3 className="font-medium">Параметры СМР/ЛСР</h3>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Фазность</label>
        <input type="text" value={item.faza || '—'} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Форм-фактор *</label>
        <select value={item.form_factor || ''} onChange={e => update('form_factor', e.target.value)} disabled={!canEdit} className={`w-full px-3 py-2 border rounded-lg ${errors.form_factor ? 'border-red-500 bg-red-50' : ''}`}>
          <option value="">Выберите...</option>
          <option value="split">Сплит</option>
          <option value="classic">Классика</option>
        </select>
      </div>
    </div>
    
    {/* Трубостойка */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Трубостойка</label>
        <div className="flex gap-4 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name={`trubostoyka-${item.id}`}
              checked={item.trubostoyka === true} 
              onChange={() => update('trubostoyka', true)} 
              disabled={!canEdit} 
            />
            <span>Да</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name={`trubostoyka-${item.id}`}
              checked={item.trubostoyka !== true} 
              onChange={() => update('trubostoyka', false)} 
              disabled={!canEdit} 
            />
            <span>Нет</span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Щит с ВА *</label>
         <select value={item.va_type || ''} onChange={e => update('va_type', e.target.value)} disabled={!canEdit || item.trubostoyka === true} className={`w-full px-3 py-2 border rounded-lg ${errors.va_type ? 'border-red-500 bg-red-50' : ''}`}>
          <option value="">Выберите...</option>
          {item.trubostoyka !== true && <option value="opora">Опора</option>}
          {item.trubostoyka !== true && <option value="fasad">Фасад</option>}
         <option value="trubostoyka">Трубостойка</option>
       </select>
     </div>
    </div>
    
    {/* ЛСР Трубостойки (если выбрана) */}
    {item.trubostoyka === true && item.lsr_truba && (
      <div className="bg-orange-50 rounded-lg p-3">
        <div className="text-sm font-medium text-orange-700 mb-2"><Icon name="wrench" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Трубостойка</div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="text-gray-600">ЛСР:</span> <span className="font-medium">{item.lsr_truba}</span></div>
          <div><span className="text-gray-600">Без НДС:</span> <span className="font-medium">{item.price_truba_no_nds?.toLocaleString()} ₽</span></div>
          <div><span className="text-gray-600">С НДС:</span> <span className="font-medium">{item.price_truba_with_nds?.toLocaleString()} ₽</span></div>
        </div>
      </div>
    )}
    
    {/* ЛСР по критериям ВА */}
    {item.faza && item.form_factor && item.va_type && item.lsr_va && (
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="text-sm font-medium text-blue-700 mb-2"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Щит с ВА</div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="text-gray-600">ЛСР:</span> <span className="font-medium">{item.lsr_va}</span></div>
          <div><span className="text-gray-600">Без НДС:</span> <span className="font-medium">{item.price_va_no_nds?.toLocaleString()} ₽</span></div>
          <div><span className="text-gray-600">С НДС:</span> <span className="font-medium">{item.price_va_with_nds?.toLocaleString()} ₽</span></div>
        </div>
      </div>
    )}
    
    {/* ИТОГО */}
    {(item.lsr_truba || item.lsr_va) && (
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <div className="text-sm font-medium text-green-800 mb-2"><Icon name="ruble" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ИТОГО</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-gray-600 text-sm">Без НДС</div>
            <div className="text-xl font-bold text-green-700">{((item.price_truba_no_nds || 0) + (item.price_va_no_nds || 0)).toLocaleString()} ₽</div>
          </div>
          <div className="text-center">
            <div className="text-gray-600 text-sm">С НДС</div>
            <div className="text-xl font-bold text-green-700">{((item.price_truba_with_nds || 0) + (item.price_va_with_nds || 0)).toLocaleString()} ₽</div>
          </div>
        </div>
      </div>
    )}
    
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">СМР выполнил (мастер) *</label>
        <select value={item.smr_master_id || ''} onChange={e => update('smr_master_id', parseInt(e.target.value) || null)} disabled={!canEdit} className={`w-full px-3 py-2 border rounded-lg ${errors.smr_master_id ? 'border-red-500 bg-red-50' : ''}`}>
          <option value="">—</option>
          {masters.filter(m => !item.current_unit_id || m.unit_id === item.current_unit_id).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Дата СМР *</label>
        <input type="date" value={item.smr_date || ''} onChange={e => update('smr_date', e.target.value)} disabled={!canEdit} className={`w-full px-3 py-2 border rounded-lg ${errors.smr_date ? 'border-red-500 bg-red-50' : ''}`} />
      </div>
    </div>
  </>
)}

{/* ВА и ТТ для РЭС / ОКС */}
{isResLike && item.status !== 'SKLAD' && canEdit && (
  <div className="border-t pt-4 mt-4">
    <h4 className="font-medium text-gray-700 mb-3"><Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Оборудование</h4>
    <div className="grid grid-cols-2 gap-4">
      {/* ВА */}
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={item?.has_va || false} 
            onChange={e => setItem(prev => ({ 
              ...prev, 
              has_va: e.target.checked,
              va_nominal_id: e.target.checked ? prev.va_nominal_id : null 
            }))} 
          />
          <span className="text-sm font-medium">ВА (автомат)</span>
        </label>
        {item?.has_va && (
          <div className="space-y-2">
            <select 
              value={item?.va_nominal_id || ''} 
              onChange={e => setItem(prev => ({ ...prev, va_nominal_id: parseInt(e.target.value) || null }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Выберите номинал ВА...</option>
              {vaNominals.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Кол-во:</label>
              <select
                value={item?.va_quantity || 1}
                onChange={e => setItem(prev => ({ ...prev, va_quantity: parseInt(e.target.value) }))}
                className="px-3 py-1 border rounded-lg text-sm w-20"
              >
                <option value={1}>1 шт</option>
                <option value={2}>2 шт</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      {/* ТТ - показываем только если выбран ТТР с use_tt */}
      {ttrRes.some(t => 
        (t.id === item?.ttr_ou_id || t.id === item?.ttr_ol_id || t.id === item?.ttr_or_id) && t.use_tt
      ) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={item?.has_tt || false} 
              onChange={e => setItem(prev => ({ 
                ...prev, 
                has_tt: e.target.checked,
                tt_nominal_id: e.target.checked ? prev.tt_nominal_id : null 
              }))} 
            />
            <span className="text-sm font-medium">ТТ (трансформатор тока)</span>
          </label>
          {item?.has_tt && (
            <select 
              value={item?.tt_nominal_id || ''} 
              onChange={e => setItem(prev => ({ ...prev, tt_nominal_id: parseInt(e.target.value) || null }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Выберите номинал ТТ...</option>
              {ttNominals.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Трубостойка — только для ОКС */}
      {isOks && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={item?.trubostoyka || false} 
              onChange={e => setItem(prev => ({ ...prev, trubostoyka: e.target.checked }))} 
            />
            <span className="text-sm font-medium">Трубостойка</span>
          </label>
        </div>
      )}
    </div>
  </div>
)}
          
          {/* Материалы для РЭС / ОКС */}
{isResLike && item.status !== 'SKLAD' && materials.length > 0 && (
  <>
    <hr />
    <h3 className="font-medium"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Материалы</h3>
    {loadingMaterials ? (
      <div className="text-center py-4 text-gray-500">Загрузка...</div>
    ) : (
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2 text-left">Материал</th>
              <th className="px-3 py-2 text-left w-16">Ед.</th>
              <th className="px-3 py-2 text-center w-20">Норма</th>
              <th className="px-3 py-2 text-center w-24">Факт</th>
            </tr>
          </thead>
          <tbody>
            {materials.map(m => (
              <tr key={m.material_id} className={`border-t ${!m.used ? 'opacity-50 bg-gray-50' : ''}`}>
                <td className="px-3 py-2 text-center">
                  <input 
                    type="checkbox" 
                    checked={m.used} 
                    onChange={() => toggleMaterialUsed(m.material_id)}
                    disabled={!canEdit}
                  />
                </td>
                <td className="px-3 py-2">{m.material_name}</td>
                <td className="px-3 py-2 text-gray-500">{m.unit}</td>
                <td className="px-3 py-2 text-center text-gray-400">{m.default_qty || m.quantity}</td>
                <td className="px-3 py-2">
                  <input 
                    type="number" 
                    value={m.quantity} 
                    onChange={e => updateMaterialQty(m.material_id, e.target.value)}
                    disabled={!canEdit || !m.used}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0"
                    step="0.1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
)}

          {/* Номер ТЗ и Заявки */}
            <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Номер ТЗ</label>
              <input type="text" value={item.tz_number || '—'} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Номер заявки ЭСК</label>
              <input type="text" value={item.request_number || '—'} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-50" />
            </div>
          </div>

{/* Блокировка по ТЗ */}
{hasTZ && (
  <div className={`p-4 rounded-lg ${isSueAdmin ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
    <div className="flex justify-between items-center">
      <span className={isSueAdmin ? 'text-amber-700 font-medium' : 'text-blue-700 font-medium'}>
        {isSueAdmin 
          ? `ТЗ: ${item.tz_number} — редактирование доступно (админ СУЭ)` 
          : `ТЗ: ${item.tz_number} — редактирование заблокировано`}
      </span>
      {isSueAdmin && (
        <button 
          onClick={async () => {
            const code = prompt('Введите код администратора для снятия ТЗ:')
            if (code) {
              try {
                await api.put(`/pu/items/${item.id}`, { tz_number: null })
                alert('ТЗ снят, карточка разблокирована')
                onClose()
              } catch (err) {
                alert(err.response?.data?.detail || 'Ошибка')
              }
            }
          }}
          className="px-3 py-1 bg-orange-500 text-white rounded-lg text-sm"
        >
          <Icon name="unlock" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Снять ТЗ
        </button>
      )}
    </div>
  </div>
)}
          
          {/* Согласование */}
{item.approval_status && item.approval_status !== 'NONE' && (
  <div className={`p-4 rounded-lg ${
    item.approval_status === 'APPROVED' ? 'bg-green-50 border border-green-200' : 
    item.approval_status === 'REJECTED' ? 'bg-red-50 border border-red-200' :
    'bg-yellow-50 border border-yellow-200'
  }`}>
    <div className="flex justify-between items-center">
      <span className={
        item.approval_status === 'APPROVED' ? 'text-green-700 font-medium' : 
        item.approval_status === 'REJECTED' ? 'text-red-700 font-medium' :
        'text-yellow-700'
      }>
        {item.approval_status === 'APPROVED' && (isSueAdmin ? 'Согласовано — редактирование доступно (админ СУЭ)' : 'Согласовано — редактирование заблокировано')}
        {item.approval_status === 'PENDING' && 'На согласовании'}
        {item.approval_status === 'REJECTED' && 'Отклонено — требуется исправление'}
      </span>
      {item.approval_status === 'APPROVED' && isSueAdmin && (
        <button 
          onClick={async () => {
            const code = prompt('Введите код администратора для разблокировки:')
            if (code) {
              try {
                await api.post(`/pu/items/${item.id}/unlock`, { admin_code: code })
                setItem({ ...item, approval_status: 'NONE' })
                alert('Карточка разблокирована')
              } catch (err) {
                alert(err.response?.data?.detail || 'Ошибка')
              }
            }
          }}
          className="px-3 py-1 bg-orange-500 text-white rounded-lg text-sm"
        >
          <Icon name="unlock" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Разблокировать
        </button>
      )}
    </div>
    {item.approval_status === 'REJECTED' && item.rejection_comment && (
      <div className="mt-3 p-3 bg-white rounded border border-red-200">
        <div className="text-sm text-red-600 font-medium mb-1"><Icon name="fileEdit" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Причина отклонения:</div>
        <div className="text-sm text-gray-700">{item.rejection_comment}</div>
      </div>
    )}
  </div>
)}
        </div>

        {canEdit && (
          <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Отмена</button>
            {(isEsk || isOks) && item.status === 'TECHPRIS' && item.approval_status !== 'APPROVED' && item.approval_status !== 'PENDING' && (
              <button onClick={handleSendApproval} disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">
                <Icon name="send" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> На согласование
              </button>
            )}
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== ЗАГРУЗКА РЕЕСТРА ====================
function UploadPage() {
  const { canUpload } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [registers, setRegisters] = useState([])

  useEffect(() => { api.get('/pu/registers').then(r => setRegisters(r.data)) }, [])

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/pu/upload-template', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'Шаблон_Загрузки_ПУ.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Ошибка при скачивании шаблона')
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await api.post('/pu/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(r.data)
      setFile(null)
      api.get('/pu/registers').then(r => setRegisters(r.data))
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setLoading(false)
  }

  if (!canUpload) return <div className="text-center py-12 text-gray-500">Нет доступа</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Загрузка реестра ПУ</h1>

      <div className="bg-white rounded-xl border p-8">
        {result ? (
          <div className="text-center">
            <div className="mb-4 flex justify-center"><span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600"><Icon name="checkCircle" className="w-9 h-9" /></span></div>
            <h3 className="text-xl font-semibold">Загружено {result.items_count} ПУ</h3>
            <p className="text-gray-500">Файл: {result.filename}</p>
            {result.skipped_duplicates > 0 && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg text-left">
                <p className="text-orange-700 font-medium"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Пропущено дубликатов: {result.skipped_duplicates}</p>
                {result.duplicate_serials && result.duplicate_serials.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-orange-600">Серийные номера:</p>
                    <div className="text-xs text-orange-500 max-h-32 overflow-y-auto mt-1">
                      {result.duplicate_serials.join(', ')}
                      {result.skipped_duplicates > 20 && <span> и ещё {result.skipped_duplicates - 20}...</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setResult(null)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Загрузить ещё</button>
          </div>
        ) : (
          <div className="text-center">
            <div className="mb-4 flex justify-center"><span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400"><Icon name="chart" className="w-9 h-9" /></span></div>
            {file ? <p className="mb-4 font-medium">{file.name}</p> : <p className="mb-4 text-gray-500">Выберите Excel файл (.xlsx, .xls)</p>}
            <div className="flex justify-center gap-3">
              <label className="px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200">
                {file ? 'Выбрать другой' : 'Выбрать файл'}
                <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files[0])} className="hidden" />
              </label>
              {file && <button onClick={handleUpload} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{loading ? 'Загрузка...' : 'Загрузить'}</button>}
            </div>
            <p className="mt-4 text-sm text-gray-400">Ожидаемые колонки: Заводской номер ПУ, Тип прибора учета, Подразделение</p>
            <button onClick={handleDownloadTemplate} className="mt-3 px-4 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Скачать шаблон Excel</button>
          </div>
        )}
      </div>

      {registers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">История загрузок</h2>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Файл</th><th className="px-4 py-3 text-left">Кол-во</th><th className="px-4 py-3 text-left">Дата</th></tr></thead>
              <tbody>
                {registers.map(r => <tr key={r.id} className="border-t"><td className="px-4 py-3">{r.filename}</td><td className="px-4 py-3">{r.items_count}</td><td className="px-4 py-3 text-gray-500">{new Date(r.uploaded_at).toLocaleString('ru')}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== СОГЛАСОВАНИЕ ====================
function ReviewField({ label, value }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium break-words">{value || '—'}</div>
    </div>
  )
}

function ReviewDetail({ detail, source, loading }) {
  if (loading) return <div className="py-4 text-center text-gray-500">Загрузка содержимого…</div>
  if (!detail) return <div className="py-4 text-center text-gray-400">Нет данных</div>
  if (detail.error) return <div className="py-4 text-center text-red-500">{detail.error}</div>

  const isOks = source === 'ОКС'
  const statusLabel = detail.status === 'TECHPRIS' ? 'Техприс' : detail.status === 'ZAMENA' ? 'Замена' : detail.status === 'IZHC' ? 'ИЖЦ' : detail.status === 'SKLAD' ? 'Склад' : (detail.status || '—')

  return (
    <div className="space-y-4">
      {/* Общие данные */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReviewField label="Статус" value={statusLabel} />
        <ReviewField label="Фазность" value={detail.faza} />
        <ReviewField label="Напряжение" value={detail.voltage} />
        <ReviewField label="Мощность, кВт" value={detail.power} />
        <ReviewField label="Адрес" value={detail.address} />
        <ReviewField label="Дата СМР" value={detail.smr_date} />
        <ReviewField label="СМР выполнил" value={detail.smr_executor} />
        {detail.smr_master && <ReviewField label="Мастер" value={detail.smr_master} />}
      </div>

      {isOks ? (
        <>
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2"><Icon name="ruler" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ТТР</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ReviewField label="Орг. учёта" value={detail.ttr_ou} />
              <ReviewField label="Обуст. линии" value={detail.ttr_ol} />
              <ReviewField label="Распред. щит" value={detail.ttr_or} />
              <ReviewField label="ТТ" value={detail.ttr_tt} />
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2"><Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Оборудование</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ReviewField label="ВА (автомат)" value={detail.has_va ? `${detail.va_nominal || '—'}${detail.va_quantity ? ' × ' + detail.va_quantity + ' шт' : ''}` : 'Нет'} />
              <ReviewField label="ТТ" value={detail.has_tt ? (detail.tt_nominal || 'Да') : 'Нет'} />
              <ReviewField label="Трубостойка" value={detail.trubostoyka ? 'Да' : 'Нет'} />
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Материалы</div>
            {(!detail.materials || detail.materials.length === 0) ? (
              <div className="text-sm text-gray-400">Материалы не указаны</div>
            ) : (
              <div className="border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Материал</th>
                      <th className="px-3 py-2 text-left w-16">Ед.</th>
                      <th className="px-3 py-2 text-center w-24">Факт</th>
                      <th className="px-3 py-2 text-center w-28">Использован</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.materials.map((m, idx) => (
                      <tr key={idx} className={`border-t ${!m.used ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2 text-gray-500">{m.unit}</td>
                        <td className="px-3 py-2 text-center">{m.quantity}</td>
                        <td className="px-3 py-2 text-center">{m.used ? <Icon name="check" className="w-4 h-4 inline-block text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2"><Icon name="ruler" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Параметры ЭСК</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ReviewField label="Форм-фактор" value={detail.form_factor === 'split' ? 'Сплит' : detail.form_factor === 'classic' ? 'Классика' : detail.form_factor} />
            <ReviewField label="Щит с ВА" value={detail.va_type} />
            <ReviewField label="Трубостойка" value={detail.trubostoyka ? 'Да' : 'Нет'} />
            <ReviewField label="ЛСР ВА" value={detail.lsr_va} />
            <ReviewField label="ЛСР трубостойки" value={detail.lsr_truba} />
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewModal({ item, onClose, onApprove, onReject }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/pu/items/${item.id}/review`)
      .then(r => setDetail(r.data))
      .catch(err => setDetail({ error: err.response?.data?.detail || 'Ошибка загрузки' }))
      .finally(() => setLoading(false))
  }, [item.id])

  const doApprove = async () => {
    setBusy(true)
    try { await onApprove(item.id) } finally { setBusy(false) }
  }
  const doReject = async () => {
    if (!comment.trim()) { alert('Укажите причину отклонения'); return }
    setBusy(true)
    try { await onReject(item.id, comment.trim()) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Рассмотрение карточки ПУ</h2>
            <p className="text-sm text-gray-500 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${item.source === 'ОКС' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>{item.source || 'ЭСК'}</span>
              <span className="font-mono">{item.serial_number}</span>{item.res_name ? ` · ${item.res_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ReviewField label="Серийный номер" value={item.serial_number} />
            <ReviewField label="Тип ПУ" value={item.pu_type} />
            <ReviewField label="Потребитель" value={item.consumer} />
            <ReviewField label="Договор" value={item.contract_number} />
          </div>
          <hr />
          <ReviewDetail detail={detail} source={item.source} loading={loading} />
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4">
          {rejecting ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-red-700">Причина отклонения *</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Опишите, что нужно исправить..." className="w-full px-3 py-2 border rounded-lg" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejecting(false)} disabled={busy} className="px-4 py-2 bg-gray-200 rounded-lg">Назад</button>
                <button onClick={doReject} disabled={busy} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">Подтвердить отклонение</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button onClick={onClose} disabled={busy} className="px-4 py-2 bg-gray-200 rounded-lg">Закрыть</button>
              <button onClick={() => setRejecting(true)} disabled={busy} className="px-4 py-2 bg-red-500 text-white rounded-lg disabled:opacity-50"><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Не согласовать</button>
              <button onClick={doApprove} disabled={busy} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{busy ? '...' : 'Согласовать'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ApprovalPage() {
  const { canApprove, isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState(null)
  const [reviewModal, setReviewModal] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [details, setDetails] = useState({})
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => { load() }, [])

  const load = () => {
    setLoading(true)
    setExpanded(null)
    setDetails({})
    api.get('/pu/pending-approval').then(r => { setItems(r.data); setLoading(false) })
  }

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!details[id]) {
      setLoadingDetail(true)
      try {
        const r = await api.get(`/pu/items/${id}/review`)
        setDetails(prev => ({ ...prev, [id]: r.data }))
      } catch (err) {
        setDetails(prev => ({ ...prev, [id]: { error: err.response?.data?.detail || 'Ошибка загрузки' } }))
      }
      setLoadingDetail(false)
    }
  }

  const handleExport = async () => {
  try {
    const response = await api.get('/pu/pending-approval/export', { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `На_согласовании_${new Date().toISOString().slice(0,10)}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    alert('Ошибка выгрузки: ' + (err.response?.data?.detail || err.message))
  }
}

  const handleApprove = async (id) => {
    try {
      await api.post(`/pu/items/${id}/approve`)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  const handleReject = async (id, comment) => {
    try {
      await api.post(`/pu/items/${id}/reject`, { comment })
      setRejectModal(null)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  if (!canApprove) return <div className="text-center py-12 text-gray-500">Нет доступа</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Согласование СМР</h1>
          <p className="text-gray-500">ПУ от ЭСК и ОКС на проверку</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Выгрузить в Excel</button>
          <button onClick={load} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Icon name="refresh" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Обновить</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="p-8"><RossetiLoader /></div> : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Нет ПУ на согласовании</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="px-3 py-3 text-left">Источник</th>
                <th className="px-3 py-3 text-left">РЭС</th>
                <th className="px-3 py-3 text-left">Серийный номер</th>
                <th className="px-3 py-3 text-left">Тип ПУ</th>
                <th className="px-3 py-3 text-left">Потребитель</th>
                <th className="px-3 py-3 text-left">Договор</th>
                <th className="px-3 py-3 text-center">Фаза</th>
                <th className="px-3 py-3 text-center">Трубост.</th>
                <th className="px-3 py-3 text-left">№ ТТР ЭСК</th>
                <th className="px-3 py-3 text-left">Дата СМР</th>
                <th className="w-48"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <Fragment key={i.id}>
                <tr className="border-t hover:bg-gray-50">
                  <td className="px-2 py-3 text-center">
                    <button onClick={() => toggleExpand(i.id)} className="text-gray-500 hover:text-blue-600 text-lg leading-none" title="Показать содержимое">
                      {expanded === i.id ? '▾' : '▸'}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${i.source === 'ОКС' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>{i.source || 'ЭСК'}</span>
                  </td>
                  <td className="px-3 py-3">{i.res_name || '—'}</td>
                  <td className="px-3 py-3 font-mono">{i.serial_number}</td>
                  <td className="px-3 py-3 text-gray-600 max-w-xs truncate" title={i.pu_type}>{i.pu_type || '—'}</td>
                  <td className="px-3 py-3">{i.consumer || '—'}</td>
                  <td className="px-3 py-3">{i.contract_number || '—'}</td>
                  <td className="px-3 py-3 text-center">{i.faza || '—'}</td>
                  <td className="px-3 py-3 text-center">{i.trubostoyka ? <Icon name="check" className="w-4 h-4 inline-block text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-3">{i.lsr_va || i.lsr_truba || '—'}</td>
                  <td className="px-3 py-3">{i.smr_date || '—'}</td>
                  <td className="px-3 py-3">
                    {i.source === 'ОКС' ? (
                      <button onClick={() => setReviewModal(i)} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm whitespace-nowrap"><Icon name="search" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Рассмотреть</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(i.id)} className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm"><Icon name="check" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Согласовать</button>
                        <button onClick={() => setRejectModal(i)} className="px-3 py-1 bg-red-500 text-white rounded-lg text-sm"><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Отклонить</button>
                      </div>
                    )}
                  </td>
                </tr>
                {expanded === i.id && (
                  <tr className="bg-slate-50 border-t">
                    <td colSpan={12} className="px-6 py-4">
                      <ReviewDetail detail={details[i.id]} source={i.source} loading={loadingDetail && !details[i.id]} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejectModal && (
        <RejectModal 
          item={rejectModal} 
          onClose={() => setRejectModal(null)} 
          onReject={handleReject} 
        />
      )}

      {reviewModal && (
        <ReviewModal
          item={reviewModal}
          onClose={() => setReviewModal(null)}
          onApprove={async (id) => { await handleApprove(id); setReviewModal(null) }}
          onReject={async (id, comment) => { await handleReject(id, comment); setReviewModal(null) }}
        />
      )}
    </div>
  )
}

function RejectModal({ item, onClose, onReject }) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!comment.trim()) {
      alert('Укажите причину отклонения')
      return
    }
    setLoading(true)
    await onReject(item.id, comment)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">Отклонить ПУ</h2>
        <p className="text-gray-600 text-sm mb-4">Серийный номер: <span className="font-mono">{item.serial_number}</span></p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Причина отклонения *</label>
          <textarea 
            value={comment} 
            onChange={e => setComment(e.target.value)} 
            placeholder="Укажите что нужно исправить..."
            className="w-full px-3 py-2 border rounded-lg" 
            rows={4}
          />
        </div>
        
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={handleSubmit} disabled={loading || !comment.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Отклонение...' : 'Отклонить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== ТЕХНИЧЕСКИЕ ЗАДАНИЯ ====================
function TZPage() {
  const { isSueAdmin, isOksAdmin } = useAuth()
  const [tab, setTab] = useState('list')
  const [tzList, setTzList] = useState([])
  const [tzSort, setTzSort] = useState({ field: 'tz_number', dir: 'desc' })
  const [tzFilterType, setTzFilterType] = useState('')
  const [tzFilterUnit, setTzFilterUnit] = useState('')
  const [tzFilterTz, setTzFilterTz] = useState('')
  const [expandedTz, setExpandedTz] = useState(null)
  const [tzItems, setTzItems] = useState([])
  const [selectedTzItems, setSelectedTzItems] = useState([])
  const [removingFromTz, setRemovingFromTz] = useState(false)
  
  // Добавление ПУ в ТЗ
  const [showAddSearch, setShowAddSearch] = useState(false)
  const [addSearchQuery, setAddSearchQuery] = useState('')
  const [addSearchResults, setAddSearchResults] = useState([])
  const [addSearching, setAddSearching] = useState(false)
  const [selectedAddItems, setSelectedAddItems] = useState([])
  const [addingToTz, setAddingToTz] = useState(false)
  const [pendingItems, setPendingItems] = useState([])
  const [units, setUnits] = useState([])
  const [allSubUnits, setAllSubUnits] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('TECHPRIS')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [selectedPower, setSelectedPower] = useState('')
  const [selectedItems, setSelectedItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [customSuffix, setCustomSuffix] = useState('')
  const [previewTz, setPreviewTz] = useState('—')
  
  // Состояния для шага 2 (материалы)
  const [step, setStep] = useState(1)
  const [materialsData, setMaterialsData] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)

  useEffect(() => {
    api.get('/tz/list').then(r => setTzList(r.data))
    api.get('/units').then(r => {
      setUnits(r.data.filter(u => isOksAdmin ? (u.unit_type === 'OKS_UNIT') : (u.unit_type === 'RES')))
      setAllSubUnits(r.data.filter(u => u.unit_type === 'RES' || u.unit_type === 'OKS_UNIT'))
    })
  }, [])

  // Загрузка ПУ при изменении фильтров
  useEffect(() => {
    if (tab === 'create' && selectedUnit) {
      // Для Техприс нужна категория мощности
      if (selectedStatus === 'TECHPRIS' && selectedPower) {
        loadPending()
      }
      // Для Замен и ИЖЦ не нужна категория мощности
      if (selectedStatus !== 'TECHPRIS') {
        loadPending()
      }
    } else if (tab === 'create') {
      setPendingItems([])
    }
  }, [tab, selectedStatus, selectedUnit, selectedPower])

  // Обновление превью номера ТЗ
  useEffect(() => {
    if (selectedUnit) {
      const needPower = selectedStatus === 'TECHPRIS'
      if (needPower && !selectedPower) {
        setPreviewTz('—')
        return
      }
      
      const params = { status: selectedStatus, unit_id: selectedUnit }
      if (needPower) params.power_category = selectedPower
      
      api.get('/tz/next-number', { params }).then(r => {
        setPreviewTz(r.data.preview)
        if (!customSuffix) {
          setCustomSuffix(r.data.next_suffix)
        }
      }).catch(() => setPreviewTz('—'))
    } else {
      setPreviewTz('—')
    }
  }, [selectedStatus, selectedUnit, selectedPower])

  const loadPending = () => {
    const params = { status: selectedStatus, unit_id: selectedUnit }
    if (selectedStatus === 'TECHPRIS' && selectedPower) {
      params.power_category = selectedPower
    }
    api.get('/tz/pending', { params }).then(r => setPendingItems(r.data))
  }

  const toggleExpand = async (tzNumber) => {
    if (expandedTz === tzNumber) {
      setExpandedTz(null)
      setTzItems([])
      setSelectedTzItems([])
    } else {
      setExpandedTz(tzNumber)
      setSelectedTzItems([])
      setShowAddSearch(false)
      setAddSearchQuery('')
      setAddSearchResults([])
      setSelectedAddItems([])
      const r = await api.get(`/tz/${encodeURIComponent(tzNumber)}/items`)
      setTzItems(r.data)
    }
  }

const exportToExcel = async () => {
    if (!expandedTz) return
    try {
      const response = await api.get(`/tz/export?tz_number=${encodeURIComponent(expandedTz)}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const safeName = expandedTz.replace(/\//g, '_').replace(/\s/g, '_')
      link.setAttribute('download', `ТЗ_${safeName}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Ошибка выгрузки: ' + (err.response?.data?.detail || err.message))
    }
  }

  const removeFromTz = async () => {
    if (!expandedTz || selectedTzItems.length === 0) return
    if (!confirm(`Удалить ${selectedTzItems.length} ПУ из ТЗ ${expandedTz}?`)) return
    
    setRemovingFromTz(true)
    try {
      const r = await api.post('/tz/remove-items', { 
        item_ids: selectedTzItems, 
        tz_number: expandedTz 
      })
      alert(`Удалено из ТЗ: ${r.data.removed} шт.${r.data.remaining === 0 ? '\nТЗ полностью очищено.' : ` Осталось в ТЗ: ${r.data.remaining} шт.`}`)
      
      // Обновляем список ТЗ и элементы
      setSelectedTzItems([])
      const tzListR = await api.get('/tz/list')
      setTzList(tzListR.data)
      
      if (r.data.remaining > 0) {
        const itemsR = await api.get(`/tz/${encodeURIComponent(expandedTz)}/items`)
        setTzItems(itemsR.data)
      } else {
        setExpandedTz(null)
        setTzItems([])
      }
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message))
    } finally {
      setRemovingFromTz(false)
    }
  }

  // Поиск ПУ для добавления в ТЗ
  const searchForAdd = async (query) => {
    setAddSearchQuery(query)
    if (!query || query.length < 2 || !expandedTz) {
      setAddSearchResults([])
      return
    }
    setAddSearching(true)
    try {
      const r = await api.get('/tz/search-available', { params: { tz_number: expandedTz, q: query } })
      setAddSearchResults(r.data)
    } catch (err) {
      console.error(err)
      setAddSearchResults([])
    } finally {
      setAddSearching(false)
    }
  }

  // Добавить выбранные ПУ в ТЗ
  const addToTz = async () => {
    if (!expandedTz || selectedAddItems.length === 0) return
    if (!confirm(`Добавить ${selectedAddItems.length} ПУ в ТЗ ${expandedTz}?`)) return
    
    setAddingToTz(true)
    try {
      const r = await api.post('/tz/add-items', { item_ids: selectedAddItems, tz_number: expandedTz })
      alert(`Добавлено в ТЗ: ${r.data.added} шт. Всего в ТЗ: ${r.data.total} шт.`)
      
      // Обновляем
      setSelectedAddItems([])
      setAddSearchQuery('')
      setAddSearchResults([])
      setShowAddSearch(false)
      
      const tzListR = await api.get('/tz/list')
      setTzList(tzListR.data)
      const itemsR = await api.get(`/tz/${encodeURIComponent(expandedTz)}/items`)
      setTzItems(itemsR.data)
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message))
    } finally {
      setAddingToTz(false)
    }
  }

  // Получить превью номера ТЗ с учетом ручной корректировки
  const getPreviewTzNumber = () => {
    if (!selectedUnit) return '—'
    const unit = units.find(u => u.id === parseInt(selectedUnit))
    if (!unit || !unit.short_code) return '—'
    
    let prefix = ''
    if (selectedStatus === 'TECHPRIS') {
      if (!selectedPower) return '—'
      prefix = `ТП ${selectedPower}`
    } else if (selectedStatus === 'ZAMENA') {
      prefix = '522'
    } else if (selectedStatus === 'IZHC') {
      prefix = 'ИЖЦ'
    }
    
    const suffix = customSuffix || '01-26'
    const oksSuffix = (unit.unit_type === 'OKS_UNIT' || unit.unit_type === 'OKS') ? '-ОКС' : ''
    return `${prefix} ${unit.short_code}-${suffix}${oksSuffix}`
  }

  // Переход к шагу 2 — загрузка материалов
  const goToMaterials = async () => {
    if (selectedItems.length === 0) {
      alert('Выберите ПУ')
      return
    }
    setLoadingMaterials(true)
    try {
      const r = await api.post('/pu/items/materials-bulk', { item_ids: selectedItems })
    // Добавляем флаги для управления ВА/ТТ
    const dataWithFlags = r.data.map(pu => ({
      ...pu,
      va_used: pu.has_va,  // по умолчанию используем если есть
      tt_used: pu.has_tt   // по умолчанию используем если есть
    }))
setMaterialsData(dataWithFlags)
      setStep(2)
    } catch (err) {
      alert('Ошибка загрузки материалов: ' + (err.response?.data?.detail || err.message))
    }
    setLoadingMaterials(false)
  }

  // Обновление материала в конкретном ПУ
  const updateMaterial = (puId, materialId, field, value) => {
    setMaterialsData(prev => prev.map(pu => {
      if (pu.id !== puId) return pu
      return {
        ...pu,
        materials: pu.materials.map(m => {
          if (m.material_id !== materialId) return m
          return { ...m, [field]: value }
        })
      }
    }))
  }

  // Сохранить материалы одного ПУ
  const saveSinglePU = async (puId) => {
    const puData = materialsData.find(p => p.id === puId)
    if (!puData) return
    
    try {
      await api.post('/pu/items/materials-bulk/save', {
        items: [{ item_id: puId, materials: puData.materials }]
      })
      alert('Сохранено')
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message))
    }
  }

  // Сохранить все материалы
const saveAllMaterials = async () => {
  try {
    await api.post('/pu/items/materials-bulk/save', {
      items: materialsData.map(pu => ({ 
        item_id: pu.id, 
        materials: pu.materials,
        va_used: pu.va_used,
        va_quantity: pu.va_quantity || 1,
        tt_used: pu.tt_used
      }))
    })
    alert('Все материалы сохранены')
  } catch (err) {
    alert('Ошибка: ' + (err.response?.data?.detail || err.message))
  }
}

  // Создать ТЗ (финальный шаг)
  const handleCreate = async () => {
    if (!selectedUnit || selectedItems.length === 0) {
      alert('Выберите подразделение и ПУ')
      return
    }
    if (selectedStatus === 'TECHPRIS' && !selectedPower) {
      alert('Выберите категорию мощности')
      return
    }
    
    // Сначала сохраняем материалы
    await saveAllMaterials()
    
    setLoading(true)
    try {
      const payload = { 
        item_ids: selectedItems, 
        unit_id: parseInt(selectedUnit),
        status: selectedStatus
      }
      if (selectedStatus === 'TECHPRIS') {
        payload.power_category = parseInt(selectedPower)
      }
      if (customSuffix) {
        payload.custom_suffix = customSuffix
      }
      
      const r = await api.post('/tz/create', payload)
      alert(`Создано ТЗ: ${r.data.tz_number}`)
      setSelectedItems([])
      setStep(1)
      setMaterialsData([])
      setCustomSuffix('')
      api.get('/tz/list').then(r => setTzList(r.data))
      loadPending()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setLoading(false)
  }

  // Подсчёт итого по материалам
  const getTotalMaterials = () => {
    const totals = {}
    materialsData.forEach(pu => {
      pu.materials.forEach(m => {
        if (m.used) {
          if (!totals[m.material_id]) {
            totals[m.material_id] = { name: m.material_name, unit: m.unit, quantity: 0 }
          }
          totals[m.material_id].quantity += m.quantity || 0
        }
      })
    })
    return Object.values(totals)
  }

  // Сброс при смене статуса
  const handleStatusChange = (newStatus) => {
    setSelectedStatus(newStatus)
    setSelectedPower('')
    setSelectedItems([])
    setCustomSuffix('')
    setPendingItems([])
  }

  if (!isSueAdmin && !isOksAdmin) return <div className="text-center py-12 text-gray-500">Нет доступа</div>

  const statusLabels = { TECHPRIS: 'Техприс', ZAMENA: 'Замена', IZHC: 'ИЖЦ' }
  const needPowerCategory = selectedStatus === 'TECHPRIS'
  // ТЗ ОКС помечены суффиксом "-ОКС" в конце. Управлять (добавлять/исключать ПУ) можно только своими ТЗ
  const canManageTz = (tz) => {
    const isOksTz = (tz.tz_number || '').endsWith('-ОКС')
    return (isSueAdmin && !isOksTz) || (isOksAdmin && isOksTz)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Технические задания</h1>

      <div className="flex gap-2 border-b">
        <button onClick={() => { setTab('list'); setStep(1) }} className={`px-4 py-2 border-b-2 ${tab === 'list' ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}><Icon name="clipboard" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Реестр ТЗ</button>
        <button onClick={() => { setTab('create'); setStep(1) }} className={`px-4 py-2 border-b-2 ${tab === 'create' ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Формирование</button>
      </div>

      {tab === 'list' && (() => {
        // Фильтрация
        const filtered = tzList.filter(tz => {
          if (tzFilterType && tz.status !== tzFilterType) return false
          if (tzFilterUnit && tz.unit_name !== tzFilterUnit) return false
          if (tzFilterTz && tz.tz_number !== tzFilterTz) return false
          return true
        })
        // Уникальные значения для фильтров (из текущего отфильтрованного контекста)
        const availableTypes = [...new Set(tzList.filter(tz => !tzFilterUnit || tz.unit_name === tzFilterUnit).map(tz => tz.status))].sort()
        const availableUnits = [...new Set([
          ...tzList.filter(tz => !tzFilterType || tz.status === tzFilterType).map(tz => tz.unit_name).filter(Boolean),
          ...allSubUnits.map(u => u.name)
        ])].sort()
        const availableTz = [...new Set(filtered.map(tz => tz.tz_number))].sort()
        const hasFilters = tzFilterType || tzFilterUnit || tzFilterTz

        return (
        <div className="space-y-3">
          {/* Панель фильтров */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-gray-500 font-medium">Фильтры:</span>
              <select value={tzFilterType} onChange={e => { setTzFilterType(e.target.value); setTzFilterTz('') }} className="px-3 py-2 border rounded-lg text-sm">
                <option value="">Все типы</option>
                {availableTypes.map(s => <option key={s} value={s}>{statusLabels[s] || s}</option>)}
              </select>
              <select value={tzFilterUnit} onChange={e => { setTzFilterUnit(e.target.value); setTzFilterTz('') }} className="px-3 py-2 border rounded-lg text-sm">
                <option value="">Все подразделения</option>
                {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={tzFilterTz} onChange={e => setTzFilterTz(e.target.value)} className="px-3 py-2 border rounded-lg text-sm min-w-[200px]">
                <option value="">Все ТЗ ({filtered.length})</option>
                {availableTz.map(tn => <option key={tn} value={tn}>{tn}</option>)}
              </select>
              {hasFilters && (
                <button onClick={() => { setTzFilterType(''); setTzFilterUnit(''); setTzFilterTz('') }} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">
                  <Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Сбросить
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">{tzList.length === 0 ? 'Нет сформированных ТЗ' : 'Нет ТЗ по выбранным фильтрам'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  {[
                    { field: 'tz_number', label: 'Номер ТЗ' },
                    { field: 'status', label: 'Тип' },
                    { field: 'unit_name', label: 'Подразделение' },
                    { field: 'count', label: 'Кол-во ПУ' },
                  ].map(col => (
                    <th key={col.field} className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 select-none" onClick={() => setTzSort(prev => ({ field: col.field, dir: prev.field === col.field && prev.dir === 'asc' ? 'desc' : 'asc' }))}>
                      {col.label} {tzSort.field === col.field ? (tzSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...filtered].sort((a, b) => {
                  const av = a[tzSort.field] ?? ''
                  const bv = b[tzSort.field] ?? ''
                  const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ru')
                  return tzSort.dir === 'asc' ? cmp : -cmp
                }).map((tz, idx) => (
                  <Fragment key={tz.tz_number || idx}>
                    <tr className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(tz.tz_number)}>
                      <td className="px-4 py-3">{expandedTz === tz.tz_number ? '▼' : '▶'}</td>
                      <td className="px-4 py-3 font-medium">{tz.tz_number}</td>
                      <td className="px-4 py-3">{statusLabels[tz.status] || tz.status}</td>
                      <td className="px-4 py-3">{tz.unit_name || '—'}</td>
                      <td className="px-4 py-3">{tz.count}</td>
                    </tr>
                    {expandedTz === tz.tz_number && (
                      <tr>
                        <td colSpan={5} className="bg-gray-50 p-4">
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-medium">ПУ в ТЗ {tz.tz_number}</span>
                            <div className="flex gap-2">
                              {canManageTz(tz) && selectedTzItems.length > 0 && (
                                <button 
                                  onClick={removeFromTz} 
                                  disabled={removingFromTz}
                                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
                                >
                                  {removingFromTz ? 'Удаление...' : `Удалить из ТЗ (${selectedTzItems.length})`}
                                </button>
                              )}
                              {canManageTz(tz) && (
                                <button 
                                  onClick={() => { setShowAddSearch(!showAddSearch); setAddSearchQuery(''); setAddSearchResults([]); setSelectedAddItems([]) }}
                                  className={`px-3 py-1 ${showAddSearch ? 'bg-gray-500' : 'bg-blue-600'} text-white rounded-lg text-sm`}
                                >
                                  {showAddSearch ? 'Закрыть поиск' : 'Добавить ПУ'}
                                </button>
                              )}
                              <button onClick={exportToExcel} className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Выгрузить в Excel</button>
                            </div>
                          </div>
                          <table className="w-full text-sm bg-white rounded-lg overflow-hidden">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="w-10 px-3 py-2">
                                  <input 
                                    type="checkbox" 
                                    checked={tzItems.length > 0 && selectedTzItems.length === tzItems.length}
                                    onChange={() => setSelectedTzItems(selectedTzItems.length === tzItems.length ? [] : tzItems.map(i => i.id))}
                                  />
                                </th>
                                <th className="px-3 py-2 text-left">№</th>
                                <th className="px-3 py-2 text-left">Серийный номер</th>
                                <th className="px-3 py-2 text-left">Тип</th>
                                <th className="px-3 py-2 text-left">ЛС</th>
                                <th className="px-3 py-2 text-left">Потребитель</th>
                                <th className="px-3 py-2 text-left">Адрес</th>
                                <th className="px-3 py-2 text-left">Мощность</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tzItems.map((item, i) => (
                                <tr key={item.id} className={`border-t ${selectedTzItems.includes(item.id) ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2">
                                    <input 
                                      type="checkbox" 
                                      checked={selectedTzItems.includes(item.id)}
                                      onChange={() => setSelectedTzItems(s => s.includes(item.id) ? s.filter(x => x !== item.id) : [...s, item.id])}
                                    />
                                  </td>
                                  <td className="px-3 py-2">{i + 1}</td>
                                  <td className="px-3 py-2 font-mono">{item.serial_number}</td>
                                  <td className="px-3 py-2 max-w-xs truncate" title={item.pu_type}>{item.pu_type || '—'}</td>
                                  <td className="px-3 py-2">{item.ls_number || '—'}</td>
                                  <td className="px-3 py-2">{item.consumer || '—'}</td>
                                  <td className="px-3 py-2 max-w-xs truncate" title={item.address}>{item.address || '—'}</td>
                                  <td className="px-3 py-2">{item.power ? `${item.power} кВт` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          
                          {/* Панель добавления ПУ в ТЗ */}
                          {showAddSearch && (
                            <div className="mt-4 border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="font-medium text-blue-800"><Icon name="search" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Поиск ПУ для добавления в ТЗ</h4>
                                <button 
                                  onClick={() => { setShowAddSearch(false); setAddSearchQuery(''); setAddSearchResults([]); setSelectedAddItems([]) }}
                                  className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white rounded-lg text-sm"
                                ><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Закрыть</button>
                              </div>
                              <div className="flex gap-2 mb-3">
                                <input 
                                  type="text"
                                  value={addSearchQuery}
                                  onChange={e => searchForAdd(e.target.value)}
                                  placeholder="Введите серийный номер, договор или ЛС (мин. 2 символа)..."
                                  className="flex-1 px-3 py-2 border rounded-lg"
                                  autoFocus
                                />
                                {selectedAddItems.length > 0 && (
                                  <button 
                                    onClick={addToTz}
                                    disabled={addingToTz}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                  >
                                    {addingToTz ? 'Добавление...' : `Добавить (${selectedAddItems.length})`}
                                  </button>
                                )}
                              </div>
                              
                              {addSearching && <div className="text-center py-3 text-gray-500">Поиск...</div>}
                              
                              {!addSearching && addSearchQuery.length >= 2 && addSearchResults.length === 0 && (
                                <div className="text-center py-3 text-gray-500">Ничего не найдено. ПУ должен быть без ТЗ и из того же РЭС.</div>
                              )}
                              
                              {addSearchResults.length > 0 && (
                                <table className="w-full text-sm bg-white rounded-lg overflow-hidden border">
                                  <thead className="bg-blue-100">
                                    <tr>
                                      <th className="w-10 px-3 py-2">
                                        <input 
                                          type="checkbox"
                                          checked={addSearchResults.length > 0 && selectedAddItems.length === addSearchResults.length}
                                          onChange={() => setSelectedAddItems(selectedAddItems.length === addSearchResults.length ? [] : addSearchResults.map(i => i.id))}
                                        />
                                      </th>
                                      <th className="px-3 py-2 text-left">Серийный номер</th>
                                      <th className="px-3 py-2 text-left">Тип</th>
                                      <th className="px-3 py-2 text-left">ЛС / Договор</th>
                                      <th className="px-3 py-2 text-left">Потребитель</th>
                                      <th className="px-3 py-2 text-left">Мощность</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {addSearchResults.map(item => (
                                      <tr key={item.id} className={`border-t hover:bg-blue-50 cursor-pointer ${selectedAddItems.includes(item.id) ? 'bg-blue-100' : ''}`}
                                        onClick={() => setSelectedAddItems(s => s.includes(item.id) ? s.filter(x => x !== item.id) : [...s, item.id])}
                                      >
                                        <td className="px-3 py-2">
                                          <input 
                                            type="checkbox"
                                            checked={selectedAddItems.includes(item.id)}
                                            onChange={() => {}}
                                          />
                                        </td>
                                        <td className="px-3 py-2 font-mono">{item.serial_number}</td>
                                        <td className="px-3 py-2 max-w-xs truncate" title={item.pu_type}>{item.pu_type || '—'}</td>
                                        <td className="px-3 py-2">{item.ls_number || item.contract_number || '—'}</td>
                                        <td className="px-3 py-2">{item.consumer || '—'}</td>
                                        <td className="px-3 py-2">{item.power ? `${item.power} кВт` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )})()}

      {tab === 'create' && step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-4">
            {/* Фильтры */}
            <div className="flex flex-wrap gap-4">
              <select value={selectedStatus} onChange={e => handleStatusChange(e.target.value)} className="px-3 py-2 border rounded-lg">
                <option value="TECHPRIS">Техприс</option>
                <option value="ZAMENA">Замена (522)</option>
                <option value="IZHC">ИЖЦ</option>
              </select>
              <select value={selectedUnit} onChange={e => { setSelectedUnit(e.target.value); setSelectedItems([]) }} className="px-3 py-2 border rounded-lg">
                <option value="">{isOksAdmin ? 'Выберите участок ОКС...' : 'Выберите РЭС...'}</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {needPowerCategory && (
                <select value={selectedPower} onChange={e => { setSelectedPower(e.target.value); setSelectedItems([]) }} className="px-3 py-2 border rounded-lg">
                  <option value="">Категория мощности...</option>
                  <option value="1">до 15 кВт (1)</option>
                  <option value="2">15-150 кВт (2)</option>
                  <option value="3">от 150 кВт (3)</option>
                </select>
              )}
            </div>
            
            {/* Номер ТЗ с возможностью корректировки */}
            <div className="bg-blue-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm text-gray-600">Номер ТЗ: </span>
                  <span className="font-bold text-blue-700 text-lg">{getPreviewTzNumber()}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Окончание (можно изменить):</label>
                <input 
                  type="text" 
                  value={customSuffix} 
                  onChange={e => setCustomSuffix(e.target.value)}
                  placeholder="01-26"
                  className="px-3 py-1 border rounded-lg w-24 text-center"
                />
                <span className="text-xs text-gray-400">Формат: ММ-ГГ или свой</span>
              </div>
              
              <div className="flex justify-end">
                <button 
                  onClick={goToMaterials} 
                  disabled={loadingMaterials || selectedItems.length === 0 || !selectedUnit || (needPowerCategory && !selectedPower)} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {loadingMaterials ? 'Загрузка...' : `Далее Материалы (${selectedItems.length})`}
                </button>
              </div>
            </div>
          </div>

          {/* Таблица ПУ */}
          <div className="bg-white rounded-xl border overflow-hidden">
            {!selectedUnit || (needPowerCategory && !selectedPower) ? (
              <div className="p-8 text-center text-gray-500">
                {needPowerCategory ? (isOksAdmin ? 'Выберите участок ОКС и категорию мощности' : 'Выберите РЭС и категорию мощности') : (isOksAdmin ? 'Выберите участок ОКС' : 'Выберите РЭС')}
              </div>
            ) : pendingItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Нет ПУ без ТЗ для выбранных параметров</div>
            ) : (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                  <span className="text-sm text-gray-600">Найдено: {pendingItems.length}</span>
                  <button onClick={() => setSelectedItems(selectedItems.length === pendingItems.length ? [] : pendingItems.map(i => i.id))} className="text-sm text-blue-600">
                    {selectedItems.length === pendingItems.length ? 'Снять все' : 'Выбрать все'}
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-10 px-4 py-3"></th>
                      <th className="px-4 py-3 text-left">Серийный номер</th>
                      <th className="px-4 py-3 text-left">Тип</th>
                      {needPowerCategory && <th className="px-4 py-3 text-left">Мощность</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map(i => (
                      <tr key={i.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedItems.includes(i.id)} onChange={() => setSelectedItems(s => s.includes(i.id) ? s.filter(x => x !== i.id) : [...s, i.id])} />
                        </td>
                        <td className="px-4 py-3 font-mono">{i.serial_number}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{i.pu_type || '—'}</td>
                        {needPowerCategory && <td className="px-4 py-3">{i.power ? `${i.power} кВт` : '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

{tab === 'create' && step === 2 && (
  <div className="flex flex-col h-[calc(100vh-200px)]">
    {/* Шапка */}
    <div className="bg-white rounded-xl border p-4 mb-4 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Шаг 2: Корректировка материалов</h3>
          <p className="text-sm text-gray-500">ТЗ: {getPreviewTzNumber()} • Выбрано ПУ: {materialsData.length}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-100 rounded-lg"><Icon name="arrowLeft" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Назад</button>
          <button onClick={saveAllMaterials} className="px-4 py-2 bg-green-600 text-white rounded-lg"><Icon name="save" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Сохранить все</button>
          <button onClick={handleCreate} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Создание...' : 'Создать ТЗ'}
          </button>
        </div>
      </div>
    </div>

          {/* Список ПУ с материалами */}
    <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {materialsData.map((pu, idx) => (
            <div key={pu.id} className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                <div>
                  <span className="font-medium">{idx + 1}. {pu.serial_number}</span>
                  <span className="text-gray-500 text-sm ml-3">{pu.pu_type || ''}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    ТТР: {[pu.ttr_ou, pu.ttr_ol, pu.ttr_or].filter(Boolean).join(', ') || '—'}
                  </span>
                  {pu.va_nominal_name && (
  <label className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs cursor-pointer">
    <input 
      type="checkbox" 
      checked={pu.va_used !== false} 
      onChange={() => {
        setMaterialsData(prev => prev.map(p => 
          p.id === pu.id ? { ...p, va_used: !p.va_used } : p
        ))
      }}
    />
    <Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ВА: {pu.va_nominal_name} {pu.va_quantity > 1 ? `(${pu.va_quantity} шт)` : ''}
  </label>
)}
{pu.tt_nominal_name && (
  <label className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs cursor-pointer">
    <input 
      type="checkbox" 
      checked={pu.tt_used !== false} 
      onChange={() => {
        setMaterialsData(prev => prev.map(p => 
          p.id === pu.id ? { ...p, tt_used: !p.tt_used } : p
        ))
      }}
    />
    <Icon name="plug" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ТТ: {pu.tt_nominal_name}
  </label>
)}
                  <button onClick={() => saveSinglePU(pu.id)} className="px-3 py-1 bg-blue-500 text-white rounded text-sm"><Icon name="save" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Сохранить</button>
                </div>
              </div>
              
              {pu.materials.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">Нет материалов (не выбраны ТТР)</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left">Материал</th>
                      <th className="px-3 py-2 text-left w-20">Ед.</th>
                      <th className="px-3 py-2 text-center w-24">Кол-во</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pu.materials.map(m => (
                      <tr key={m.material_id} className={`border-t ${!m.used ? 'opacity-50 bg-gray-50' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          <input 
                            type="checkbox" 
                            checked={m.used} 
                            onChange={() => updateMaterial(pu.id, m.material_id, 'used', !m.used)}
                          />
                        </td>
                        <td className="px-3 py-2">{m.material_name}</td>
                        <td className="px-3 py-2 text-gray-500">{m.unit}</td>
                        <td className="px-3 py-2">
                          <input 
                            type="number" 
                            value={m.quantity} 
                            onChange={e => updateMaterial(pu.id, m.material_id, 'quantity', parseFloat(e.target.value) || 0)}
                            disabled={!m.used}
                            className="w-full px-2 py-1 border rounded text-center"
                            min="0"
                            step="0.1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
      </div>
          {/* Итого по материалам */}
          <div className="flex-shrink-0 bg-green-50 rounded-xl border border-green-200 p-4 mt-4 sticky bottom-0 shadow-lg">
            <h4 className="font-semibold text-green-800 mb-3"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ИТОГО материалов</h4>
            
            {/* ВА и ТТ */}
            {(materialsData.some(pu => pu.va_nominal_name) || materialsData.some(pu => pu.tt_nominal_name)) && (
              <div className="mb-4 p-3 bg-white rounded-lg border">
                <div className="text-sm font-medium text-gray-700 mb-2"><Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Оборудование:</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    materialsData
                      .filter(pu => pu.va_nominal_name && pu.va_used !== false)
                      .reduce((acc, pu) => {
                        const qty = pu.va_quantity || 1
                        acc[pu.va_nominal_name] = (acc[pu.va_nominal_name] || 0) + qty
                        return acc
                      }, {})
                  ).map(([name, count]) => (
                    <span key={`va-${name}`} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
                      ВА {name}: <b>{count} шт</b>
                    </span>
                  ))}
                  {Object.entries(
                    materialsData
                      .filter(pu => pu.tt_nominal_name && pu.tt_used !== false)
                      .reduce((acc, pu) => {
                      acc[pu.tt_nominal_name] = (acc[pu.tt_nominal_name] || 0) + 1
                      return acc
                    }, {})
                  ).map(([name, count]) => (
                    <span key={`tt-${name}`} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm">
                      ТТ {name}: <b>{count} шт</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {getTotalMaterials().map((m, idx) => (
                <div key={idx} className="bg-white rounded-lg p-3 border">
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="text-lg font-bold text-green-700">{m.quantity} {m.unit}</div>
                </div>
              ))}
            </div>
            {getTotalMaterials().length === 0 && (
              <p className="text-gray-500 text-sm">Нет материалов</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== ЗАЯВКИ ЭСК ====================
function RequestsPage() {
  const { isSueAdmin, isEskAdmin, isEskUser } = useAuth()
  const [tab, setTab] = useState('list')
  const [requestsList, setRequestsList] = useState([])
  const [reqSort, setReqSort] = useState({ field: 'request_number', dir: 'desc' })
  const [expandedReq, setExpandedReq] = useState(null)
  const [reqItems, setReqItems] = useState([])
  const [pendingItems, setPendingItems] = useState([])
  const [units, setUnits] = useState([])
  const [selectedUnit, setSelectedUnit] = useState('')
  const [selectedItems, setSelectedItems] = useState([])
  const [selectedItemsInfo, setSelectedItemsInfo] = useState({}) // {id: {price_total}} — сумма между фильтрами
  const [loading, setLoading] = useState(false)
  const [lastRequest, setLastRequest] = useState(null)
  const [requestNumber, setRequestNumber] = useState('')
  const [requestContract, setRequestContract] = useState('')
  const [checkedReqItems, setCheckedReqItems] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)

  // Добавление ПУ в заявку
  const [showReqAddSearch, setShowReqAddSearch] = useState(false)
  const [reqAddSearchQuery, setReqAddSearchQuery] = useState('')
  const [reqAddSearchResults, setReqAddSearchResults] = useState([])
  const [reqAddSearching, setReqAddSearching] = useState(false)
  const [selectedReqAddItems, setSelectedReqAddItems] = useState([])
  const [addingToReq, setAddingToReq] = useState(false)

  const canCreateRequest = isEskAdmin || isEskUser
  const canManageRequest = isSueAdmin

  useEffect(() => {
    loadRequests()
    api.get('/units').then(r => setUnits(r.data.filter(u => u.unit_type === 'ESK_UNIT')))
  }, [])

  useEffect(() => {
    if (tab === 'create' && canCreateRequest) {
      loadPending()
      loadLastRequest()
    }
  }, [tab])

  // Перезагрузка при смене фильтра ЭСК (выбор НЕ сбрасываем — накапливаем)
  useEffect(() => {
    if (tab === 'create' && canCreateRequest) {
      loadPending()
    }
  }, [selectedUnit])

  const loadRequests = () => {
    api.get('/requests/list').then(r => setRequestsList(r.data))
  }

  const loadPending = () => {
    const params = {}
    if (selectedUnit) params.unit_id = selectedUnit
    api.get('/requests/pending', { params }).then(r => setPendingItems(r.data))
  }

  const loadLastRequest = () => {
    api.get('/requests/last').then(r => {
      setLastRequest(r.data)
      setRequestNumber(r.data.next_number)
      setRequestContract(r.data.last_contract)
    })
  }

  const toggleExpand = async (req) => {
    const key = `${req.request_number}|${req.request_contract || ''}`
    if (expandedReq === key) {
      setExpandedReq(null)
      setReqItems([])
      setCheckedReqItems([])
    } else {
      setExpandedReq(key)
      setCheckedReqItems([])
      setShowReqAddSearch(false)
      setReqAddSearchQuery('')
      setReqAddSearchResults([])
      setSelectedReqAddItems([])
      const params = { request_contract: req.request_contract }
      const r = await api.get(`/requests/${encodeURIComponent(req.request_number)}/items`, { params })
      setReqItems(r.data)
    }
  }

const exportToExcel = async () => {
  if (!expandedReq) return
  
  const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
  if (!req) return
  
  try {
    const params = new URLSearchParams()
    if (req.request_contract) params.append('request_contract', req.request_contract)
    
    const response = await api.get(
      `/requests/${encodeURIComponent(req.request_number)}/export?${params.toString()}`,
      { responseType: 'blob' }
    )
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Заявка_${req.request_number}_${req.request_contract || ''}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    alert('Ошибка выгрузки: ' + (err.response?.data?.detail || err.message))
  }
}

  const handleCreate = async () => {
    if (selectedItems.length === 0) {
      alert('Выберите ПУ')
      return
    }
    if (!requestNumber) {
      alert('Введите номер заявки')
      return
    }
    setLoading(true)
    try {
      const r = await api.post('/requests/create', { 
        item_ids: selectedItems,
        request_number: requestNumber,
        request_contract: requestContract
      })
      alert(`Создана заявка: ${r.data.display_name}`)
      setSelectedItems([])
      setSelectedItemsInfo({})
      loadRequests()
      loadPending()
      loadLastRequest()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setLoading(false)
  }

  const reloadCurrentRequest = async (req) => {
    const params = { request_contract: req.request_contract }
    const r = await api.get(`/requests/${encodeURIComponent(req.request_number)}/items`, { params })
    setReqItems(r.data)
    setCheckedReqItems([])
    loadRequests()
  }

  const handleRemoveFromRequest = async (itemId) => {
    const code = prompt('Введите код администратора:')
    if (!code) return
    const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
    if (!req) return
    try {
      const res = await api.post(`/requests/${encodeURIComponent(req.request_number)}/remove-items`, {
        item_ids: [itemId],
        admin_code: code
      })
      if (res.data.request_deleted) {
        alert('ПУ удалён. Заявка стала пустой и удалена.')
        setExpandedReq(null)
        setReqItems([])
        setCheckedReqItems([])
        loadRequests()
      } else {
        alert('ПУ удалён из заявки')
        reloadCurrentRequest(req)
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  const handleBulkRemove = async () => {
    if (checkedReqItems.length === 0) return alert('Выберите ПУ')
    const code = prompt('Введите код администратора:')
    if (!code) return
    const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
    if (!req) return
    setBulkLoading(true)
    try {
      const res = await api.post(`/requests/${encodeURIComponent(req.request_number)}/remove-items`, {
        item_ids: checkedReqItems,
        admin_code: code
      })
      if (res.data.request_deleted) {
        alert(`Удалено ${res.data.removed} ПУ. Заявка стала пустой и удалена.`)
        setExpandedReq(null)
        setReqItems([])
        setCheckedReqItems([])
        loadRequests()
      } else {
        alert(`Удалено ${res.data.removed} ПУ из заявки. Осталось: ${res.data.remaining}`)
        reloadCurrentRequest(req)
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setBulkLoading(false)
  }

  const handleBulkRecalculate = async () => {
    if (checkedReqItems.length === 0) return alert('Выберите ПУ для пересчёта')
    const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
    if (!req) return
    if (!window.confirm(`Пересчитать стоимость по текущим ценам ТТР ЭСК для ${checkedReqItems.length} ПУ?`)) return
    setBulkLoading(true)
    try {
      const res = await api.post(`/requests/${encodeURIComponent(req.request_number)}/recalculate`, {
        item_ids: checkedReqItems
      })
      let msg = `Пересчитано: ${res.data.updated} ПУ`
      if (res.data.errors?.length > 0) msg += `\nОшибки:\n${res.data.errors.join('\n')}`
      alert(msg)
      reloadCurrentRequest(req)
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setBulkLoading(false)
  }

  // Поиск ПУ для добавления в заявку
  const searchForReqAdd = async (query) => {
    setReqAddSearchQuery(query)
    if (!query || query.length < 2 || !expandedReq) {
      setReqAddSearchResults([])
      return
    }
    const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
    if (!req) return
    
    setReqAddSearching(true)
    try {
      const params = { request_number: req.request_number, q: query }
      if (req.request_contract) params.request_contract = req.request_contract
      const r = await api.get('/requests/search-available', { params })
      setReqAddSearchResults(r.data)
    } catch (err) {
      console.error(err)
      setReqAddSearchResults([])
    } finally {
      setReqAddSearching(false)
    }
  }

  // Добавить выбранные ПУ в заявку
  const addToRequest = async () => {
    if (!expandedReq || selectedReqAddItems.length === 0) return
    const req = requestsList.find(r => `${r.request_number}|${r.request_contract || ''}` === expandedReq)
    if (!req) return
    if (!confirm(`Добавить ${selectedReqAddItems.length} ПУ в заявку ${req.display_name}?`)) return
    
    setAddingToReq(true)
    try {
      const r = await api.post(`/requests/${encodeURIComponent(req.request_number)}/add-items`, { 
        item_ids: selectedReqAddItems, 
        request_contract: req.request_contract 
      })
      alert(`Добавлено в заявку: ${r.data.added} шт. Всего: ${r.data.total} шт.`)
      
      setSelectedReqAddItems([])
      setReqAddSearchQuery('')
      setReqAddSearchResults([])
      setShowReqAddSearch(false)
      
      loadRequests()
      const params = { request_contract: req.request_contract }
      const itemsR = await api.get(`/requests/${encodeURIComponent(req.request_number)}/items`, { params })
      setReqItems(itemsR.data)
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message))
    } finally {
      setAddingToReq(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Заявки ЭСК</h1>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('list')} className={`px-4 py-2 border-b-2 ${tab === 'list' ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}><Icon name="clipboard" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Реестр заявок</button>
        {canCreateRequest && (
          <button onClick={() => setTab('create')} className={`px-4 py-2 border-b-2 ${tab === 'create' ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Формирование</button>
        )}
      </div>

      {tab === 'list' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {requestsList.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Нет сформированных заявок</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  {[
                    { field: 'display_name', label: 'Номер заявки' },
                    { field: 'count', label: 'Кол-во ПУ' },
                  ].map(col => (
                    <th key={col.field} className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 select-none" onClick={() => setReqSort(prev => ({ field: col.field, dir: prev.field === col.field && prev.dir === 'asc' ? 'desc' : 'asc' }))}>
                      {col.label} {reqSort.field === col.field ? (reqSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...requestsList].sort((a, b) => {
                  const av = a[reqSort.field] ?? ''
                  const bv = b[reqSort.field] ?? ''
                  const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ru')
                  return reqSort.dir === 'asc' ? cmp : -cmp
                }).map((req, idx) => {
                  const key = `${req.request_number}|${req.request_contract || ''}`
                  return (
                    <>
                      <tr key={idx} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(req)}>
                        <td className="px-4 py-3">{expandedReq === key ? '▼' : '▶'}</td>
                        <td className="px-4 py-3 font-medium">{req.display_name}</td>
                        <td className="px-4 py-3">{req.count}</td>
                      </tr>
                      {expandedReq === key && (
                        <tr>
                          <td colSpan={3} className="bg-gray-50 p-4">
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-medium">ПУ в заявке {req.display_name}</span>
                              <div className="flex gap-2">
                                {canManageRequest && checkedReqItems.length > 0 && (
                                  <>
                                    <button
                                      onClick={handleBulkRecalculate}
                                      disabled={bulkLoading}
                                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                                    >
                                      <Icon name="refresh" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Пересчитать ({checkedReqItems.length})
                                    </button>
                                    <button
                                      onClick={handleBulkRemove}
                                      disabled={bulkLoading}
                                      className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
                                    >
                                      <Icon name="trash" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Удалить ({checkedReqItems.length})
                                    </button>
                                  </>
                                )}
                                {canManageRequest && (
                                  <button 
                                    onClick={() => { setShowReqAddSearch(!showReqAddSearch); setReqAddSearchQuery(''); setReqAddSearchResults([]); setSelectedReqAddItems([]) }}
                                    className={`px-3 py-1 ${showReqAddSearch ? 'bg-gray-500' : 'bg-blue-600'} text-white rounded-lg text-sm`}
                                  >
                                    {showReqAddSearch ? 'Закрыть поиск' : 'Добавить ПУ'}
                                  </button>
                                )}
                                <button onClick={exportToExcel} className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Выгрузить в Excel</button>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                                <thead className="bg-gray-100">
                                  <tr>
                                    {canManageRequest && (
                                      <th className="px-2 py-2">
                                        <input type="checkbox"
                                          checked={checkedReqItems.length === reqItems.length && reqItems.length > 0}
                                          onChange={e => setCheckedReqItems(e.target.checked ? reqItems.map(i => i.id) : [])}
                                        />
                                      </th>
                                    )}
                                    <th className="px-2 py-2 text-left">№</th>
                                    <th className="px-2 py-2 text-left">Филиал</th>
                                    <th className="px-2 py-2 text-left">РЭС</th>
                                    <th className="px-2 py-2 text-left">Заявитель</th>
                                    <th className="px-2 py-2 text-left">Адрес</th>
                                    <th className="px-2 py-2 text-left">№ договора</th>
                                    <th className="px-2 py-2 text-left">Дата закл.</th>
                                    <th className="px-2 py-2 text-left">План. дата</th>
                                    <th className="px-2 py-2 text-left">Мощн.</th>
                                    <th className="px-2 py-2 text-left">Фаза</th>
                                    <th className="px-2 py-2 text-left">Вид работ</th>
                                    <th className="px-2 py-2 text-left">Стоим. с НДС</th>
                                    {canManageRequest && <th className="px-2 py-2"></th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {reqItems.map((item) => (
                                    <tr key={item.id} className={`border-t ${checkedReqItems.includes(item.id) ? 'bg-blue-50' : ''}`}>
                                      {canManageRequest && (
                                        <td className="px-2 py-2">
                                          <input type="checkbox"
                                            checked={checkedReqItems.includes(item.id)}
                                            onChange={e => setCheckedReqItems(prev =>
                                              e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                                            )}
                                          />
                                        </td>
                                      )}
                                      <td className="px-2 py-2">{item.row_num}</td>
                                      <td className="px-2 py-2">{item.filial}</td>
                                      <td className="px-2 py-2">{item.res_name}</td>
                                      <td className="px-2 py-2">{item.consumer || '—'}</td>
                                      <td className="px-2 py-2 max-w-xs truncate" title={item.address}>{item.address || '—'}</td>
                                      <td className="px-2 py-2">{item.contract_number || '—'}</td>
                                      <td className="px-2 py-2">{item.contract_date || '—'}</td>
                                      <td className="px-2 py-2">{item.plan_date || '—'}</td>
                                      <td className="px-2 py-2">{item.power || '—'}</td>
                                      <td className="px-2 py-2">{item.faza || '—'}</td>
                                      <td className="px-2 py-2">{item.work_type_name || '—'}</td>
                                      <td className="px-2 py-2 font-medium">{item.price_with_nds?.toLocaleString() || '—'} ₽</td>
                                      {canManageRequest && (
                                        <td className="px-2 py-2">
                                          <button onClick={() => handleRemoveFromRequest(item.id)} className="text-red-500 hover:text-red-700" title="Удалить из заявки"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Панель добавления ПУ в заявку */}
                            {showReqAddSearch && canManageRequest && (
                              <div className="mt-4 border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="font-medium text-blue-800"><Icon name="search" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Поиск ПУ для добавления в заявку</h4>
                                  <button 
                                    onClick={() => { setShowReqAddSearch(false); setReqAddSearchQuery(''); setReqAddSearchResults([]); setSelectedReqAddItems([]) }}
                                    className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white rounded-lg text-sm"
                                  ><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Закрыть</button>
                                </div>
                                <div className="flex gap-2 mb-3">
                                  <input 
                                    type="text"
                                    value={reqAddSearchQuery}
                                    onChange={e => searchForReqAdd(e.target.value)}
                                    placeholder="Серийный номер, договор или потребитель (мин. 2 символа)..."
                                    className="flex-1 px-3 py-2 border rounded-lg"
                                    autoFocus
                                  />
                                  {selectedReqAddItems.length > 0 && (
                                    <button 
                                      onClick={addToRequest}
                                      disabled={addingToReq}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                    >
                                      {addingToReq ? 'Добавление...' : `Добавить (${selectedReqAddItems.length})`}
                                    </button>
                                  )}
                                </div>
                                
                                {reqAddSearching && <div className="text-center py-3 text-gray-500">Поиск...</div>}
                                
                                {!reqAddSearching && reqAddSearchQuery.length >= 2 && reqAddSearchResults.length === 0 && (
                                  <div className="text-center py-3 text-gray-500">Ничего не найдено. ПУ должен быть согласован и без заявки.</div>
                                )}
                                
                                {reqAddSearchResults.length > 0 && (
                                  <table className="w-full text-xs bg-white rounded-lg overflow-hidden border">
                                    <thead className="bg-blue-100">
                                      <tr>
                                        <th className="w-8 px-2 py-2">
                                          <input 
                                            type="checkbox"
                                            checked={reqAddSearchResults.length > 0 && selectedReqAddItems.length === reqAddSearchResults.length}
                                            onChange={() => setSelectedReqAddItems(selectedReqAddItems.length === reqAddSearchResults.length ? [] : reqAddSearchResults.map(i => i.id))}
                                          />
                                        </th>
                                        <th className="px-2 py-2 text-left">Серийный номер</th>
                                        <th className="px-2 py-2 text-left">Потребитель</th>
                                        <th className="px-2 py-2 text-left">Договор</th>
                                        <th className="px-2 py-2 text-left">Мощн.</th>
                                        <th className="px-2 py-2 text-left">Вид работ</th>
                                        <th className="px-2 py-2 text-left">Стоим. с НДС</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {reqAddSearchResults.map(item => (
                                        <tr key={item.id} className={`border-t hover:bg-blue-50 cursor-pointer ${selectedReqAddItems.includes(item.id) ? 'bg-blue-100' : ''}`}
                                          onClick={() => setSelectedReqAddItems(s => s.includes(item.id) ? s.filter(x => x !== item.id) : [...s, item.id])}
                                        >
                                          <td className="px-2 py-2">
                                            <input type="checkbox" checked={selectedReqAddItems.includes(item.id)} onChange={() => {}} />
                                          </td>
                                          <td className="px-2 py-2 font-mono">{item.serial_number}</td>
                                          <td className="px-2 py-2">{item.consumer || '—'}</td>
                                          <td className="px-2 py-2">{item.contract_number || '—'}</td>
                                          <td className="px-2 py-2">{item.power || '—'}</td>
                                          <td className="px-2 py-2">{item.work_type_name || '—'}</td>
                                          <td className="px-2 py-2 font-medium">{item.price_with_nds?.toLocaleString() || '—'} ₽</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'create' && canCreateRequest && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <span className="text-yellow-700"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Только согласованные ПУ доступны для формирования заявки</span>
          </div>

          <div className="bg-white rounded-xl border p-4 space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Номер заявки *</label>
                <input 
                  type="text" 
                  value={requestNumber} 
                  onChange={e => setRequestNumber(e.target.value)} 
                  placeholder="1-26" 
                  className="px-3 py-2 border rounded-lg w-32"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Номер договора</label>
                <input 
                  type="text" 
                  value={requestContract} 
                  onChange={e => setRequestContract(e.target.value)} 
                  placeholder="147" 
                  className="px-3 py-2 border rounded-lg w-32"
                />
              </div>
              <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="px-3 py-2 border rounded-lg">
                <option value="">Все ЭСК</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            
            {lastRequest && (
              <div className="text-sm text-gray-500">
                <Icon name="bulb" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Рекомендовано: <span className="font-medium text-blue-600">{lastRequest.suggested}</span>
              </div>
            )}
            
            <div className="bg-green-50 rounded-lg p-4 space-y-3">
  <div className="flex items-center justify-between">
    <div>
      <span className="text-sm text-gray-600">Будет создана заявка: </span>
      <span className="font-bold text-green-700 text-lg">
        № {requestNumber || '?'} {requestContract ? `Договор № ${requestContract}` : ''}
      </span>
    </div>
  </div>
  
  {/* Итоги по выбранным */}
  {selectedItems.length > 0 && (
    <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-green-200">
      <div className="flex gap-6">
        <div>
          <span className="text-gray-600 text-sm">Выбрано ПУ:</span>
          <span className="ml-2 font-bold text-lg">{selectedItems.length} шт</span>
        </div>
        <div>
          <span className="text-gray-600 text-sm">С НДС:</span>
          <span className="ml-2 font-bold text-green-700 text-lg">
            {Object.values(selectedItemsInfo)
              .reduce((sum, i) => sum + (i.price_total || 0), 0)
              .toLocaleString()} ₽
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setSelectedItems([]); setSelectedItemsInfo({}) }} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">Сбросить выбор</button>
        <button onClick={handleCreate} disabled={loading || selectedItems.length === 0 || !requestNumber} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
          {loading ? 'Создание...' : 'Создать заявку'}
        </button>
      </div>
    </div>
  )}
  
  {selectedItems.length === 0 && (
    <div className="text-center text-gray-500 py-2">Выберите ПУ для формирования заявки</div>
  )}
</div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {pendingItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Нет согласованных ПУ для заявки</div>
            ) : (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                  <span className="text-sm text-gray-600">Найдено: {pendingItems.length} {selectedItems.length > 0 ? `• Выбрано всего: ${selectedItems.length}` : ''}</span>
                  <button onClick={() => {
                    const currentIds = pendingItems.map(i => i.id)
                    const allCurrentSelected = currentIds.every(id => selectedItems.includes(id))
                    if (allCurrentSelected) {
                      setSelectedItems(s => s.filter(id => !currentIds.includes(id)))
                      setSelectedItemsInfo(prev => {
                        const next = { ...prev }
                        currentIds.forEach(id => delete next[id])
                        return next
                      })
                    } else {
                      const newInfo = { ...selectedItemsInfo }
                      pendingItems.forEach(i => { newInfo[i.id] = { price_total: i.price_total || 0 } })
                      setSelectedItemsInfo(newInfo)
                      setSelectedItems(s => [...new Set([...s, ...currentIds])])
                    }
                  }} className="text-sm text-blue-600">
                    {pendingItems.every(i => selectedItems.includes(i.id)) ? 'Снять все на странице' : 'Выбрать все на странице'}
                  </button>
                </div>
                <table className="w-full text-sm">
  <thead className="bg-gray-50">
    <tr>
      <th className="w-10 px-3 py-3"></th>
      <th className="px-3 py-3 text-left">РЭС</th>
      <th className="px-3 py-3 text-left">Серийный номер</th>
      <th className="px-3 py-3 text-left">Тип ПУ</th>
      <th className="px-3 py-3 text-left">Потребитель</th>
      <th className="px-3 py-3 text-center">Фаза</th>
      <th className="px-3 py-3 text-center">Трубост.</th>
      <th className="px-3 py-3 text-left">ЛСР ПУ/ВА</th>
      <th className="px-3 py-3 text-left">ЛСР Труб.</th>
      <th className="px-3 py-3 text-right">Итого</th>
    </tr>
  </thead>
<tbody>
  {pendingItems.map(i => (
    <tr key={i.id} className={`border-t hover:bg-gray-50 ${selectedItems.includes(i.id) ? 'bg-blue-50' : ''}`}>
      <td className="px-3 py-3">
        <input type="checkbox" checked={selectedItems.includes(i.id)} onChange={() => {
          if (selectedItems.includes(i.id)) {
            setSelectedItems(s => s.filter(x => x !== i.id))
            setSelectedItemsInfo(prev => { const next = { ...prev }; delete next[i.id]; return next })
          } else {
            setSelectedItems(s => [...s, i.id])
            setSelectedItemsInfo(prev => ({ ...prev, [i.id]: { price_total: i.price_total || 0 } }))
          }
        }} />
      </td>
      <td className="px-3 py-3">{i.unit_name || i.res_name || '—'}</td>
      <td className="px-3 py-3 font-mono">{i.serial_number}</td>
      <td className="px-3 py-3 text-gray-600 max-w-xs truncate" title={i.pu_type}>{i.pu_type || '—'}</td>
      <td className="px-3 py-3">{i.consumer || '—'}</td>
      <td className="px-3 py-3 text-center">{i.faza || '—'}</td>
      <td className="px-3 py-3 text-center">{i.trubostoyka ? <Icon name="check" className="w-4 h-4 inline-block text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-3">{i.lsr_va || '—'}</td>
      <td className="px-3 py-3">{i.lsr_truba || '—'}</td>
      <td className="px-3 py-3 text-right font-medium">{i.price_total?.toLocaleString() || '—'} ₽</td>
    </tr>
  ))}
</tbody>
</table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MemoPage() {
  const { isSueAdmin } = useAuth()
  const [tzList, setTzList] = useState([])
  const [requestsList, setRequestsList] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [memoData, setMemoData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/tz/list').then(r => setTzList(r.data))
    api.get('/requests/list').then(r => setRequestsList(r.data))
  }, [])

  const generateMemo = async (type, number) => {
    setLoading(true)
    try {
      const params = type === 'tz' ? { tz_number: number } : { request_number: number }
      const r = await api.get('/memo/generate', { params })
      setMemoData(r.data)
      setSelectedDoc({ type, number })
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setLoading(false)
  }

  const exportMemo = () => {
    if (!memoData) return
    
    let text = `СЛУЖЕБНАЯ ЗАПИСКА\n\n`
    text += `Дата: ${memoData.date}\n`
    text += `${memoData.doc_type}: ${memoData.doc_number}\n`
    text += `Всего ПУ: ${memoData.total_count}\n\n`
    
    for (const [unit, items] of Object.entries(memoData.units)) {
      text += `\n${unit}:\n`
      text += `${'—'.repeat(50)}\n`
      items.forEach((item, idx) => {
        text += `${idx + 1}. ${item.serial_number}\n`
        if (item.consumer) text += `   Потребитель: ${item.consumer}\n`
        if (item.address) text += `   Адрес: ${item.address}\n`
        if (item.power) text += `   Мощность: ${item.power} кВт\n`
      })
    }
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Служебка_${memoData.doc_type}_${memoData.doc_number}.txt`
    a.click()
  }

  if (!isSueAdmin) return <div className="text-center py-12 text-gray-500">Нет доступа</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold"><Icon name="fileText" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Формирование служебных записок</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* ТЗ */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold mb-4">Технические задания</h2>
          {tzList.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет сформированных ТЗ</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tzList.map((tz, idx) => (
                <div key={idx} className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${selectedDoc?.number === tz.tz_number ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'}`} onClick={() => generateMemo('tz', tz.tz_number)}>
                  <div>
                    <div className="font-medium">{tz.tz_number}</div>
                    <div className="text-sm text-gray-500">{tz.unit_name} • {tz.count} ПУ</div>
                  </div>
                  <span className="text-gray-400"><Icon name="arrowRight" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Заявки */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold mb-4">Заявки ЭСК</h2>
          {requestsList.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет сформированных заявок</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {requestsList.map((req, idx) => (
                <div key={idx} className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${selectedDoc?.number === req.request_number ? 'bg-green-100 border-green-300' : 'bg-gray-50 hover:bg-gray-100'}`} onClick={() => generateMemo('request', req.request_number)}>
                  <div>
                    <div className="font-medium">{req.request_number}</div>
                    <div className="text-sm text-gray-500">{req.count} ПУ</div>
                  </div>
                  <span className="text-gray-400"><Icon name="arrowRight" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Превью служебки */}
      {loading && <div className="py-8"><RossetiLoader /></div>}
      
      {memoData && !loading && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold">Служебная записка</h2>
              <p className="text-sm text-gray-500">{memoData.doc_type} {memoData.doc_number} от {memoData.date}</p>
            </div>
            <button onClick={exportMemo} className="px-4 py-2 bg-green-600 text-white rounded-lg"><Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Скачать</button>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <span className="text-blue-700 font-medium">Всего ПУ: {memoData.total_count}</span>
            </div>
            
            {Object.entries(memoData.units).map(([unit, items]) => (
              <div key={unit} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 font-medium">{unit} ({items.length} шт)</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">№</th>
                      <th className="px-3 py-2 text-left">Серийный номер</th>
                      <th className="px-3 py-2 text-left">Потребитель</th>
                      <th className="px-3 py-2 text-left">Мощность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono">{item.serial_number}</td>
                        <td className="px-3 py-2">{item.consumer || '—'}</td>
                        <td className="px-3 py-2">{item.power ? `${item.power} кВт` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== НАСТРОЙКИ ====================
function SettingsPage() {
  const { canManageUsers, isSueAdmin, isEskAdmin, isResUser, isEskUser } = useAuth()
  const [tab, setTab] = useState(isSueAdmin ? 'users' : 'masters')

  if (!canManageUsers && !isEskAdmin) return <div className="text-center py-12 text-gray-500">Нет доступа</div>

  const tabs = [
    { id: 'users', icon: 'users', label: 'Пользователи', show: isSueAdmin },
    { id: 'masters', icon: 'hardhat', label: 'Мастера ЭСК', show: isEskAdmin || isSueAdmin },
    { id: 'ttr-res', icon: 'ruler', label: 'ТТР (РЭС)', show: isSueAdmin || isResUser },
    { id: 'ttr-esk', icon: 'ruler', label: 'ТТР (ЭСК)', show: isSueAdmin || isEskAdmin || isEskUser },
    { id: 'materials', icon: 'wrench', label: 'Материалы', show: isSueAdmin || isResUser },
    { id: 'va-nominals', icon: 'zap', label: 'Номиналы ВА', show: isSueAdmin || isResUser },
    { id: 'tt-nominals', icon: 'plug', label: 'Номиналы ТТ', show: isSueAdmin || isResUser },
    { id: 'pu-types', icon: 'package', label: 'Типы ПУ', show: isSueAdmin || isResUser || isEskUser },
    { id: 'bulk-update', icon: 'fileEdit', label: 'Корректировка', show: isSueAdmin },
    { id: 'system', icon: 'settings', label: 'Система', show: isSueAdmin },
  ].filter(t => t.show)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>

      <div className="flex gap-1 border-b border-slate-200 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 border-b-2 whitespace-nowrap text-sm transition-colors ${tab === t.id ? 'border-[#0B4DA2] text-[#0B4DA2] font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon name={t.icon} className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'masters' && <MastersTab />}
      {tab === 'ttr-res' && <TTRResTab />}
      {tab === 'ttr-esk' && <TTREskTab />}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'pu-types' && <PUTypesTab />}
      {tab === 'va-nominals' && <VANominalsTab />}
      {tab === 'tt-nominals' && <TTNominalsTab />}
      {tab === 'bulk-update' && <BulkUpdateTab />}
      {tab === 'system' && <SystemTab />}
    </div>
  )
}

// --- Пользователи ---
function UsersTab() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [units, setUnits] = useState([])
  const [modal, setModal] = useState(null)

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data))
    api.get('/roles').then(r => setRoles(r.data))
    api.get('/units').then(r => setUnits(r.data))
  }, [])

  const toggleActive = async (u) => {
    await api.put(`/users/${u.id}`, { is_active: !u.is_active })
    api.get('/users').then(r => setUsers(r.data))
  }

  const handleSave = async (data) => {
    if (modal.user) {
      await api.put(`/users/${modal.user.id}`, data)
    } else {
      await api.post('/users', data)
    }
    api.get('/users').then(r => setUsers(r.data))
    setModal(null)
  }

  return (
    <>
      <div className="flex justify-end">
        <button onClick={() => setModal({ user: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Логин</th><th className="px-4 py-3 text-left">ФИО</th><th className="px-4 py-3 text-left">Роль</th><th className="px-4 py-3 text-left">Подразделение</th><th className="px-4 py-3 text-left">Статус</th><th className="w-24"></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={`border-t ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3">{u.role?.name}</td>
                <td className="px-4 py-3">{u.unit?.name || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{u.is_active ? 'Активен' : 'Неактивен'}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => setModal({ user: u })} className="mr-2"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  <button onClick={() => toggleActive(u)}>{u.is_active ? '' : ''}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <UserModal user={modal.user} roles={roles} units={units} onClose={() => setModal(null)} onSave={handleSave} />}
    </>
  )
}

function UserModal({ user, roles, units, onClose, onSave }) {
  const [form, setForm] = useState({ username: user?.username || '', password: '', full_name: user?.full_name || '', role_id: user?.role?.id || '', unit_id: user?.unit?.id || '' })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{user ? 'Редактировать' : 'Новый пользователь'}</h2>
        <div className="space-y-3">
          <input type="text" placeholder="Логин" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} disabled={!!user} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
          {!user && <input type="password" placeholder="Пароль" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />}
          <input type="text" placeholder="ФИО" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          <select value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Выберите роль...</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Без подразделения</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={() => onSave({ ...form, role_id: parseInt(form.role_id), unit_id: form.unit_id ? parseInt(form.unit_id) : null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
        </div>
      </div>
    </div>
  )
}

// --- Мастера ЭСК ---
function MastersTab() {
  const { isSueAdmin } = useAuth()
  const [masters, setMasters] = useState([])
  const [units, setUnits] = useState([])
  const [modal, setModal] = useState(null)

  useEffect(() => {
    api.get('/masters').then(r => setMasters(r.data))
    api.get('/units').then(r => setUnits(r.data.filter(u => u.unit_type === 'ESK_UNIT')))
  }, [])

  const handleSave = async (data) => {
    if (modal.master) {
      await api.put(`/masters/${modal.master.id}`, data)
    } else {
      await api.post('/masters', data)
    }
    api.get('/masters').then(r => setMasters(r.data))
    setModal(null)
  }

  const handleDelete = async (id) => {
    if (confirm('Удалить мастера?')) {
      await api.delete(`/masters/${id}`)
      api.get('/masters').then(r => setMasters(r.data))
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button onClick={() => setModal({ master: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">ФИО</th><th className="px-4 py-3 text-left">Подразделение ЭСК</th><th className="w-24"></th></tr></thead>
          <tbody>
            {masters.map(m => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-3">{m.full_name}</td>
                <td className="px-4 py-3">{m.unit_name || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setModal({ master: m })} className="mr-2"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  <button onClick={() => handleDelete(m.id)}><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.master ? 'Редактировать' : 'Новый мастер'}</h2>
            <MasterForm master={modal.master} units={units} onSave={handleSave} onClose={() => setModal(null)} />
          </div>
        </div>
      )}
    </>
  )
}

function MasterForm({ master, units, onSave, onClose }) {
  const [form, setForm] = useState({ full_name: master?.full_name || '', unit_id: master?.unit_id || '' })
  return (
    <div className="space-y-3">
      <input type="text" placeholder="ФИО мастера" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <select value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="">Выберите подразделение...</option>
        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave({ ...form, unit_id: parseInt(form.unit_id) })} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}

// --- ТТР РЭС ---
function TTRResTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [filter, setFilter] = useState('')
  const [materialsModal, setMaterialsModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [puTypesModal, setPuTypesModal] = useState(null)

  useEffect(() => { api.get('/ttr/res').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/ttr/res/${modal.item.id}`, data)
    } else {
      await api.post('/ttr/res', data)
    }
    api.get('/ttr/res').then(r => setItems(r.data))
    setModal(null)
  }

  const filtered = items.filter(i => !filter || i.ttr_type === filter)

  return (
    <>
      <div className="flex justify-between">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 border rounded-lg">
          <option value="">Все типы</option>
          <option value="OU">Организация учета</option>
          <option value="OL">Обустройство линии</option>
          <option value="OR">Распред. щит</option>
        </select>
        {isSueAdmin && (
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
  <thead className="bg-gray-50">
    <tr>
      <th className="px-4 py-3 text-left">Код</th>
      <th className="px-4 py-3 text-left">Название</th>
      <th className="px-4 py-3 text-left">Тип</th>
      <th className="px-4 py-3 text-right w-28">Действия</th>
    </tr>
  </thead>
  <tbody>
    {filtered.map(i => (
      <tr key={i.id} className="border-t">
        <td className="px-4 py-3 font-mono">{i.code}</td>
        <td className="px-4 py-3">{i.name}</td>
        <td className="px-4 py-3">{i.ttr_type === 'OU' ? 'Орг. учета' : i.ttr_type === 'OL' ? 'Обуст. линии' : i.ttr_type === 'TT' ? 'Трансф. тока' : 'Распред. щит'}</td>
        <td className="px-4 py-3">
          {isSueAdmin && (
            <div style={{display: 'flex', gap: '4px', flexWrap: 'nowrap', justifyContent: 'flex-end'}}>
              <button onClick={() => setModal({ item: i })} title="Редактировать"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
              <button onClick={() => setMaterialsModal(i)} title="Материалы"><Icon name="package" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
              <button onClick={() => setPuTypesModal(i)} title="Типы ПУ"><Icon name="plug" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
              <button onClick={() => setDeleteModal(i)} style={{color: 'red'}} title="Удалить"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
            </div>
          )}
        </td>
      </tr>
    ))}
  </tbody>
</table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый ТТР'}</h2>
            <TTRResForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} />
          </div>
        </div>
      )}
      {materialsModal && (
        <TTRMaterialsModal 
        ttr={materialsModal} 
        onClose={() => setMaterialsModal(null)} 
      />
    )}
      {deleteModal && (
  <DeleteWithCodeModal
    title={`Удалить ТТР "${deleteModal.code}"?`}
    onClose={() => setDeleteModal(null)}
    onDelete={async (code) => {
      try {
        await api.delete(`/ttr/res/${deleteModal.id}`, { data: { admin_code: code } })
        api.get('/ttr/res').then(r => setItems(r.data))
        setDeleteModal(null)
      } catch (err) {
        alert(err.response?.data?.detail || 'Ошибка удаления')
      }
    }}
  />
)}
      {puTypesModal && (
  <TTRPUTypesModal 
    ttr={puTypesModal} 
    onClose={() => setPuTypesModal(null)} 
  />
)}
    </>
  )
}

function TTRResForm({ item, onSave, onClose }) {
  const [form, setForm] = useState({ code: item?.code || '', name: item?.name || '', ttr_type: item?.ttr_type || 'OU', use_tt: item?.use_tt || false })
  return (
    <div className="space-y-3">
      <input type="text" placeholder="Код (напр. ТТР-1 ОУ)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <input type="text" placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <select value={form.ttr_type} onChange={e => setForm({ ...form, ttr_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="OU">Организация учета</option>
        <option value="OL">Обустройство линии</option>
        <option value="OR">Распред. щит</option>
        <option value="TT">Трансформатор тока (ТТ)</option>
      </select>
      <label className="flex items-center gap-2 mt-1">
        <input 
          type="checkbox" 
          checked={form.use_tt || false} 
          onChange={e => setForm({ ...form, use_tt: e.target.checked })} 
        />
        <span className="text-sm">Использовать ТТ (трансформатор тока)</span>
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}

function TTRMaterialsModal({ ttr, onClose }) {
  const [allMaterials, setAllMaterials] = useState([])
  const [ttrMaterials, setTtrMaterials] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/materials'),
      api.get(`/ttr/res/${ttr.id}/materials`)
    ]).then(([matRes, ttrMatRes]) => {
      setAllMaterials(matRes.data)
      // Преобразуем в удобный формат {material_id: quantity}
      const selected = {}
      ttrMatRes.data.forEach(m => {
        selected[m.material_id] = m.quantity
      })
      setTtrMaterials(selected)
      setLoading(false)
    })
  }, [ttr.id])

  const toggleMaterial = (matId) => {
    setTtrMaterials(prev => {
      if (prev[matId] !== undefined) {
        const copy = { ...prev }
        delete copy[matId]
        return copy
      } else {
        return { ...prev, [matId]: 1 }
      }
    })
  }

  const setQuantity = (matId, qty) => {
    setTtrMaterials(prev => ({ ...prev, [matId]: parseFloat(qty) || 0 }))
  }

  const handleSave = async () => {
    const materials = Object.entries(ttrMaterials).map(([material_id, quantity]) => ({
      material_id: parseInt(material_id),
      quantity
    }))
    await api.post(`/ttr/res/${ttr.id}/materials`, { materials })
    onClose()
  }

  if (loading) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white rounded-xl p-8"><RossetiLoader /></div></div>

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Материалы для {ttr.code}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-2"></th>
                <th className="px-2 py-2 text-left">Материал</th>
                <th className="px-2 py-2 text-left w-20">Ед.</th>
                <th className="px-2 py-2 text-left w-24">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {allMaterials.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-2 py-2">
                    <input 
                      type="checkbox" 
                      checked={ttrMaterials[m.id] !== undefined}
                      onChange={() => toggleMaterial(m.id)}
                    />
                  </td>
                  <td className="px-2 py-2">{m.name}</td>
                  <td className="px-2 py-2 text-gray-500">{m.unit}</td>
                  <td className="px-2 py-2">
                    {ttrMaterials[m.id] !== undefined && (
                      <input 
                        type="number" 
                        value={ttrMaterials[m.id]} 
                        onChange={e => setQuantity(m.id, e.target.value)}
                        className="w-full px-2 py-1 border rounded"
                        min="0"
                        step="0.1"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
        </div>
      </div>
    </div>
  )
}

function TTRPUTypesModal({ ttr, onClose }) {
  const [allPUTypes, setAllPUTypes] = useState([])
  const [linkedIds, setLinkedIds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/pu-types'),
      api.get(`/ttr/res/${ttr.id}/pu-types`)
    ]).then(([typesRes, linkedRes]) => {
      setAllPUTypes(typesRes.data)
      setLinkedIds(linkedRes.data.map(l => l.pu_type_id))
      setLoading(false)
    })
  }, [ttr.id])

  const toggleType = (id) => {
    setLinkedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    await api.post(`/ttr/res/${ttr.id}/pu-types`, { pu_type_ids: linkedIds })
    onClose()
  }

  if (loading) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white rounded-xl p-8"><RossetiLoader /></div></div>

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Типы ПУ для {ttr.code}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-96">
          {allPUTypes.length === 0 ? (
            <p className="text-gray-500 text-center">Нет типов ПУ в справочнике</p>
          ) : (
            <div className="space-y-2">
              {allPUTypes.map(pt => (
                <label key={pt.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={linkedIds.includes(pt.id)}
                    onChange={() => toggleType(pt.id)}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium">{pt.pattern}</div>
                    <div className="text-sm text-gray-500">
                      {pt.faza || '—'} • {pt.voltage ? `${pt.voltage} кВ` : '—'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
        </div>
      </div>
    </div>
  )
}

// --- ТТР ЭСК ---
function TTREskTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [filter, setFilter] = useState('')
  const [deleteModal, setDeleteModal] = useState(null)  // ДОБАВЛЕНО

  useEffect(() => { api.get('/ttr/esk').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/ttr/esk/${modal.item.id}`, data)
    } else {
      await api.post('/ttr/esk', data)
    }
    api.get('/ttr/esk').then(r => setItems(r.data))
    setModal(null)
  }

  // УДАЛЁН старый handleDelete с confirm()

  const ttrTypeLabels = { PU: 'ПУ', TRUBOSTOYKA: 'Трубостойка', OTVETVLENIE: 'Ответвление' }
  const vaTypeLabels = { opora: 'Опора', fasad: 'Фасад', trubostoyka: 'Трубостойка' }
  const formFactorLabels = { split: 'Сплит', classic: 'Классика' }
  
  const filtered = filter ? items.filter(i => i.ttr_type === filter) : items
  
  return (
    <>
      <div className="flex justify-between mb-4">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 border rounded-lg">
          <option value="">Все типы</option>
          <option value="PU">ПУ</option>
          <option value="TRUBOSTOYKA">Трубостойка</option>
          <option value="OTVETVLENIE">Ответвление</option>
        </select>
        {isSueAdmin && (
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Тип ТТР</th>
              <th className="px-4 py-3 text-left">Вид работ</th>
              <th className="px-4 py-3 text-left">Наименование ПУ</th>
              <th className="px-4 py-3 text-left">Фазность</th>
              <th className="px-4 py-3 text-left">Форм-фактор</th>
              <th className="px-4 py-3 text-left">Щит с ВА</th>
              <th className="px-4 py-3 text-left">№ ЛСР</th>
              <th className="px-4 py-3 text-left">Без НДС</th>
              <th className="px-4 py-3 text-left">С НДС</th>
              {isSueAdmin && <th className="w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${i.ttr_type === 'PU' ? 'bg-blue-100 text-blue-700' : i.ttr_type === 'TRUBOSTOYKA' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {ttrTypeLabels[i.ttr_type] || i.ttr_type}
                  </span>
                </td>
                <td className="px-4 py-3">{i.work_type_name || '—'}</td>
                <td className="px-4 py-3">{i.pu_pattern || '—'}</td>
                <td className="px-4 py-3">{i.faza || '—'}</td>
                <td className="px-4 py-3">{formFactorLabels[i.form_factor] || '—'}</td>
                <td className="px-4 py-3">{vaTypeLabels[i.va_type] || '—'}</td>
                <td className="px-4 py-3 font-mono">{i.lsr_number || '—'}</td>
                <td className="px-4 py-3">{i.price_no_nds?.toLocaleString() || '—'} ₽</td>
                <td className="px-4 py-3">{i.price_with_nds?.toLocaleString() || '—'} ₽</td>
                {isSueAdmin && (
                  <td className="px-4 py-3">
                    <button onClick={() => setModal({ item: i })} className="mr-2"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                    <button onClick={() => setDeleteModal(i)} className="text-red-500"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый ТТР ЭСК'}</h2>
            <TTREskForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} />
          </div>
        </div>
      )}

      {/* <Icon name="arrowLeft" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ДОБАВЛЕНО: Модалка удаления с паролем */}
      {deleteModal && (
        <DeleteWithCodeModal
          title={`Удалить ТТР "${deleteModal.work_type_name || deleteModal.lsr_number}"?`}
          onClose={() => setDeleteModal(null)}
          onDelete={async (code) => {
            try {
              await api.delete(`/ttr/esk/${deleteModal.id}`, { data: { admin_code: code } })
              api.get('/ttr/esk').then(r => setItems(r.data))
              setDeleteModal(null)
            } catch (err) {
              alert(err.response?.data?.detail || 'Ошибка удаления')
            }
          }}
        />
      )}
    </>
  )
}

function TTREskForm({ item, onSave, onClose }) {
  const [form, setForm] = useState({ 
    ttr_type: item?.ttr_type || 'PU',
    work_type_name: item?.work_type_name || '',
    pu_pattern: item?.pu_pattern || '',
    faza: item?.faza || '', 
    form_factor: item?.form_factor || '',
    va_type: item?.va_type || '',
    lsr_number: item?.lsr_number || '',
    price_no_nds: item?.price_no_nds || 0, 
    price_with_nds: item?.price_with_nds || 0 
  })
  
  const isPU = form.ttr_type === 'PU'
  
  return (
    <div className="space-y-3">
      <select value={form.ttr_type} onChange={e => setForm({ ...form, ttr_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="PU">ПУ</option>
        <option value="TRUBOSTOYKA">Трубостойка</option>
        <option value="OTVETVLENIE">Ответвление</option>
      </select>
      
      <input type="text" placeholder="Наименование вида работ" value={form.work_type_name} onChange={e => setForm({ ...form, work_type_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      
      {isPU && (
        <>
          <input type="text" placeholder="Наименование ПУ (паттерн, напр. НАРТИС)" value={form.pu_pattern} onChange={e => setForm({ ...form, pu_pattern: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          <select value={form.faza} onChange={e => setForm({ ...form, faza: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Фазность...</option>
            <option value="1ф">1 фаза</option>
            <option value="3ф">3 фазы</option>
          </select>
          <select value={form.form_factor} onChange={e => setForm({ ...form, form_factor: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Форм-фактор...</option>
            <option value="split">Сплит</option>
            <option value="classic">Классика</option>
          </select>
          <select value={form.va_type} onChange={e => setForm({ ...form, va_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Щит с ВА...</option>
            <option value="opora">Опора</option>
            <option value="fasad">Фасад</option>
            <option value="trubostoyka">Трубостойка</option>
          </select>
        </>
      )}
      
      <input type="text" placeholder="Номер ЛСР" value={form.lsr_number} onChange={e => setForm({ ...form, lsr_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <input type="number" placeholder="Стоимость без НДС" value={form.price_no_nds} onChange={e => setForm({ ...form, price_no_nds: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" />
      <input type="number" placeholder="Стоимость с НДС" value={form.price_with_nds} onChange={e => setForm({ ...form, price_with_nds: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" />
      
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}



// --- Материалы ---
function MaterialsTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  useEffect(() => { api.get('/materials').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/materials/${modal.item.id}`, data)
    } else {
      await api.post('/materials', data)
    }
    api.get('/materials').then(r => setItems(r.data))
    setModal(null)
  }

  return (
    <>
      {isSueAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
  <thead className="bg-gray-50">
    <tr>
      <th className="px-4 py-3 text-left">Название</th>
      <th className="px-4 py-3 text-left">Ед. изм.</th>
      {isSueAdmin && <th className="px-4 py-3 text-right w-24">Действия</th>}
    </tr>
  </thead>
  <tbody>
    {items.map(i => (
      <tr key={i.id} className="border-t">
        <td className="px-4 py-3">{i.name}</td>
        <td className="px-4 py-3">{i.unit}</td>
        {isSueAdmin && (
          <td className="px-4 py-3 text-right">
            <button onClick={() => setModal({ item: i })} className="px-1" title="Редактировать"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
            <button onClick={() => setDeleteModal(i)} className="px-1 text-red-500" title="Удалить"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
          </td>
        )}
      </tr>
    ))}
  </tbody>
</table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый материал'}</h2>
            <MaterialForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} />
          </div>
        </div>
      )}
      {deleteModal && (
  <DeleteWithCodeModal
    title={`Удалить материал "${deleteModal.name}"?`}
    onClose={() => setDeleteModal(null)}
    onDelete={async (code) => {
      try {
        await api.delete(`/materials/${deleteModal.id}`, { data: { admin_code: code } })
        api.get('/materials').then(r => setItems(r.data))
        setDeleteModal(null)
      } catch (err) {
        alert(err.response?.data?.detail || 'Ошибка удаления')
      }
    }}
  />
)}
  </>
  )
}

function MaterialForm({ item, onSave, onClose }) {
  const [form, setForm] = useState({ name: item?.name || '', unit: item?.unit || 'шт' })
  return (
    <div className="space-y-3">
      <input type="text" placeholder="Название материала" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <input type="text" placeholder="Ед. измерения (шт, м, кг)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}

// --- Типы ПУ ---
function PUTypesTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)  // добавлено

  useEffect(() => { api.get('/pu-types').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/pu-types/${modal.item.id}`, data)
    } else {
      await api.post('/pu-types', data)
    }
    api.get('/pu-types').then(r => setItems(r.data))
    setModal(null)
  }

  return (
    <>
      {isSueAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Паттерн</th>
              <th className="px-4 py-3 text-left">Фазность</th>
              <th className="px-4 py-3 text-left">Напряжение</th>
              <th className="px-4 py-3 text-left">Форм-фактор</th>
              {isSueAdmin && <th className="w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-3 font-mono">{i.pattern}</td>
                <td className="px-4 py-3">{i.faza || '—'}</td>
                <td className="px-4 py-3">{i.voltage || '—'}</td>
                <td className="px-4 py-3">{i.form_factor === 'split' ? 'Сплит' : i.form_factor === 'classic' ? 'Классика' : '—'}</td>
                {isSueAdmin && (
                  <td className="px-4 py-3">
                    <button onClick={() => setModal({ item: i })} className="mr-2"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                    <button onClick={() => setDeleteModal(i)} className="text-red-500"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый тип ПУ'}</h2>
            <PUTypeForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} />
          </div>
        </div>
      )}

      {deleteModal && (
        <DeleteWithCodeModal
          title={`Удалить тип ПУ "${deleteModal.pattern}"?`}
          onClose={() => setDeleteModal(null)}
          onDelete={async (code) => {
            try {
              await api.delete(`/pu-types/${deleteModal.id}`, { data: { admin_code: code } })
              api.get('/pu-types').then(r => setItems(r.data))
              setDeleteModal(null)
            } catch (err) {
              alert(err.response?.data?.detail || 'Ошибка удаления')
            }
          }}
        />
      )}
    </>
  )
}

// --- Номиналы ВА ---
function VANominalsTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  useEffect(() => { api.get('/va-nominals').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/va-nominals/${modal.item.id}`, data)
    } else {
      await api.post('/va-nominals', data)
    }
    api.get('/va-nominals').then(r => setItems(r.data))
    setModal(null)
  }

  return (
    <>
      {isSueAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Номинал ВА</th>
              {isSueAdmin && <th className="px-4 py-3 text-right w-24">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-3 font-medium">{i.name}</td>
                {isSueAdmin && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setModal({ item: i })} className="px-1"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                    <button onClick={() => setDeleteModal(i)} className="px-1 text-red-500"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый номинал ВА'}</h2>
            <NominalForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} placeholder="Например: 16А, 25А, 32А" />
          </div>
        </div>
      )}

      {deleteModal && (
        <DeleteWithCodeModal
          title={`Удалить номинал "${deleteModal.name}"?`}
          onClose={() => setDeleteModal(null)}
          onDelete={async (code) => {
            try {
              await api.delete(`/va-nominals/${deleteModal.id}`, { data: { admin_code: code } })
              api.get('/va-nominals').then(r => setItems(r.data))
              setDeleteModal(null)
            } catch (err) {
              alert(err.response?.data?.detail || 'Ошибка удаления')
            }
          }}
        />
      )}
    </>
  )
}


// --- Номиналы ТТ ---
function TTNominalsTab() {
  const { isSueAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  useEffect(() => { api.get('/tt-nominals').then(r => setItems(r.data)) }, [])

  const handleSave = async (data) => {
    if (modal.item) {
      await api.put(`/tt-nominals/${modal.item.id}`, data)
    } else {
      await api.post('/tt-nominals', data)
    }
    api.get('/tt-nominals').then(r => setItems(r.data))
    setModal(null)
  }

  return (
    <>
      {isSueAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setModal({ item: null })} className="px-4 py-2 bg-blue-600 text-white rounded-lg"><Icon name="plus" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Добавить</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Номинал ТТ</th>
              {isSueAdmin && <th className="px-4 py-3 text-right w-24">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className="border-t">
                <td className="px-4 py-3 font-medium">{i.name}</td>
                {isSueAdmin && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setModal({ item: i })} className="px-1"><Icon name="edit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                    <button onClick={() => setDeleteModal(i)} className="px-1 text-red-500"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.15em]" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{modal.item ? 'Редактировать' : 'Новый номинал ТТ'}</h2>
            <NominalForm item={modal.item} onSave={handleSave} onClose={() => setModal(null)} placeholder="Например: 100/5, 200/5, 400/5" />
          </div>
        </div>
      )}

      {deleteModal && (
        <DeleteWithCodeModal
          title={`Удалить номинал "${deleteModal.name}"?`}
          onClose={() => setDeleteModal(null)}
          onDelete={async (code) => {
            try {
              await api.delete(`/tt-nominals/${deleteModal.id}`, { data: { admin_code: code } })
              api.get('/tt-nominals').then(r => setItems(r.data))
              setDeleteModal(null)
            } catch (err) {
              alert(err.response?.data?.detail || 'Ошибка удаления')
            }
          }}
        />
      )}
    </>
  )
}


// --- Общая форма для номиналов ---
function NominalForm({ item, onSave, onClose, placeholder }) {
  const [name, setName] = useState(item?.name || '')
  return (
    <div className="space-y-3">
      <input 
        type="text" 
        placeholder={placeholder} 
        value={name} 
        onChange={e => setName(e.target.value)} 
        className="w-full px-3 py-2 border rounded-lg" 
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave({ name })} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}

function PUTypeForm({ item, onSave, onClose }) {
  const [form, setForm] = useState({ 
    pattern: item?.pattern || '', 
    faza: item?.faza || '', 
    voltage: item?.voltage || '',
    form_factor: item?.form_factor || ''
  })
  return (
    <div className="space-y-3">
      <input type="text" placeholder="Паттерн (напр. НАРТИС И100 SP)" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      <select value={form.faza} onChange={e => setForm({ ...form, faza: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="">Фазность...</option>
        <option value="1ф">1 фаза</option>
        <option value="3ф">3 фазы</option>
      </select>
      <select value={form.voltage} onChange={e => setForm({ ...form, voltage: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="">Напряжение...</option>
        <option value="0.23">0,23 кВ</option>
        <option value="0.4">0,4 кВ</option>
        <option value="6">6 кВ</option>
        <option value="10">10 кВ</option>
      </select>
      <select value={form.form_factor} onChange={e => setForm({ ...form, form_factor: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
        <option value="">Форм-фактор...</option>
        <option value="split">Сплит</option>
        <option value="classic">Классика</option>
      </select>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
        <button onClick={() => onSave(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Сохранить</button>
      </div>
    </div>
  )
}

// --- Система ---
function SystemTab() {
  const [clearModal, setClearModal] = useState(false)
  const [healthCheck, setHealthCheck] = useState(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingIssues, setLoadingIssues] = useState(false)

  const runHealthCheck = async () => {
    setLoadingHealth(true)
    try {
      const r = await api.get('/admin/health-check')
      setHealthCheck(r.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
    setLoadingHealth(false)
  }

  const exportIssues = async () => {
    setLoadingIssues(true)
    try {
      const response = await api.get('/admin/export-issues', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Проблемные_ПУ_${new Date().toISOString().slice(0,10)}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      if (err.response?.status === 404) {
        alert('Проблем не найдено! Все ПУ в порядке.')
      } else {
        alert(err.response?.data?.detail || 'Ошибка выгрузки')
      }
    }
    setLoadingIssues(false)
  }

  const downloadBackup = async () => {
    setLoadingBackup(true)
    try {
      const response = await api.get('/admin/backup', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `backup_${new Date().toISOString().slice(0,10)}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      alert('Ошибка создания бэкапа')
    }
    setLoadingBackup(false)
  }

  const handleRestore = async (e) => {
  const file = e.target.files[0]
  if (!file) return

  if (!confirm('ВНИМАНИЕ! Восстановление добавит данные из бэкапа.\n\nПродолжить?')) {
    e.target.value = ''
    return
  }

  const formData = new FormData()
  formData.append('file', file)

  try {
    const r = await api.post('/admin/restore', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    alert(`Восстановлено:\n• ПУ: ${r.data.restored.pu_items}\n• ТТР РЭС: ${r.data.restored.ttr_res}\n• ТТР ЭСК: ${r.data.restored.ttr_esk}\n• Материалы: ${r.data.restored.materials}\n• Номиналы ВА: ${r.data.restored.va_nominals}\n• Номиналы ТТ: ${r.data.restored.tt_nominals}`)
    runHealthCheck()
  } catch (err) {
    alert('Ошибка восстановления: ' + (err.response?.data?.detail || err.message))
  }
  e.target.value = ''
}

  return (
    <div className="space-y-6">
      {/* Диагностика */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-blue-600"><Icon name="search" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Диагностика системы</h2>
        
    <div className="flex gap-4 flex-wrap">
      <button onClick={runHealthCheck} disabled={loadingHealth} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
        {loadingHealth ? 'Проверка...' : 'Проверить базу'}
      </button>
      <button onClick={exportIssues} disabled={loadingIssues} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
        {loadingIssues ? 'Формирование...' : 'Выгрузить проблемные ПУ'}
      </button>
      <button onClick={downloadBackup} disabled={loadingBackup} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">
        {loadingBackup ? 'Создание...' : 'Скачать бэкап'}
      </button>
      <label className="px-4 py-2 bg-orange-500 text-white rounded-lg cursor-pointer hover:bg-orange-600">
        <Icon name="download" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Восстановить из бэкапа
        <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
      </label>
    </div>

        {healthCheck && (
          <div className={`p-4 rounded-lg ${healthCheck.status === 'OK' ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xl ${healthCheck.status === 'OK' ? 'text-green-600' : 'text-yellow-600'}`}>
                {healthCheck.status === 'OK' ? <Icon name="checkCircle" className="w-5 h-5 inline-block text-emerald-600" /> : <Icon name="alert" className="w-5 h-5 inline-block text-amber-500" />}
              </span>
              <span className="font-semibold">
                {healthCheck.status === 'OK' ? 'Всё в порядке' : `Найдено проблем: ${healthCheck.issues_count}`}
              </span>
            </div>
            
            {healthCheck.issues.length > 0 && (
              <div className="mb-3 p-3 bg-white rounded border text-sm">
                {healthCheck.issues.map((issue, idx) => (
                  <div key={idx} className="py-1">{issue}</div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="bg-white p-2 rounded border text-center">
                <div className="font-bold text-lg">{healthCheck.stats.total_pu}</div>
                <div className="text-gray-500">ПУ</div>
              </div>
              <div className="bg-white p-2 rounded border text-center">
                <div className="font-bold text-lg">{healthCheck.stats.total_users}</div>
                <div className="text-gray-500">Пользователи</div>
              </div>
              <div className="bg-white p-2 rounded border text-center">
                <div className="font-bold text-lg">{healthCheck.stats.total_ttr_res}</div>
                <div className="text-gray-500">ТТР РЭС</div>
              </div>
              <div className="bg-white p-2 rounded border text-center">
                <div className="font-bold text-lg">{healthCheck.stats.total_materials}</div>
                <div className="text-gray-500">Материалы</div>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-gray-400">Проверено: {new Date(healthCheck.checked_at).toLocaleString('ru')}</div>
          </div>
        )}
      </div>

      {/* Опасная зона */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-red-600"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Опасная зона</h2>
        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
          <div>
            <div className="font-medium">Очистить базу данных</div>
            <div className="text-sm text-gray-500">Удалить все ПУ и загрузки</div>
          </div>
          <button onClick={() => setClearModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg">Очистить</button>
        </div>
      </div>

      {clearModal && (
        <DeleteWithCodeModal
          title="Очистить базу данных?"
          onClose={() => setClearModal(false)}
          onDelete={async (code) => {
            try {
              await api.post('/pu/clear-database', { admin_code: code })
              alert('База очищена')
              setClearModal(false)
            } catch (err) {
              alert(err.response?.data?.detail || 'Ошибка')
            }
          }}
        />
      )}
    </div>
  )
}

function BulkUpdateTab() {
  const [file, setFile] = useState(null)
  const [adminCode, setAdminCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState('types') // types или move

 const handleUpload = async () => {
    if (mode !== 'autofaza' && mode !== 'formfactor' && !file) {
      alert('Выберите файл')
      return
    }
    if (!adminCode) {
      alert('Введите код администратора')
      return
    }

    setLoading(true)
    const formData = new FormData()
    if (file) formData.append('file', file)
    formData.append('admin_code', adminCode)

    try {
      const endpoint = mode === 'types' ? '/pu/update-types-bulk' 
        : mode === 'naznachenie' ? '/pu/import-naznachenie' 
        : mode === 'autofaza' ? '/pu/auto-fill-faza' 
        : mode === 'formfactor' ? '/pu/auto-fill-formfactor'
        : '/pu/move-bulk'
      const r = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(r.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка загрузки')
    }
    setLoading(false)
  }

  const resetForm = () => {
    setFile(null)
    setAdminCode('')
    setResult(null)
  }

  return (
    <div className="space-y-6">
      {/* Выбор режима */}
      <div className="flex gap-2 flex-wrap">
        <button 
          onClick={() => { setMode('types'); resetForm() }} 
          className={`px-4 py-2 rounded-lg ${mode === 'types' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          <Icon name="fileEdit" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Корректировка типов ПУ
        </button>
        <button 
          onClick={() => { setMode('move'); resetForm() }} 
          className={`px-4 py-2 rounded-lg ${mode === 'move' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          <Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Массовое перемещение
        </button>
        <button 
          onClick={() => { setMode('naznachenie'); resetForm() }} 
          className={`px-4 py-2 rounded-lg ${mode === 'naznachenie' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          <Icon name="tag" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Загрузка назначений
        </button>
        <button 
          onClick={() => { setMode('autofaza'); resetForm() }} 
          className={`px-4 py-2 rounded-lg ${mode === 'autofaza' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          <Icon name="zap" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Автозаполнение фазы
        </button>
        <button 
          onClick={() => { setMode('formfactor'); resetForm() }} 
          className={`px-4 py-2 rounded-lg ${mode === 'formfactor' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          <Icon name="ruler" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Автозаполнение форм-фактора
        </button>
      </div>

      {/* Инструкция */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2"><Icon name="clipboard" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Формат файла Excel:</h3>
        {mode === 'types' ? (
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• <b>Колонка A:</b> Серийный номер ПУ</li>
            <li>• <b>Колонка B:</b> Новый тип ПУ</li>
          </ul>
        ) : mode === 'naznachenie' ? (
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• <b>Колонка A:</b> Серийный номер ПУ</li>
            <li>• <b>Колонка B:</b> Назначение (ИЖЦ, Техприс, Замена)</li>
          </ul>
        ) : mode === 'autofaza' ? (
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Файл <b>не требуется</b></li>
            <li>• Автоматически заполнит фазность, форм-фактор и напряжение</li>
            <li>• Для всех ПУ где фаза пустая — по справочнику типов</li>
          </ul>
        ) : mode === 'formfactor' ? (
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Файл <b>не требуется</b></li>
            <li>• Автоматически заполнит форм-фактор по справочнику типов ПУ</li>
            <li>• Только для ПУ где форм-фактор ещё не указан</li>
          </ul>
         ) : (
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• <b>Колонка A:</b> Серийный номер ПУ</li>
            <li>• <b>Колонка B:</b> Название подразделения ЭСК</li>
          </ul>
        )}
      </div>

      {result ? (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="text-center">
            <div className="mb-4 flex justify-center"><span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600"><Icon name="checkCircle" className="w-9 h-9" /></span></div>
            <h3 className="text-xl font-semibold text-green-600">
              {mode === 'types' ? 'Обновлено' : 'Перемещено'}: {result.updated || result.moved} ПУ
            </h3>
            <p className="text-gray-500">
              {result.total_rows ? `Всего строк в файле: ${result.total_rows}` : 
               result.total_checked !== undefined ? `Проверено ПУ: ${result.total_checked}` : ''}
</          p>
          </div>

          {(result.not_found_pu?.length > 0 || result.not_found?.length > 0) && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">
                <Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ПУ не найдены ({(result.not_found_pu || result.not_found).length}):
              </h4>
              <div className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                {(result.not_found_pu || result.not_found).join(', ')}
              </div>
            </div>
          )}

          {result.not_found_unit?.length > 0 && (
            <div className="bg-orange-50 rounded-lg p-4">
              <h4 className="font-medium text-orange-800 mb-2">
                <Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Подразделения не найдены ({result.not_found_unit.length}):
              </h4>
              <div className="text-sm text-orange-700 max-h-32 overflow-y-auto">
                {result.not_found_unit.map((item, idx) => <div key={idx}>{item}</div>)}
              </div>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2"><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Ошибки ({result.errors.length}):</h4>
              <div className="text-sm text-red-700 max-h-32 overflow-y-auto">
                {result.errors.map((err, idx) => <div key={idx}>{err}</div>)}
              </div>
            </div>
          )}

          <div className="text-center">
            <button onClick={resetForm} className="px-6 py-2 bg-blue-600 text-white rounded-lg">
              Загрузить ещё
            </button>
          </div>
        </div>
     ) : (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          {mode !== 'autofaza' && mode !== 'formfactor' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Файл Excel (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files[0])}
                className="w-full px-3 py-2 border rounded-lg"
              />
              {file && <p className="mt-2 text-sm text-green-600"><Icon name="check" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> {file.name}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Код администратора</label>
            <input
              type="password"
              value={adminCode}
              onChange={e => setAdminCode(e.target.value)}
              placeholder="Введите код"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={loading || (mode !== 'autofaza' && mode !== 'formfactor' && !file) || !adminCode}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Обработка...' : mode === 'types' ? 'Обновить типы ПУ' : mode === 'naznachenie' ? 'Загрузить назначения' : mode === 'autofaza' ? 'Заполнить фазность' : mode === 'formfactor' ? 'Заполнить форм-фактор' : 'Переместить ПУ'}
          </button>
        </div>
      )}
    </div>
  )
}

function ClearDBModal({ onClose, onClear }) {
  const [code, setCode] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-red-600"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Очистка базы данных</h2>
        <p className="text-gray-600 mb-4">Все ПУ и загрузки будут удалены. Это действие нельзя отменить!</p>
        <input type="password" placeholder="Код администратора" value={code} onChange={e => setCode(e.target.value)} className="w-full px-3 py-2 border rounded-lg mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg">Отмена</button>
          <button onClick={() => code && onClear(code)} className="px-4 py-2 bg-red-600 text-white rounded-lg">Очистить</button>
        </div>
      </div>
    </div>
  )
}

function MoveBulkPage() {
  const { isEskAdmin, isSueAdmin, isOksAdmin } = useAuth()
  const [file, setFile] = useState(null)
  const [adminCode, setAdminCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  if (!isEskAdmin && !isSueAdmin && !isOksAdmin) {
    return <div className="text-center py-12 text-gray-500">Нет доступа</div>
  }

  const handleUpload = async () => {
    if (!file || !adminCode) {
      alert('Выберите файл и введите код администратора')
      return
    }

    setLoading(true)
    const formData = new FormData()
    if (file) formData.append('file', file)
    formData.append('admin_code', adminCode)

    try {
      const r = await api.post('/pu/move-bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(r.data)
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка загрузки')
    }
    setLoading(false)
  }

  const resetForm = () => {
    setFile(null)
    setAdminCode('')
    setResult(null)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold"><Icon name="package" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Массовое перемещение ПУ</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2"><Icon name="clipboard" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Формат файла Excel:</h3>
        <ul className="text-blue-700 text-sm space-y-1">
          <li>• <b>Колонка A:</b> Серийный номер ПУ</li>
          <li>• <b>Колонка B:</b> Название подразделения (ЭСК — напр. «Адлерский ЭСК», ОКС — напр. «ОКС Адлерский РЭС»)</li>
        </ul>
      </div>

      {result ? (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="text-center">
            <div className="mb-4 flex justify-center"><span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600"><Icon name="checkCircle" className="w-9 h-9" /></span></div>
            <h3 className="text-xl font-semibold text-green-600">Перемещено: {result.moved} ПУ</h3>
            <p className="text-gray-500">Всего строк в файле: {result.total_rows}</p>
          </div>

          {result.not_found_pu.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ПУ не найдены ({result.not_found_pu.length}):</h4>
              <div className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                {result.not_found_pu.join(', ')}
              </div>
            </div>
          )}

          {result.not_found_unit.length > 0 && (
            <div className="bg-orange-50 rounded-lg p-4">
              <h4 className="font-medium text-orange-800 mb-2"><Icon name="alert" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Подразделения не найдены ({result.not_found_unit.length}):</h4>
              <div className="text-sm text-orange-700 max-h-32 overflow-y-auto">
                {result.not_found_unit.map((item, idx) => <div key={idx}>{item}</div>)}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2"><Icon name="x" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Ошибки ({result.errors.length}):</h4>
              <div className="text-sm text-red-700 max-h-32 overflow-y-auto">
                {result.errors.map((err, idx) => <div key={idx}>{err}</div>)}
              </div>
            </div>
          )}

          <div className="text-center">
            <button onClick={resetForm} className="px-6 py-2 bg-blue-600 text-white rounded-lg">
              Загрузить ещё
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Файл Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files[0])}
              className="w-full px-3 py-2 border rounded-lg"
            />
            {file && <p className="mt-2 text-sm text-green-600"><Icon name="check" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> {file.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Код администратора</label>
            <input
              type="password"
              value={adminCode}
              onChange={e => setAdminCode(e.target.value)}
              placeholder="Введите код"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={loading || (mode !== 'autofaza' && mode !== 'formfactor' && !file) || !adminCode}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Обработка...' : 'Переместить ПУ'}
          </button>
        </div>
      )}
    </div>
  )
}
function AnalysisPage() {
  const { isSueAdmin, isEskAdmin, isResUser, isEskUser, isOksAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeSection, setActiveSection] = useState('total')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const r = await api.get('/pu/analysis', { params })
      setData(r.data)
    } catch (err) {
      console.error('Analysis error:', err)
    }
    setLoading(false)
  }

  const handleFilter = () => { load() }
  const clearFilter = () => { setDateFrom(''); setDateTo(''); setTimeout(load, 100) }

  const isAdmin = isSueAdmin || isEskAdmin || isOksAdmin

  const nazLabels = { IZHC: 'ИЖЦ', TECHPRIS: 'Техприс', ZAMENA: 'Замены' }
  const sectionLabels = { total: 'Всего ПУ', installed: 'Установлено', actioned: 'Актировано', sklad: 'Остаток склад' }
  const sectionColors = { total: 'blue', installed: 'green', actioned: 'indigo', sklad: 'gray' }

const renderBreakdownTable = (units, totals, title, bgColor) => {
    if (!units || units.length === 0) return null

    return (
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className={`${bgColor} px-4 py-3 border-b`}>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th rowSpan={3} className="px-3 py-2 text-left border-r sticky left-0 bg-gray-100 min-w-[150px]">Подразделение</th>
                <th colSpan={5} className="px-2 py-1 text-center border-r bg-purple-50">ИЖЦ</th>
                <th colSpan={5} className="px-2 py-1 text-center border-r bg-green-50">Техприс</th>
                <th colSpan={5} className="px-2 py-1 text-center bg-yellow-50">Замены</th>
              </tr>
              <tr className="bg-gray-50 border-b">
                <th colSpan={2} className="px-2 py-1 text-center border-r text-purple-700">Сплит</th>
                <th colSpan={3} className="px-2 py-1 text-center border-r text-purple-700">Классика</th>
                <th colSpan={2} className="px-2 py-1 text-center border-r text-green-700">Сплит</th>
                <th colSpan={3} className="px-2 py-1 text-center border-r text-green-700">Классика</th>
                <th colSpan={2} className="px-2 py-1 text-center border-r text-yellow-700">Сплит</th>
                <th colSpan={3} className="px-2 py-1 text-center text-yellow-700">Классика</th>
              </tr>
              <tr className="bg-gray-50 border-b text-[10px]">
                <th className="px-1 py-1 text-center border-r">1Ф</th>
                <th className="px-1 py-1 text-center border-r">3Ф</th>
                <th className="px-1 py-1 text-center border-r">1ф</th>
                <th className="px-1 py-1 text-center border-r">3ф</th>
                <th className="px-1 py-1 text-center border-r">3фтт</th>
                <th className="px-1 py-1 text-center border-r">1Ф</th>
                <th className="px-1 py-1 text-center border-r">3Ф</th>
                <th className="px-1 py-1 text-center border-r">1ф</th>
                <th className="px-1 py-1 text-center border-r">3ф</th>
                <th className="px-1 py-1 text-center border-r">3фтт</th>
                <th className="px-1 py-1 text-center border-r">1Ф</th>
                <th className="px-1 py-1 text-center border-r">3Ф</th>
                <th className="px-1 py-1 text-center border-r">1ф</th>
                <th className="px-1 py-1 text-center border-r">3ф</th>
                <th className="px-1 py-1 text-center">3фтт</th>
              </tr>
            </thead>
            <tbody>
              {units.map(unit => {
                const bd = unit.breakdown?.[activeSection] || {}
                const cell = (val) => {
                  const v = val || 0
                  if (v === 0) return <span className="text-gray-300">—</span>
                  return <span className="font-semibold text-green-800">{v}</span>
                }
                const cellBg = (val) => (val || 0) > 0 ? 'bg-green-50' : ''
                return (
                  <tr key={unit.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium border-r sticky left-0 bg-white">{unit.name}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.IZHC?.split?.['1ф'])}`}>{cell(bd.IZHC?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.IZHC?.split?.['3ф'])}`}>{cell(bd.IZHC?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.IZHC?.classic?.['1ф'])}`}>{cell(bd.IZHC?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.IZHC?.classic?.['3ф'])}`}>{cell(bd.IZHC?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.IZHC?.classic?.['3фтт'])}`}>{cell(bd.IZHC?.classic?.['3фтт'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.TECHPRIS?.split?.['1ф'])}`}>{cell(bd.TECHPRIS?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.TECHPRIS?.split?.['3ф'])}`}>{cell(bd.TECHPRIS?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.TECHPRIS?.classic?.['1ф'])}`}>{cell(bd.TECHPRIS?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.TECHPRIS?.classic?.['3ф'])}`}>{cell(bd.TECHPRIS?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.TECHPRIS?.classic?.['3фтт'])}`}>{cell(bd.TECHPRIS?.classic?.['3фтт'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.ZAMENA?.split?.['1ф'])}`}>{cell(bd.ZAMENA?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.ZAMENA?.split?.['3ф'])}`}>{cell(bd.ZAMENA?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.ZAMENA?.classic?.['1ф'])}`}>{cell(bd.ZAMENA?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellBg(bd.ZAMENA?.classic?.['3ф'])}`}>{cell(bd.ZAMENA?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center ${cellBg(bd.ZAMENA?.classic?.['3фтт'])}`}>{cell(bd.ZAMENA?.classic?.['3фтт'])}</td>
                  </tr>
                )
              })}
              {isAdmin && totals && (() => {
                const bd = totals.breakdown?.[activeSection] || {}
                const cellT = (val) => {
                  const v = val || 0
                  if (v === 0) return <span className="text-gray-400">—</span>
                  return <span className="font-bold text-green-900">{v}</span>
                }
                const cellTBg = (val) => (val || 0) > 0 ? 'bg-green-100' : ''
                return (
                  <tr className="border-t bg-gray-100 font-bold">
                    <td className="px-3 py-2 border-r sticky left-0 bg-gray-100">ИТОГО</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.IZHC?.split?.['1ф'])}`}>{cellT(bd.IZHC?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.IZHC?.split?.['3ф'])}`}>{cellT(bd.IZHC?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.IZHC?.classic?.['1ф'])}`}>{cellT(bd.IZHC?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.IZHC?.classic?.['3ф'])}`}>{cellT(bd.IZHC?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.IZHC?.classic?.['3фтт'])}`}>{cellT(bd.IZHC?.classic?.['3фтт'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.TECHPRIS?.split?.['1ф'])}`}>{cellT(bd.TECHPRIS?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.TECHPRIS?.split?.['3ф'])}`}>{cellT(bd.TECHPRIS?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.TECHPRIS?.classic?.['1ф'])}`}>{cellT(bd.TECHPRIS?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.TECHPRIS?.classic?.['3ф'])}`}>{cellT(bd.TECHPRIS?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.TECHPRIS?.classic?.['3фтт'])}`}>{cellT(bd.TECHPRIS?.classic?.['3фтт'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.ZAMENA?.split?.['1ф'])}`}>{cellT(bd.ZAMENA?.split?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.ZAMENA?.split?.['3ф'])}`}>{cellT(bd.ZAMENA?.split?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.ZAMENA?.classic?.['1ф'])}`}>{cellT(bd.ZAMENA?.classic?.['1ф'])}</td>
                    <td className={`px-1 py-2 text-center border-r ${cellTBg(bd.ZAMENA?.classic?.['3ф'])}`}>{cellT(bd.ZAMENA?.classic?.['3ф'])}</td>
                    <td className={`px-1 py-2 text-center ${cellTBg(bd.ZAMENA?.classic?.['3фтт'])}`}>{cellT(bd.ZAMENA?.classic?.['3фтт'])}</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold"><Icon name="chart" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Анализ остатков</h1>
        <button onClick={load} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Icon name="refresh" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> Обновить</button>
      </div>

      {/* Фильтр по периоду */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Период с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border rounded-lg" />
          </div>
          <button onClick={handleFilter} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Применить</button>
          {(dateFrom || dateTo) && (
            <button onClick={clearFilter} className="px-4 py-2 bg-gray-100 rounded-lg">Сбросить</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12"><RossetiLoader /></div>
      ) : data && (
        <div className="space-y-6">
          {/* Общий итог */}
          {isAdmin && data.grand_total && (
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
              <h2 className="text-lg font-semibold mb-4"><Icon name="building" className="w-[1em] h-[1em] inline-block align-[-0.15em]" /> ВСЕГО ФЭС</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{data.grand_total.total}</div>
                  <div className="text-blue-100">Всего ПУ</div>
                </div>
                <div className="bg-white/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{data.grand_total.installed}</div>
                  <div className="text-blue-100">Установлено</div>
                </div>
                <div className="bg-white/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{data.grand_total.actioned}</div>
                  <div className="text-blue-100">Актировано</div>
                </div>
                <div className="bg-white/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">{data.grand_total.sklad}</div>
                  <div className="text-blue-100">Остаток склад</div>
                </div>
              </div>
            </div>
          )}

          {/* Переключатель секций */}
          <div className="bg-white rounded-xl border p-4">
            <div className="flex gap-2">
              {Object.entries(sectionLabels).map(([key, label]) => (
                <button 
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === key 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Таблицы с разбивкой */}
          {renderBreakdownTable(data.res, data.res_total, 'РЭС (РСК)', 'bg-green-50')}
          {renderBreakdownTable(data.esk, data.esk_total, 'ЭСК', 'bg-orange-50')}
          {renderBreakdownTable(data.oks, data.oks_total, 'ОКС', 'bg-indigo-50')}

          {(!data.res || data.res.length === 0) && (!data.esk || data.esk.length === 0) && (!data.oks || data.oks.length === 0) && (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
              Нет данных для отображения
            </div>
          )}
        </div>
      )}
    </div>
  )
}
