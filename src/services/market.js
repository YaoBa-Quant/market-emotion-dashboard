import http from './http'

function isNotFoundError(error) {
  return error?.response?.status === 404
}

export async function fetchHistoryDashboard(date) {
  try {
    const response = await http.get('/market/emotion/history', {
      params: date ? { date } : {},
    })

    return response.data
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }

    const fallbackResponse = await http.get('/market/emotion', {
      params: date ? { date } : {},
    })

    return fallbackResponse.data
  }
}

export async function fetchTradeDates() {
  try {
    const response = await http.get('/market/trade-dates')

    return response.data
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }

    const fallbackResponse = await http.get('/market/emotion')
    const tradeDate = fallbackResponse.data?.dataMeta?.tradeDateRaw || ''

    return {
      tradeDates: tradeDate ? [tradeDate] : [],
      defaultDate: tradeDate,
      todayDate: tradeDate,
      todayIsTradeDate: false,
      isTradingSession: false,
      source: 'legacy_snapshot',
      sourceLabel: '兼容旧接口',
    }
  }
}

export async function fetchCalendarSummary(month) {
  const response = await http.get('/market/calendar/summary', {
    params: month ? { month } : {},
  })
  return response.data
}

export async function fetchCalendarTrend(range = '3m') {
  const response = await http.get('/market/calendar/trend', {
    params: { range },
  })
  return response.data
}

export async function fetchMarketEmotionForDate(date) {
  const response = await http.post('/market/emotion/fetch', { date })
  return response.data
}
