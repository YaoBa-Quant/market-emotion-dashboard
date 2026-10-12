import { isFallbackFriendlyError, requestTushare } from './tushare.js'
import {
  formatAmountYi,
  getMarketRegime,
  getMarketRegimeLabel,
  inferFactorStatus,
  isAfterMarketClose,
  isTradeDateString,
  mean,
  roundNumber,
  safeDiv,
  shiftCalendarDays,
  toTradeDate,
  tradeDateToLabel,
} from './utils.js'

const DEFAULT_TRADE_CAL_START = '19900101'

export const FACTOR_WEIGHTS = {
  hs300_trend: 0.2,
  volume: 0.15,
  volume_trend: 0.05,
  market_breadth: 0.15,
  advance_decline: 0.15,
  limit_up_down: 0.15,
  max_height: 0.1,
  panic_factor: 0.05,
}

export const FACTOR_LABELS = {
  hs300_trend: '沪深300趋势',
  volume: '量能健康度',
  volume_trend: '量能趋势',
  market_breadth: '市场宽度',
  advance_decline: '涨跌比',
  limit_up_down: '涨跌停比',
  max_height: '连板高度',
  panic_factor: '恐慌因子',
}

const CHART_DISPLAY_DAYS = 40

function uniquePush(list, value) {
  if (value && !list.includes(value)) {
    list.push(value)
  }
}

function createContext() {
  return {
    permissionWarnings: [],
    approximationNotes: [],
    factorApproximation: new Map(),
    sourceSet: new Set(['Tushare']),
  }
}

function markApproximation(context, factorId, note) {
  uniquePush(context.approximationNotes, note)
  const current = context.factorApproximation.get(factorId) || []
  if (!current.includes(note)) {
    current.push(note)
  }
  context.factorApproximation.set(factorId, current)
}

function markPermission(context, message) {
  uniquePush(context.permissionWarnings, message)
}

export function buildMovingAverageSeries(rows, period, displayCount = CHART_DISPLAY_DAYS) {
  const closes = rows.map((row) => Number(row.close))
  const displayStart = Math.max(0, rows.length - displayCount)

  return rows.slice(displayStart).map((_, displayIndex) => {
    const fullIndex = displayStart + displayIndex
    if (fullIndex < period - 1) return null
    return roundNumber(mean(closes.slice(fullIndex - period + 1, fullIndex + 1)), 2)
  })
}

export function buildFactor(context, id, score, rawValue, description) {
  const weight = FACTOR_WEIGHTS[id]
  const approximationReasons = context.factorApproximation.get(id) || []
  return {
    id,
    name: FACTOR_LABELS[id],
    alias: id,
    rawValue,
    score: roundNumber(score, 2),
    weight,
    contribution: roundNumber(score * weight, 2),
    status: inferFactorStatus(score),
    description,
    approximate: approximationReasons.length > 0,
    approximationReason: approximationReasons.join('；'),
    method: approximationReasons.length ? '近似' : '精确',
  }
}

function buildApiErrorPrefix(apiName) {
  return `Tushare 接口 ${apiName}`
}

function buildFallbackReason(error, fallbackText) {
  if (error?.type === 'rate_limited') {
    return `${fallbackText}（实时接口频率超限）`
  }
  return `${fallbackText}（实时接口权限不足）`
}

function trimIncompleteToday(tradeDates, endDate = toTradeDate(), includeIncompleteToday = false) {
  if (includeIncompleteToday) {
    return tradeDates
  }

  const today = toTradeDate()
  if (endDate === today && !isAfterMarketClose(new Date()) && tradeDates.at(-1) === today) {
    return tradeDates.slice(0, -1)
  }

  return tradeDates
}

export async function listCompletedTradeDates({
  startDate = DEFAULT_TRADE_CAL_START,
  endDate = toTradeDate(),
  includeIncompleteToday = false,
} = {}) {
  const calendar = await requestTushare(
    'trade_cal',
    { exchange: '', start_date: startDate, end_date: endDate },
    'cal_date,is_open',
    { ttlMs: 24 * 60 * 60 * 1000 },
  )

  const tradeDates = calendar
    .filter((item) => Number(item.is_open) === 1)
    .map((item) => item.cal_date)
    .sort((a, b) => a.localeCompare(b))

  return trimIncompleteToday(tradeDates, endDate, includeIncompleteToday)
}

