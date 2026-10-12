import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import {
  fetchMarketEmotionSnapshotForDate,
  getCalendarSummary,
  getCalendarTrend,
  getMarketEmotionDashboard,
  getTradeDateOptions,
} from './dashboardService.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'market-emotion-dashboard-proxy',
    time: new Date().toISOString(),
  })
})

app.get('/api/market/emotion', async (req, res, next) => {
  try {
    const requestDate = typeof req.query.date === 'string' ? req.query.date.trim() : ''
    const snapshot = await getMarketEmotionDashboard(requestDate)
    res.json(snapshot)
  } catch (error) {
    next(error)
  }
})

app.get('/api/market/emotion/history', async (req, res, next) => {
  try {
    const requestDate = typeof req.query.date === 'string' ? req.query.date.trim() : ''
    const snapshot = await getMarketEmotionDashboard(requestDate)
    res.json(snapshot)
  } catch (error) {
    next(error)
  }
})

app.get('/api/market/trade-dates', async (_req, res, next) => {
  try {
    const tradeDateOptions = await getTradeDateOptions()
    res.json(tradeDateOptions)
  } catch (error) {
    next(error)
  }
})

app.get('/api/market/calendar/summary', async (req, res, next) => {
  try {
    const requestMonth = typeof req.query.month === 'string' ? req.query.month.trim() : ''
    const payload = await getCalendarSummary(requestMonth)
    res.json(payload)
  } catch (error) {
    next(error)
  }
})

app.get('/api/market/calendar/trend', async (req, res, next) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range.trim() : '3m'
    const payload = await getCalendarTrend(range)
    res.json(payload)
  } catch (error) {
    next(error)
  }
})

app.post('/api/market/emotion/fetch', async (req, res, next) => {
  try {
    const requestDate = typeof req.body?.date === 'string' ? req.body.date.trim() : ''
    const payload = await fetchMarketEmotionSnapshotForDate(requestDate)
    res.json(payload)
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500
  res.status(statusCode).json({
    message: error.message || '服务异常',
    code: error.code || 'SERVER_ERROR',
  })
})

const server = app.listen(config.port, () => {
  console.log(`Market emotion proxy is running at http://127.0.0.1:${config.port}`)
})

// In some local shells the lightweight proxy exits immediately unless the event loop stays referenced.
const keepAliveTimer = setInterval(() => {}, 60_000)

function shutdown() {
  clearInterval(keepAliveTimer)
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
