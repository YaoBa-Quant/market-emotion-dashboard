import axios from 'axios'
import https from 'node:https'
import { config, ensureToken } from './config.js'
import { buildCacheKey, withCache } from './utils.js'

// api.tushare.pro 在批量并发调用时存在 TLS 握手被重置的情况（ECONNRESET）。
// 单次失败即会击穿整条板块链路，因此这里做「连接复用 + 有限次指数退避重试」。
const MAX_NETWORK_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 300

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_SOCKET',
])

const tushareHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 8,
  maxFreeSockets: 4,
  scheduling: 'lifo',
  timeout: config.requestTimeoutMs,
})

function isTransientNetworkError(error) {
  if (!error || error.response) return false

  const code = error.code || error.cause?.code
  if (code && TRANSIENT_NETWORK_CODES.has(code)) return true

  return /socket hang up|disconnected before secure TLS|ECONNRESET|ETIMEDOUT/i.test(
    String(error.message || ''),
  )
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function postTushareWithRetry(apiName, body) {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
    try {
      return await axios.post(config.tushareApiUrl, body, {
        timeout: config.requestTimeoutMs,
        httpsAgent: tushareHttpsAgent,
      })
    } catch (error) {
      lastError = error

      if (!isTransientNetworkError(error) || attempt === MAX_NETWORK_ATTEMPTS) {
        throw error
      }

      const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 150)
      console.warn(
        `[tushare] ${apiName} 网络抖动(${error.code || 'UNKNOWN'})，${backoffMs}ms 后进行第 ${attempt + 1} 次尝试`,
      )
      await delay(backoffMs)
    }
  }

  throw lastError
}

class TushareApiError extends Error {
  constructor(apiName, message, { type = 'api_error', responseCode = null } = {}) {
    super(message)
    this.name = 'TushareApiError'
    this.apiName = apiName
    this.type = type
    this.responseCode = responseCode
    this.statusCode = 502
  }
}

function normalizeType(message = '') {
  if (/权限|积分|开通|无权|单独权限|not enough/i.test(message)) {
    return 'permission_denied'
  }

  if (/频率|频次|超限|限频|too many|rate limit/i.test(message)) {
    return 'rate_limited'
  }

  if (/token|认证|auth|invalid/i.test(message)) {
    return 'auth_error'
  }

  return 'api_error'
}

function mapRows(fields = [], items = []) {
  return items.map((item) => {
    const row = {}
    fields.forEach((field, index) => {
      row[field] = item[index]
    })
    return row
  })
}

export function isPermissionError(error) {
  return error instanceof TushareApiError && error.type === 'permission_denied'
}

export function isFallbackFriendlyError(error) {
  return error instanceof TushareApiError && ['permission_denied', 'rate_limited'].includes(error.type)
}

export async function requestTushare(apiName, params = {}, fields = '', { ttlMs = 30_000 } = {}) {
  ensureToken()

  const key = buildCacheKey(apiName, { params, fields })

  return withCache(key, ttlMs, async () => {
    const response = await postTushareWithRetry(apiName, {
      api_name: apiName,
      token: config.tushareToken,
      params,
      fields,
    })

    const payload = response.data || {}
    if (payload.code !== 0) {
      throw new TushareApiError(apiName, payload.msg || `${apiName} 请求失败`, {
        type: normalizeType(payload.msg),
        responseCode: payload.code,
      })
    }

    const data = payload.data || {}
    return mapRows(data.fields, data.items)
  })
}

export { TushareApiError }