export async function getRecentTradeDates(count, endDate = toTradeDate()) {
  const startDate = shiftCalendarDays(endDate, -count * 6)
  const tradeDates = await listCompletedTradeDates({ startDate, endDate })
  return tradeDates.slice(-count)
}

export async function getLatestCompletedTradeDate(referenceDate = toTradeDate()) {
  const recentDates = await getRecentTradeDates(2, referenceDate)
  const latestTradeDate = recentDates.at(-1)

  if (!latestTradeDate) {
    const error = new Error('未能解析最近可用交易日。')
    error.statusCode = 502
    error.code = 'TRADE_DATE_UNAVAILABLE'
    throw error
  }

  return latestTradeDate
}

export async function getLatestAvailableTradeDate(referenceDate = toTradeDate()) {
  const recentDates = await getRecentTradeDates(6, referenceDate)

  for (const tradeDate of recentDates.slice().reverse()) {
    const [dailyRows, hs300Rows, csi1000Rows] = await Promise.all([
      getDailyRows(tradeDate),
      getIndexDailyRows('399300.SZ', tradeDate, 60),
      getIndexDailyRows('000852.SH', tradeDate, 20),
    ])
    const hs300TradeDate = hs300Rows.at(-1)?.trade_date || ''
    const csi1000TradeDate = csi1000Rows.at(-1)?.trade_date || ''

    if (dailyRows.length && hs300TradeDate === tradeDate && csi1000TradeDate === tradeDate) {
      return tradeDate
    }
  }

  const error = new Error('最近交易日的收盘数据暂未同步到 Tushare，请稍后重试。')
  error.statusCode = 409
  error.code = 'TRADE_DATE_NOT_READY'
  throw error
}

export async function assertCompletedTradeDate(tradeDate) {
  if (!isTradeDateString(tradeDate)) {
    const error = new Error('日期参数必须是 YYYYMMDD 格式。')
    error.statusCode = 400
    error.code = 'INVALID_TRADE_DATE'
    throw error
  }

  const tradeDates = await listCompletedTradeDates({ startDate: tradeDate, endDate: tradeDate })
  if (!tradeDates.includes(tradeDate)) {
    const error = new Error('所选日期不是可用交易日，请重新选择。')
    error.statusCode = 400
    error.code = 'NON_TRADING_DATE'
    throw error
  }
}

async function getStockBasics() {
  const rows = await requestTushare(
    'stock_basic',
    { exchange: '', list_status: 'L' },
    'ts_code,name',
    { ttlMs: 6 * 60 * 60 * 1000 },
  )

  return new Map(rows.map((item) => [item.ts_code, item]))
}

async function getDailyRows(tradeDate) {
  return requestTushare(
    'daily',
    { trade_date: tradeDate },
    'ts_code,trade_date,open,high,low,close,pre_close,vol,amount,pct_chg',
    { ttlMs: 60 * 1000 },
  )
}

async function getFundDailyRows(tradeDate, tsCodes) {
  const rows = await Promise.all(
    tsCodes.map((tsCode) =>
      requestTushare(
        'fund_daily',
        { ts_code: tsCode, trade_date: tradeDate },
        'ts_code,trade_date,open,high,low,close,pre_close,pct_chg,amount',
        { ttlMs: 5 * 60 * 1000 },
      ),
    ),
  )

  return rows.flat()
}

async function getIndexDailyRows(tsCode, endDate, count = 60) {
  const startDate = shiftCalendarDays(endDate, -count * 4)
  const rows = await requestTushare(
    'index_daily',
    { ts_code: tsCode, start_date: startDate, end_date: endDate },
    'ts_code,trade_date,close,pre_close,vol,amount',
    { ttlMs: 5 * 60 * 1000 },
  )

  return rows
    .slice()
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .slice(-count)
}

