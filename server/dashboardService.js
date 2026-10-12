import { config } from './config.js'
import {
  assertCompletedTradeDate,
  getLatestAvailableTradeDate,
  getMarketEmotionSnapshot,
  listCompletedTradeDates,
} from './marketEmotion.js'
import {
  deleteStoredSnapshot,
  getStoredSnapshot,
  listStoredSnapshotsBetween,
  listStoredTradeDates,
  saveSnapshot,
} from './snapshotStore.js'
import { isTradeDateString, toTradeDate, tradeDateToLabel } from './utils.js'

const RANGE_MONTHS_MAP = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
}

function createBadRequest(message, code) {
  const error = new Error(message)
  error.statusCode = 400
  error.code = code
  return error
}

function isMonthString(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

function buildTradeDate(year, month, day) {
  return `${year}${month}${day}`
}

function getMonthBounds(monthKey) {
  const year = monthKey.slice(0, 4)
  const month = monthKey.slice(4, 6)
  const monthIndex = Number(month) - 1
  const lastDay = new Date(Number(year), monthIndex + 1, 0).getDate()

  return {
    month: monthKey,
    monthLabel: `${Number(year)}年${Number(month)}月`,
    startDate: buildTradeDate(year, month, '01'),
    endDate: buildTradeDate(year, month, `${lastDay}`.padStart(2, '0')),
    dayCount: lastDay,
  }
}

function shiftMonthKey(monthKey, offset) {
  const year = Number(monthKey.slice(0, 4))
  const monthIndex = Number(monthKey.slice(4, 6)) - 1
  const date = new Date(year, monthIndex + offset, 1)
  return `${date.getFullYear()}${`${date.getMonth() + 1}`.padStart(2, '0')}`
}

function subtractMonthsFromTradeDate(tradeDate, months) {
  const year = Number(tradeDate.slice(0, 4))
  const monthIndex = Number(tradeDate.slice(4, 6)) - 1
  const day = Number(tradeDate.slice(6, 8))
  const date = new Date(year, monthIndex, day)
  date.setMonth(date.getMonth() - months)
  return toTradeDate(date)
}

function extractSnapshotSummary(tradeDate, snapshot, updatedAt = null) {
  const marketSummary = snapshot?.marketSummary || {}
  return {
    tradeDate,
    cached: true,
    emotionScore: marketSummary.emotionScore ?? null,
    suggestedPosition: marketSummary.suggestedPosition ?? null,
    allowOpen: Boolean(marketSummary.allowOpen),
    regimeLabel: marketSummary.regimeLabel || '',
    positionTier: marketSummary.positionTier || '',
    hs300Close: marketSummary.hs300Close ?? null,
    cacheUpdatedAt: updatedAt,
  }
}

function buildCalendarDay(date, isTradeDate, summary, todayDate) {
  if (summary) {
    return {
      date,
      isTradeDate: true,
      isFuture: date > todayDate,
      status: 'ready',
      ...summary,
    }
  }

  if (isTradeDate) {
    return {
      date,
      isTradeDate: true,
      isFuture: date > todayDate,
      status: 'missing',
      cached: false,
      emotionScore: null,
      suggestedPosition: null,
      allowOpen: null,
      regimeLabel: '',
      positionTier: '',
      hs300Close: null,
      cacheUpdatedAt: null,
    }
  }

  return {
    date,
    isTradeDate: false,
    isFuture: date > todayDate,
    status: 'non_trading',
    cached: false,
    emotionScore: null,
    suggestedPosition: null,
    allowOpen: null,
    regimeLabel: '',
    positionTier: '',
    hs300Close: null,
    cacheUpdatedAt: null,
  }
}

function annotateSnapshot(snapshot, { cacheStatus, requestedTradeDate, storedAt = null }) {
  return {
    ...snapshot,
    dataMeta: {
      ...snapshot.dataMeta,
      cacheStatus,
      cacheLabel: cacheStatus === 'hit' ? '来自缓存' : '实时抓取',
      requestedTradeDate,
      requestedTradeDateLabel: tradeDateToLabel(requestedTradeDate),
      algoVersion: config.algoVersion,
      cachedAt: storedAt,
    },
  }
}

function validateRequestedTradeDate(requestedTradeDate) {
  if (!isTradeDateString(requestedTradeDate)) {
    throw createBadRequest('日期参数必须是 YYYYMMDD 格式。', 'INVALID_TRADE_DATE')
  }

  if (requestedTradeDate > toTradeDate()) {
    throw createBadRequest('不能选择未来日期。', 'FUTURE_TRADE_DATE')
  }
}

function validateRequestedMonth(requestedMonth) {
  if (!isMonthString(requestedMonth)) {
    throw createBadRequest('月份参数必须是 YYYYMM 格式。', 'INVALID_MONTH')
  }
}

function validateTrendRange(range) {
  if (!RANGE_MONTHS_MAP[range]) {
    throw createBadRequest('趋势区间参数必须是 1m、3m、6m 或 1y。', 'INVALID_RANGE')
  }
}

function isSnapshotAlignedWithTradeDate(snapshotRecord, tradeDate) {
  const effectiveDate = snapshotRecord?.snapshot?.marketSummary?.effectiveDate
  const chartLatestDate = snapshotRecord?.snapshot?.marketChart?.dates?.at(-1)
  return effectiveDate === tradeDateToLabel(tradeDate) && chartLatestDate === tradeDate.slice(4)
}

function getLatestAlignedStoredTradeDate() {
  const storedTradeDates = listStoredTradeDates().slice().sort((a, b) => b.localeCompare(a))

  for (const tradeDate of storedTradeDates) {
    const snapshot = getStoredSnapshot(tradeDate)
    if (snapshot && isSnapshotAlignedWithTradeDate(snapshot, tradeDate)) {
      return tradeDate
    }
  }

  return null
}

function getAlignedSnapshotsBetween(startDate, endDate) {
  const snapshots = listStoredSnapshotsBetween(startDate, endDate)
  const alignedSnapshots = []

  snapshots.forEach((item) => {
    if (isSnapshotAlignedWithTradeDate(item, item.tradeDate)) {
      alignedSnapshots.push(item)
      return
    }

    deleteStoredSnapshot(item.tradeDate)
  })

  return alignedSnapshots
}

async function resolveDefaultTradeDate() {
  try {
    return await getLatestAvailableTradeDate()
  } catch (error) {
    const latestStoredTradeDate = getLatestAlignedStoredTradeDate()
    if (latestStoredTradeDate) {
      return latestStoredTradeDate
    }
    throw error
  }
}

export async function getMarketEmotionDashboard(requestedTradeDate) {
  if (requestedTradeDate) {
    validateRequestedTradeDate(requestedTradeDate)

    const cachedSnapshot = getStoredSnapshot(requestedTradeDate)
    if (cachedSnapshot && isSnapshotAlignedWithTradeDate(cachedSnapshot, requestedTradeDate)) {
      return annotateSnapshot(cachedSnapshot.snapshot, {
        cacheStatus: 'hit',
        requestedTradeDate,
        storedAt: cachedSnapshot.updatedAt,
      })
    }
    if (cachedSnapshot) {
      deleteStoredSnapshot(requestedTradeDate)
    }

    await assertCompletedTradeDate(requestedTradeDate)
    const snapshot = await getMarketEmotionSnapshot(requestedTradeDate)
    saveSnapshot(requestedTradeDate, snapshot)

    return annotateSnapshot(snapshot, {
      cacheStatus: 'miss',
      requestedTradeDate,
    })
  }

  const defaultTradeDate = await resolveDefaultTradeDate()
  const cachedSnapshot = getStoredSnapshot(defaultTradeDate)

  if (cachedSnapshot && isSnapshotAlignedWithTradeDate(cachedSnapshot, defaultTradeDate)) {
    return annotateSnapshot(cachedSnapshot.snapshot, {
      cacheStatus: 'hit',
      requestedTradeDate: defaultTradeDate,
      storedAt: cachedSnapshot.updatedAt,
    })
  }
  if (cachedSnapshot) {
    deleteStoredSnapshot(defaultTradeDate)
  }

  const snapshot = await getMarketEmotionSnapshot(defaultTradeDate)
  saveSnapshot(defaultTradeDate, snapshot)

  return annotateSnapshot(snapshot, {
    cacheStatus: 'miss',
    requestedTradeDate: defaultTradeDate,
  })
}

export async function fetchMarketEmotionSnapshotForDate(requestedTradeDate) {
  validateRequestedTradeDate(requestedTradeDate)

  const existingSnapshot = getStoredSnapshot(requestedTradeDate)
  if (existingSnapshot && isSnapshotAlignedWithTradeDate(existingSnapshot, requestedTradeDate)) {
    return {
      ok: true,
      date: requestedTradeDate,
      cacheStatus: 'existing',
      summary: extractSnapshotSummary(requestedTradeDate, existingSnapshot.snapshot, existingSnapshot.updatedAt),
    }
  }
  if (existingSnapshot) {
    deleteStoredSnapshot(requestedTradeDate)
  }

  await assertCompletedTradeDate(requestedTradeDate)
  const snapshot = await getMarketEmotionSnapshot(requestedTradeDate)
  saveSnapshot(requestedTradeDate, snapshot)
  const storedSnapshot = getStoredSnapshot(requestedTradeDate)

  return {
    ok: true,
    date: requestedTradeDate,
    cacheStatus: 'created',
    summary: extractSnapshotSummary(requestedTradeDate, snapshot, storedSnapshot?.updatedAt || null),
  }
}

export async function getCalendarSummary(requestedMonth = '') {
  const defaultTradeDate = await resolveDefaultTradeDate()
  const month = requestedMonth || defaultTradeDate.slice(0, 6)
  validateRequestedMonth(month)

  const { startDate, endDate, dayCount, monthLabel } = getMonthBounds(month)
  const todayDate = toTradeDate()
  const storedSnapshots = getAlignedSnapshotsBetween(startDate, endDate)
  const summaryMap = new Map(
    storedSnapshots.map((item) => [
      item.tradeDate,
      extractSnapshotSummary(item.tradeDate, item.snapshot, item.updatedAt),
    ]),
  )

  let tradeDates = []
  try {
    tradeDates = await listCompletedTradeDates({
      startDate,
      endDate,
      includeIncompleteToday: true,
    })
  } catch (_error) {
    tradeDates = storedSnapshots.map((item) => item.tradeDate)
  }
  const tradeDateSet = new Set(tradeDates)

  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = `${index + 1}`.padStart(2, '0')
    const date = `${month}${day}`
    return buildCalendarDay(date, tradeDateSet.has(date), summaryMap.get(date) || null, todayDate)
  })

  return {
    month,
    monthLabel,
    latestTradeDate: defaultTradeDate,
    prevMonth: shiftMonthKey(month, -1),
    nextMonth: shiftMonthKey(month, 1),
    days,
  }
}

