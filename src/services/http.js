import axios from 'axios'

const defaultApiBaseUrl = 'http://127.0.0.1:4174/api'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl,
  timeout: 10000,
})

export default http