async function getLimitRows(tradeDate) {
  return requestTushare(
    'stk_limit',
    { trade_date: tradeDate },
    'ts_code,trade_date,up_limit,down_limit',
    { ttlMs: 60 * 60 * 1000 },
  )
}

function getLimitPct(tsCode) {
  if (tsCode.startsWith('300')) return 0.2
  return 0.1
}

function isApproxLimitUp(row) {
  const limitPct = getLimitPct(row.ts_code)
  const preClose = Number(row.pre_close)
  const close = Number(row.close)
  const high = Number(row.high)
  if (!preClose) return false
  return close >= preClose * (1 + limitPct - 0.005) && close >= high * 0.995
}

function isApproxZhaBan(row) {
  const limitPct = getLimitPct(row.ts_code)
  const preClose = Number(row.pre_close)
  const close = Number(row.close)
  const high = Number(row.high)
  if (!preClose) return false
  return high >= preClose * (1 + limitPct - 0.01) && close < preClose * (1 + limitPct - 0.02)
}

function isLimitUp(row, limitMap) {
  const exact = limitMap?.get(row.ts_code)
  if (exact?.up_limit) {
    const upLimit = Number(exact.up_limit)
    return Number(row.close) >= upLimit * 0.995 && Number(row.high) >= upLimit * 0.995
  }
  return isApproxLimitUp(row)
}

function isLimitDown(row, limitMap) {
  const exact = limitMap?.get(row.ts_code)
  if (exact?.down_limit) {
    return Number(row.close) <= Number(exact.down_limit) * 1.005
  }
  return Number(row.pre_close) > 0 && (Number(row.close) - Number(row.pre_close)) / Number(row.pre_close) < -0.095
}

function isZhaBan(row, limitMap) {
  const exact = limitMap?.get(row.ts_code)
  if (exact?.up_limit) {
    const upLimit = Number(exact.up_limit)
    return Number(row.high) >= upLimit * 0.995 && Number(row.close) < upLimit * 0.98
  }
  return isApproxZhaBan(row)
}

function filterSampleRows(rows, stockBasics) {
  return rows
    .map((row) => ({
      ...row,
      name: row.name || stockBasics.get(row.ts_code)?.name || row.ts_code,
    }))
    .filter((row) => {
      const code = row.ts_code || ''
      const name = row.name || ''
      return !code.startsWith('8') && !code.startsWith('9') && !code.startsWith('200') && !name.includes('ST')
    })
}

function calculateMarketStats(rows, limitMap) {
  let upCount = 0
  let downCount = 0
  let flatCount = 0
  let limitUpCount = 0
  let limitDownCount = 0
  let zhaBanCount = 0

  rows.forEach((row) => {
    const preClose = Number(row.pre_close)
    const close = Number(row.close)
    if (!preClose || !Number.isFinite(close)) return

    const change = (close - preClose) / preClose

    if (isLimitUp(row, limitMap)) {
      limitUpCount += 1
      upCount += 1
      return
    }

    if (isZhaBan(row, limitMap)) {
      zhaBanCount += 1
      upCount += 1
      return
    }

    if (isLimitDown(row, limitMap)) {
      limitDownCount += 1
      downCount += 1
      return
    }

    if (change > 0.005) {
      upCount += 1
    } else if (change < -0.005) {
      downCount += 1
    } else {
      flatCount += 1
    }
  })

  return {
    upCount,
    downCount,
    flatCount,
    limitUpCount,
    limitDownCount,
    zhaBanCount,
  }
}

export function scoreBreadth(upCount, downCount, flatCount) {
  const totalActive = upCount + downCount + flatCount
  const upRatio = totalActive > 0 ? upCount / totalActive : 0.5

  let score = 0
  if (upRatio >= 0.5) score = 100
  else if (upRatio >= 0.45) score = 80 + ((upRatio - 0.45) / 0.05) * 20
  else if (upRatio >= 0.4) score = 60 + ((upRatio - 0.4) / 0.05) * 20
  else if (upRatio >= 0.35) score = 40 + ((upRatio - 0.35) / 0.05) * 15
  else if (upRatio >= 0.3) score = 20 + ((upRatio - 0.3) / 0.05) * 20
  else score = Math.max(0, (upRatio / 0.3) * 20)

  return { upRatio, score }
}

