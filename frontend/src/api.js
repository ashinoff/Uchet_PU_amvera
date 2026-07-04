import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('token')
    if (window.self === window.top) window.location.href = '/'
    // во фрейме просто отдаём ошибку — AuthProvider покажет логин/дождётся токена
  }
  return Promise.reject(err)
})

export default api
