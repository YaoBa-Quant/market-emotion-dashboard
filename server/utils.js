const cacheStore = new Map()

export function safeDiv(a, b, fallback = 0) {
  if (b === 0 || b == null || Number.isNaN(b) || !Number.isFinite(b)) {
    return fallback
  }

  return a / b
}

export function mean(values) {
  const valid = (values || []).filter((item) => item != null && Number.isFinite(Number(item)))
  if (!valid.length) return 0
  return valid.reduce((sum, item) => sum + Number(item), 0) / valid.length
}

export function toTradeDate(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}${month}${day}`
}

export function isTradeDateString(value) {
  return typeof value === 'string' && /^\d{8}$/.test(value)
}

export function tradeDateToDate(tradeDate) {
  if (!isTradeDateString(tradeDate)) return null
  return new Date(`${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}T00:00:00`)
}

export function formatDateTimeKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}${month}${day}${hours}${minutes}`
}

export function formatDateTimeLabel(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function tradeDateToLabel(tradeDate) {
  if (!tradeDate || tradeDate.length !== 8) return tradeDate
  return `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`
}

export function isAfterMarketClose(date = new Date()) {
  const day = date.getDay()
  if (day === 0 || day === 6) return false

  const minutes = date.getHours() * 60 + date.getMinutes()
  return minutes >= 15 * 60
}

export function shiftCalendarDays(tradeDate, days) {
  const normalized = `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}T00:00:00`
  const date = new Date(normalized)
  date.setDate(date.getDate() + days)
  return toTradeDate(date)
}

export function roundNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Number(Number(value).toFixed(digits))
}

// Tushare 指数成交额单位为千元，换算成「亿元」需除以 1e5。
export function formatAmountYi(amountInThousandYuan, digits = 2) {
  const yi = safeDiv(Number(amountInThousandYuan), 1e5, 0)
  return `${roundNumber(yi, digits)} 亿`
}

export function inferFactorStatus(score) {
  if (score >= 75) return 'good'
  if (score >= 55) return 'neutral'
  if (score >= 35) return 'warning'
  return 'danger'
}

export function getMarketRegime(emotionScore) {
  if (emotionScore >= 65) return 'strong'
  if (emotionScore <= 40) return 'weak'
  return 'neutral'
}

export function getMarketRegimeLabel(regime) {
  if (regime === 'strong') return 'Risk-On (进攻)'
  if (regime === 'weak') return 'Risk-Off (防守)'
  return 'Neutral (中性)'
}

export function buildCacheKey(prefix, payload) {
  return `${prefix}:${JSON.stringify(payload)}`
}

export async function withCache(key, ttlMs, loader) {
  const now = Date.now()
  const hit = cacheStore.get(key)

  if (hit && hit.expiresAt > now) {
    return hit.value
  }

  const value = await loader()
  cacheStore.set(key, {
    value,
    expiresAt: now + ttlMs,
  })
  return value
}