export function scoreAdvanceDecline(upCount, downCount) {
  const ratio = downCount > 0 ? safeDiv(upCount, downCount, 999) : 999
  let score = 0

  if (ratio >= 999) score = 100
  else if (ratio >= 5) score = 100
  else if (ratio >= 3) score = 85
  else if (ratio >= 2) score = 70
  else if (ratio >= 1.5) score = 60 + ((ratio - 1.5) / 0.5) * 10
  else if (ratio >= 1) score = 55 + (ratio - 1) * 10
  else score = Math.max(0, ratio * 50)

  return { ratio, score }
}

export function scoreLimitUpDown(limitUpCount, limitDownCount) {
  const ratio = limitDownCount > 0 ? safeDiv(limitUpCount, limitDownCount, 999) : 999
  let score = 0

  if (ratio >= 999) score = 100
  else if (ratio >= 5) score = 100
  else if (ratio >= 4.5) score = 95 + ((ratio - 4.5) / 0.5) * 5
  else if (ratio >= 3) score = 80 + ((ratio - 3) / 1.5) * 15
  else if (ratio >= 2) score = 65 + (ratio - 2) * 15
  else if (ratio >= 1) score = 50 + (ratio - 1) * 15
  else score = Math.max(0, ratio * 50)

  return { ratio, score }
}

export function scoreHeight(maxHeight) {
  if (maxHeight >= 5) return 100
  if (maxHeight >= 4) return 80 + (maxHeight - 4) * 20
  if (maxHeight >= 3) return 65 + (maxHeight - 3) * 15
  if (maxHeight >= 2) return 50 + (maxHeight - 2) * 15
  if (maxHeight >= 1) return 30 + (maxHeight - 1) * 20
  return 0
}

export function scorePanic(panicValue) {
  if (panicValue <= 10) return 100
  if (panicValue <= 30) return 80 + ((30 - panicValue) / 20) * 20
  if (panicValue <= 50) return 60 + ((50 - panicValue) / 20) * 20
  if (panicValue <= 70) return 40 + ((70 - panicValue) / 20) * 20
  if (panicValue <= 100) return 20 + ((100 - panicValue) / 30) * 20
  return Math.max(0, 20 - ((panicValue - 100) / 20) * 20)
}

export function scoreHs300(indexRows) {
  const closeSeries = indexRows.map((row) => Number(row.close))
  const current = closeSeries.at(-1)
  const ma5 = mean(closeSeries.slice(-5))
  const ma20 = mean(closeSeries.slice(-20))
  const prevClose = closeSeries.at(-2) || current
  const hs300ChangePct = prevClose > 0 ? (current - prevClose) / prevClose : 0
  const hs300Drop = Math.max(0, -hs300ChangePct)

  let trendScore = 50
  if (current >= ma5 && ma5 >= ma20) {
    trendScore = 100
  } else if (current >= ma5) {
    trendScore = 70
  } else {
    trendScore = Math.max(0, 70 - ((ma5 - current) / ma5) * 1500)
  }

  if (hs300Drop > 0.03) {
    trendScore = Math.max(0, trendScore - (hs300Drop - 0.015) * 5000)
  }

  return {
    score: trendScore,
    current,
    ma5,
    ma20,
    hs300ChangePct,
    hs300Drop,
  }
}

export function scoreVolume(indexRows, realtimeAmount) {
  const amountSeries = indexRows.map((row) => Number(row.amount || 0))
  const avg60 = mean(amountSeries.slice(-60))
  const avg20 = mean(amountSeries.slice(-20))
  const todayAmount = realtimeAmount ?? amountSeries.at(-1) ?? 0
  const volumeRatio = avg60 > 0 ? todayAmount / avg60 : 1
  const volumeTrend = avg60 > 0 ? avg20 / avg60 : 1

  const volumeScore = Math.max(0, Math.min(100, ((volumeRatio - 0.5) / 1.1) * 100))
  const volumeTrendScore = Math.max(0, Math.min(100, ((volumeTrend - 0.6) / 0.8) * 100))

  return {
    volumeScore,
    volumeTrendScore,
    volumeRatio,
    volumeTrend,
  }
}