export async function getCalendarTrend(range = '3m') {
  validateTrendRange(range)

  const endDate = await resolveDefaultTradeDate()
  const startDate = subtractMonthsFromTradeDate(endDate, RANGE_MONTHS_MAP[range])
  const snapshots = getAlignedSnapshotsBetween(startDate, endDate)

  return {
    range,
    startDate,
    endDate,
    series: snapshots.map((item) => ({
      tradeDate: item.tradeDate,
      emotionScore: item.snapshot?.marketSummary?.emotionScore ?? null,
      suggestedPosition: item.snapshot?.marketSummary?.suggestedPosition ?? null,
      allowOpen: Boolean(item.snapshot?.marketSummary?.allowOpen),
      hs300Close: item.snapshot?.marketSummary?.hs300Close ?? null,
    })),
  }
}

export async function getTradeDateOptions() {
  const today = toTradeDate()

  try {
    const tradeDates = await listCompletedTradeDates({ startDate: '19900101' })
    const defaultDate = await resolveDefaultTradeDate()

    return {
      tradeDates,
      defaultDate,
      todayDate: today,
      todayIsTradeDate: false,
      isTradingSession: false,
      source: 'calendar',
      sourceLabel: '交易日历',
    }
  } catch (error) {
    const tradeDates = listStoredTradeDates().slice().sort((a, b) => a.localeCompare(b))
    const defaultDate = getLatestAlignedStoredTradeDate()

    if (!defaultDate) {
      throw error
    }

    return {
      tradeDates,
      defaultDate,
      todayDate: today,
      todayIsTradeDate: false,
      isTradingSession: false,
      source: 'snapshot_cache',
      sourceLabel: '本地缓存',
    }
  }
}