async function buildHeightStats(tradeDates, stockBasics, limitMapsByDate, context) {
  const dailyByDate = new Map()

  for (const tradeDate of tradeDates) {
    const rows = await getDailyRows(tradeDate)
    dailyByDate.set(tradeDate, filterSampleRows(rows, stockBasics))
  }

  const perStock = new Map()

  tradeDates.forEach((tradeDate) => {
    const rows = dailyByDate.get(tradeDate) || []
    const limitMap = limitMapsByDate.get(tradeDate)
    rows.forEach((row) => {
      const history = perStock.get(row.ts_code) || []
      history.push({
        ...row,
        isLimitUp: isLimitUp(row, limitMap),
      })
      perStock.set(row.ts_code, history)
    })
  })

  let maxHeight = 0
  perStock.forEach((history) => {
    let consecutive = 0
    history.forEach((row) => {
      if (row.isLimitUp) {
        consecutive += 1
        if (consecutive > maxHeight) {
          maxHeight = consecutive
        }
      } else {
        consecutive = 0
      }
    })
  })

  return maxHeight
}

async function resolveEodSnapshot(targetTradeDate, stockBasics, context, { allowPreviousTradeDateFallback = false } = {}) {
  const recentDates = await getRecentTradeDates(6, targetTradeDate)
  const latestTradeDate = recentDates.at(-1)
  const previousTradeDate = recentDates.at(-2)

  let effectiveDate = latestTradeDate
  let rows = await getDailyRows(effectiveDate)
  if (!rows.length && allowPreviousTradeDateFallback && previousTradeDate) {
    effectiveDate = previousTradeDate
    rows = await getDailyRows(effectiveDate)
  }

  if (!rows.length) {
    const error = new Error(`${tradeDateToLabel(targetTradeDate)} 收盘数据暂未同步到 Tushare，请稍后重试。`)
    error.statusCode = 409
    error.code = 'TRADE_DATE_NOT_READY'
    throw error
  }

  context.sourceSet.add('daily')
  return {
    effectiveDate,
    recentDates,
    marketRows: filterSampleRows(rows, stockBasics),
  }
}

async function resolveIndexBundle(effectiveDate, context) {
  const hs300Code = '399300.SZ'
  const csi1000Code = '000852.SH'

  const hs300DailyRows = await getIndexDailyRows(hs300Code, effectiveDate, 60)
  context.sourceSet.add('index_daily')

  const csi1000DailyRows = await getIndexDailyRows(csi1000Code, effectiveDate, 20)
  context.sourceSet.add('index_daily')

  const hs300TradeDate = hs300DailyRows.at(-1)?.trade_date || ''
  const csi1000TradeDate = csi1000DailyRows.at(-1)?.trade_date || ''
  if (hs300TradeDate !== effectiveDate || csi1000TradeDate !== effectiveDate) {
    const error = new Error(`${tradeDateToLabel(effectiveDate)} 的指数数据尚未同步完成，请稍后重试。`)
    error.statusCode = 409
    error.code = 'INDEX_DATA_NOT_READY'
    throw error
  }

  const realtimeAmount = Number(hs300DailyRows.at(-1)?.amount || 0)
  const tradeTime = `${tradeDateToLabel(effectiveDate)} 15:00:00`

  return {
    hs300DailyRows,
    csi1000DailyRows,
    realtimeAmount,
    tradeTime,
  }
}

async function resolveLimitMaps(recentDates, effectiveDate, context) {
  const limitMapsByDate = new Map()

  for (const tradeDate of recentDates.slice(-5)) {
    try {
      const rows = await getLimitRows(tradeDate)
      limitMapsByDate.set(tradeDate, new Map(rows.map((item) => [item.ts_code, item])))
      context.sourceSet.add('stk_limit')
    } catch (error) {
      if (!isFallbackFriendlyError(error)) throw error

      markPermission(context, buildFallbackReason(error, `${buildApiErrorPrefix('stk_limit')} 不可用，涨跌停、炸板和连板高度按涨跌幅规则近似`))
      markApproximation(context, 'limit_up_down', '缺少 stk_limit 权限，涨跌停比按涨跌幅阈值近似。')
      markApproximation(context, 'max_height', '缺少 stk_limit 权限，连板高度按涨跌幅阈值近似。')
      markApproximation(context, 'panic_factor', '缺少 stk_limit 权限，炸板和跌停按涨跌幅阈值近似。')
      break
    }
  }

  return {
    currentLimitMap: limitMapsByDate.get(effectiveDate) || null,
    limitMapsByDate,
  }
}

export function buildRiskSummary(marketSummary, dataMeta) {
  const title = marketSummary.allowOpen ? '当前未触发硬性风控，可开仓' : '当前触发硬性风控，暂不建议开仓'
  const description = marketSummary.allowOpen
    ? `情绪分 ${marketSummary.emotionScore.toFixed(1)}，量能比 ${marketSummary.volumeRatio.toFixed(2)}，当前 3 条硬门控均已通过。`
    : `情绪分 ${marketSummary.emotionScore.toFixed(1)}，当前存在 ${marketSummary.banReasons.length} 条硬门控阻断项。`

  const notes = []
  if (dataMeta.permissionWarnings.length) {
    notes.push(`接口受限：${dataMeta.permissionWarnings.join('；')}`)
  }
  if (dataMeta.approximationNotes.length) {
    notes.push(`近似项：${dataMeta.approximationNotes.join('；')}`)
  }

  return {
    title,
    description,
    notes,
  }
}

export function buildObservationItems(factors) {
  const observationIds = ['hs300_trend', 'market_breadth', 'advance_decline', 'limit_up_down', 'max_height', 'panic_factor']
  return factors
    .filter((factor) => observationIds.includes(factor.id))
    .map((factor) => ({
      key: factor.id,
      label: factor.name,
      rawValue: factor.rawValue,
      score: factor.score,
      status: factor.status,
      description: factor.description,
      approximate: factor.approximate,
      approximationReason: factor.approximationReason,
    }))
}

// 情绪总分 -> 建议仓位。tone: up=进攻(红) / neutral=中性(灰) / down=防守(绿)。
export function buildPositionAdvice(emotionScore, allowOpen) {
  if (!allowOpen) {
    return { suggestedPosition: 0, positionTier: '空仓观望', positionTone: 'down' }
  }
  if (emotionScore >= 85) return { suggestedPosition: 90, positionTier: '满仓进攻', positionTone: 'up' }
  if (emotionScore >= 75) return { suggestedPosition: 75, positionTier: '重仓', positionTone: 'up' }
  if (emotionScore >= 65) return { suggestedPosition: 60, positionTier: '标准仓', positionTone: 'up' }
  if (emotionScore >= 60) return { suggestedPosition: 45, positionTier: '半仓', positionTone: 'neutral' }
  if (emotionScore >= 54) return { suggestedPosition: 30, positionTier: '轻仓试探', positionTone: 'neutral' }
  return { suggestedPosition: 0, positionTier: '防守空仓', positionTone: 'down' }
}

export async function getMarketEmotionSnapshot(tradeDate = toTradeDate(), options = {}) {
  const context = createContext()
  const stockBasics = await getStockBasics()

  const marketSnapshot = await resolveEodSnapshot(tradeDate, stockBasics, context, options)

  const indexBundle = await resolveIndexBundle(marketSnapshot.effectiveDate, context)
  const { currentLimitMap, limitMapsByDate } = await resolveLimitMaps(
    marketSnapshot.recentDates,
    marketSnapshot.effectiveDate,
    context,
  )
  const marketStats = calculateMarketStats(marketSnapshot.marketRows, currentLimitMap)

  const recentHeightDates = marketSnapshot.recentDates.slice(-5)
  const maxHeight = await buildHeightStats(recentHeightDates, stockBasics, limitMapsByDate, context)

  const hs300Trend = scoreHs300(indexBundle.hs300DailyRows)
  const volumeStats = scoreVolume(indexBundle.hs300DailyRows, indexBundle.realtimeAmount)
  const breadthStats = scoreBreadth(marketStats.upCount, marketStats.downCount, marketStats.flatCount)
  const adStats = scoreAdvanceDecline(marketStats.upCount, marketStats.downCount)
  const ldStats = scoreLimitUpDown(marketStats.limitUpCount, marketStats.limitDownCount)
  const panicValue = marketStats.zhaBanCount + marketStats.limitDownCount * 2
  const panicScore = scorePanic(panicValue)
  const hs300AmountSeries = indexBundle.hs300DailyRows.map((row) => Number(row.amount || 0))
  const hs300Avg20Amount = mean(hs300AmountSeries.slice(-20))
  const hs300Avg60Amount = mean(hs300AmountSeries.slice(-60))

  const factors = [
    buildFactor(
      context,
      'hs300_trend',
      hs300Trend.score,
      `${roundNumber(hs300Trend.current, 2)} / MA5 ${roundNumber(hs300Trend.ma5, 2)} / MA20 ${roundNumber(hs300Trend.ma20, 2)}`,
      '指数价、MA5、MA20 按策略原公式计算趋势得分。',
    ),
    buildFactor(
      context,
      'volume',
      volumeStats.volumeScore,
      `当日成交额 ${formatAmountYi(indexBundle.realtimeAmount)}\n60日均额 ${formatAmountYi(hs300Avg60Amount)}\n量能比 ${roundNumber(volumeStats.volumeRatio, 2)}`,
      '使用当前成交额与 60 日均额比值得到量能健康度。',
    ),
    buildFactor(
      context,
      'volume_trend',
      volumeStats.volumeTrendScore,
      `20日均额 ${formatAmountYi(hs300Avg20Amount)}\n60日均额 ${formatAmountYi(hs300Avg60Amount)}\n20/60趋势 ${roundNumber(volumeStats.volumeTrend, 2)}`,
      '使用近 20 日与近 60 日成交额均值比衡量量能趋势。',
    ),
    buildFactor(
      context,
      'market_breadth',
      breadthStats.score,
      `上涨 ${marketStats.upCount}\n下跌 ${marketStats.downCount}\n平盘 ${marketStats.flatCount}\n上涨占比 ${roundNumber(breadthStats.upRatio * 100, 1)}%`,
      '全市场上涨家数占比越高，市场宽度评分越高。',
    ),
    buildFactor(
      context,
      'advance_decline',
      adStats.score,
      `${marketStats.upCount} / ${marketStats.downCount} = ${roundNumber(adStats.ratio, 2)}`,
      '上涨家数与下跌家数的比值衡量赚钱效应扩散。',
    ),
    buildFactor(
      context,
      'limit_up_down',
      ldStats.score,
      `${marketStats.limitUpCount} / ${marketStats.limitDownCount} = ${roundNumber(ldStats.ratio, 2)}`,
      '涨跌停比反映连板生态和高位情绪强弱。',
    ),
    buildFactor(
      context,
      'max_height',
      scoreHeight(maxHeight),
      `最高连板 ${maxHeight}`,
      '连板高度使用近 5 个交易日连续涨停序列计算。',
    ),
    buildFactor(
      context,
      'panic_factor',
      panicScore,
      `炸板 ${marketStats.zhaBanCount} + 跌停 ${marketStats.limitDownCount} * 2 = ${panicValue}`,
      '恐慌因子越高，说明炸板和跌停越多，市场越弱。',
    ),
  ]

  const totalWeight = factors.reduce((sum, item) => sum + item.weight, 0)
  const emotionScore = factors.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
  const marketRegime = getMarketRegime(emotionScore)

  const banReasons = []
  if (emotionScore < 54) banReasons.push(`情绪得分 ${roundNumber(emotionScore, 1)} < 54`)
  if (volumeStats.volumeRatio < 0.55) banReasons.push(`量能比 ${roundNumber(volumeStats.volumeRatio, 2)} < 0.55`)
  if (hs300Trend.hs300Drop > 0.03) banReasons.push(`HS300 跌幅 ${roundNumber(hs300Trend.hs300Drop * 100, 2)}% > 3.00%`)

  const allowOpen = banReasons.length === 0
  const positionAdvice = buildPositionAdvice(roundNumber(emotionScore, 1), allowOpen)

  const csi1000Close = Number(indexBundle.csi1000DailyRows.at(-1)?.close || 0)
  const csi1000Ma20 = mean(indexBundle.csi1000DailyRows.map((item) => Number(item.close)).slice(-20))

  const marketSummary = {
    title: '大盘情绪看板',
    strategyName: 'Tushare 真实数据 / 大盘择时',
    effectiveDate: tradeDateToLabel(marketSnapshot.effectiveDate),
    updateTime: indexBundle.tradeTime?.split(' ').at(-1) || '15:00:00',
    emotionScore: roundNumber(emotionScore, 1),
    regime: marketRegime,
    regimeLabel: getMarketRegimeLabel(marketRegime),
    allowOpen,
    suggestedPosition: positionAdvice.suggestedPosition,
    positionTier: positionAdvice.positionTier,
    positionTone: positionAdvice.positionTone,
    positiveShare: roundNumber(
      factors.filter((item) => item.score >= 60).reduce((sum, item) => sum + item.weight, 0) * 100,
      1,
    ),
    triggerCount: banReasons.length,
    hs300Close: roundNumber(hs300Trend.current, 2),
    hs300Ma5: roundNumber(hs300Trend.ma5, 2),
    hs300Ma20: roundNumber(hs300Trend.ma20, 2),
    hs300ChangePct: roundNumber(hs300Trend.hs300ChangePct * 100, 2),
    hs300Drop: roundNumber(hs300Trend.hs300Drop * 100, 2),
    csi1000Close: roundNumber(csi1000Close, 2),
    csi1000Ma20: roundNumber(csi1000Ma20, 2),
    volumeRatio: roundNumber(volumeStats.volumeRatio, 2),
    volumeTrend: roundNumber(volumeStats.volumeTrend, 2),
    minEmotionScore: 54,
    minVolumeRatio: 0.55,
    banReasons,
    riskSummary: null,
    gateStatus: [
      {
        key: 'emotion',
        label: '情绪阈值',
        current: `${roundNumber(emotionScore, 1)}`,
        threshold: '>= 54',
        description: '综合加权得分决定是否通过第一道开仓门槛。',
        passed: emotionScore >= 54,
      },
      {
        key: 'volume',
        label: '量能阈值',
        current: `${roundNumber(volumeStats.volumeRatio, 2)}`,
        threshold: '>= 0.55',
        description: '量能比过低说明承接不足，即使指数企稳也不宜激进开仓。',
        passed: volumeStats.volumeRatio >= 0.55,
      },
      {
        key: 'hs300',
        label: 'HS300 涨跌幅',
        current: `${roundNumber(hs300Trend.hs300ChangePct * 100, 2)}%`,
        threshold: '>= -3.00%',
        description: '若指数当日跌超 3%，则直接触发硬性风险限制。',
        passed: hs300Trend.hs300ChangePct >= -0.03,
      },
    ],
  }

  const dataMeta = {
    mode: 'eod',
    modeLabel: '盘后准确版',
    source: Array.from(context.sourceSet).join(' + '),
    requestedTradeDate: tradeDate,
    tradeDate: tradeDateToLabel(marketSnapshot.effectiveDate),
    tradeDateRaw: marketSnapshot.effectiveDate,
    fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    isApproximate: context.approximationNotes.length > 0,
    approximationNotes: context.approximationNotes,
    permissionWarnings: context.permissionWarnings,
  }

  const chartRows = indexBundle.hs300DailyRows.slice(-CHART_DISPLAY_DAYS)
  marketSummary.riskSummary = buildRiskSummary(marketSummary, dataMeta)

  return {
    marketSummary,
    factorScores: factors,
    observationItems: buildObservationItems(factors),
    marketChart: {
      dates: chartRows.map((row) => row.trade_date.slice(4)),
      close: chartRows.map((row) => roundNumber(row.close, 2)),
      ma5: buildMovingAverageSeries(indexBundle.hs300DailyRows, 5),
      ma20: buildMovingAverageSeries(indexBundle.hs300DailyRows, 20),
    },
    dataMeta,
  }
}
