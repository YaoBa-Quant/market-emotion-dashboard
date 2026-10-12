<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import NProgress from 'nprogress'
import { orderBy } from 'lodash'
import MarketChart from './components/MarketChart.vue'
import CalendarOverviewPage from './components/CalendarOverviewPage.vue'
import {
  fetchCalendarSummary,
  fetchCalendarTrend,
  fetchHistoryDashboard,
  fetchMarketEmotionForDate,
  fetchTradeDates,
} from './services/market'

NProgress.configure({ showSpinner: false })

const PAGE_QUERY_KEY = 'page'
const DATE_QUERY_KEY = 'date'
const MONTH_QUERY_KEY = 'month'
const RANGE_QUERY_KEY = 'range'

const activePage = ref('detail')
const historyDashboard = ref(null)
const calendarSummary = ref(null)
const calendarTrend = ref(null)
const loading = ref(true)
const historyError = ref('')
const calendarError = ref('')
const historyDate = ref('')
const calendarMonth = ref('')
const calendarRange = ref('3m')
const tradeDates = ref([])
const tradeDateSourceLabel = ref('')

const factorTagTypeMap = {
  good: 'danger',
  neutral: 'info',
  warning: 'success',
  danger: 'success',
}

const factorToneMap = {
  good: 'is-good',
  neutral: 'is-neutral',
  warning: 'is-warning',
  danger: 'is-danger',
}

const factorStatusLabelMap = {
  good: '偏强',
  neutral: '中性',
  warning: '承压',
  danger: '拖累',
}

const isDetailPage = computed(() => activePage.value === 'detail')
const dashboard = computed(() => historyDashboard.value)
const activeError = computed(() => (isDetailPage.value ? historyError.value : calendarError.value))
const sortedFactors = computed(() => {
  if (!dashboard.value) return []
  return orderBy(dashboard.value.factorScores, ['contribution', 'score'], ['desc', 'desc'])
})

const dataMeta = computed(() => dashboard.value?.dataMeta || {
  modeLabel: '历史大盘情绪',
  fetchedAt: '-',
  cacheStatus: '',
  cacheLabel: '-',
  isApproximate: false,
  approximationNotes: [],
  permissionWarnings: [],
})

const hardGates = computed(() => dashboard.value?.marketSummary.gateStatus || [])
const tradeDateSet = computed(() => new Set(tradeDates.value))
const cacheMetaPillClass = computed(() => (dataMeta.value.cacheStatus === 'hit' ? 'success' : 'warning'))
const hs300TagType = computed(() => {
  if (!dashboard.value) return 'info'
  return dashboard.value.marketSummary.hs300ChangePct >= 0 ? 'danger' : 'success'
})
const emptyStateTitle = computed(() => (
  isDetailPage.value ? '历史数据尚未就绪' : '日历总览尚未就绪'
))
const emptyStateSubtitle = computed(() => (
  isDetailPage.value
    ? '历史模式当前没有取到可用数据，请检查本地代理和 Tushare 配置。'
    : '日历摘要或趋势数据当前没有取到可用结果，请检查本地代理和后端接口。'
))
const emptyStateSteps = computed(() => (
  isDetailPage.value
    ? [
        '在项目根目录复制 `.env.example` 为 `.env`',
        '把 `TUSHARE_TOKEN` 填进去',
        '重新运行 `npm run dev`',
        '确认 `/api/market/emotion/history` 能返回数据',
      ]
    : [
        '确认 `/api/market/calendar/summary` 能返回数据',
        '确认 `/api/market/calendar/trend` 能返回数据',
        '若交易日摘要缺失，可先回详情页抓取一个交易日',
        '重新加载页面重试',
      ]
))

const summaryCards = computed(() => {
  if (!dashboard.value) return []

  const { marketSummary } = dashboard.value
  return [
    {
      label: '情绪总分',
      value: marketSummary.emotionScore.toFixed(1),
      footnote: `阈值 ${marketSummary.minEmotionScore}`,
      tone: marketSummary.allowOpen ? 'up' : 'down',
    },
    {
      label: '量能比',
      value: marketSummary.volumeRatio.toFixed(2),
      footnote: `阈值 ${marketSummary.minVolumeRatio}`,
      tone: marketSummary.volumeRatio >= marketSummary.minVolumeRatio ? 'up' : 'down',
    },
    {
      label: 'HS300 涨跌幅',
      value: `${marketSummary.hs300ChangePct > 0 ? '+' : ''}${marketSummary.hs300ChangePct.toFixed(2)}%`,
      footnote: `收盘 ${marketSummary.hs300Close}`,
      tone: marketSummary.hs300ChangePct >= 0 ? 'up' : 'down',
    },
  ]
})

const footerNavLinks = [
  {
    title: '全天候量化看板',
    domain: 'all-weather.dajitui.vip',
    href: 'https://all-weather.dajitui.vip',
    tone: 'blue',
  },
  {
    title: '网格交易看板',
    domain: 'grid.dajitui.vip',
    href: 'https://grid.dajitui.vip',
    tone: 'teal',
  },
  {
    title: '大盘情绪看板',
    domain: 'emotion.dajitui.vip',
    href: 'https://emotion.dajitui.vip',
    tone: 'green',
  },
  {
    title: 'ETF动量排名看板',
    domain: 'etf.dajitui.vip',
    href: 'https://etf.dajitui.vip',
    tone: 'rose',
  },
  {
    title: '动量轮动看板',
    domain: 'momentum.dajitui.vip',
    href: 'https://momentum.dajitui.vip',
    tone: 'indigo',
  },
  {
    title: '个股热榜',
    domain: 'hot.dajitui.vip',
    href: 'https://hot.dajitui.vip',
    tone: 'orange',
  },
]

function parsePage(value) {
  if (value === 'calendar') return 'calendar'
  return 'detail'
}

function readUrlState() {
  if (typeof window === 'undefined') {
    return { page: 'detail', date: '', month: '', range: '3m' }
  }

  const params = new URLSearchParams(window.location.search)
  return {
    page: parsePage(params.get(PAGE_QUERY_KEY) || ''),
    date: (params.get(DATE_QUERY_KEY) || '').trim(),
    month: (params.get(MONTH_QUERY_KEY) || '').trim(),
    range: (params.get(RANGE_QUERY_KEY) || '').trim(),
  }
}

function writeUrlState(
  {
    page = activePage.value,
    date = historyDate.value,
    month = calendarMonth.value,
    range = calendarRange.value,
  } = {},
  { replace = true } = {},
) {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  params.set(PAGE_QUERY_KEY, page)

  if (page === 'detail' && date) {
    params.set(DATE_QUERY_KEY, date)
  } else {
    params.delete(DATE_QUERY_KEY)
  }

  if (page === 'calendar' && month) {
    params.set(MONTH_QUERY_KEY, month)
  } else {
    params.delete(MONTH_QUERY_KEY)
  }

  if (page === 'calendar' && range) {
    params.set(RANGE_QUERY_KEY, range)
  } else {
    params.delete(RANGE_QUERY_KEY)
  }

  const nextQuery = params.toString()
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`

  if (replace) {
    window.history.replaceState({}, '', nextUrl)
    return
  }

  window.history.pushState({}, '', nextUrl)
}

function formatTradeDate(value) {
  if (!value || typeof value !== 'string' || value.length !== 8) return value || '-'
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function getSafeHistoryDate(value) {
  if (value && tradeDateSet.value.has(value)) {
    return value
  }

  return tradeDates.value.at(-1) || value || ''
}

function getSafeCalendarMonth(value) {
  if (typeof value === 'string' && /^\d{6}$/.test(value)) {
    return value
  }

  const baseDate = historyDate.value || tradeDates.value.at(-1) || ''
  if (baseDate.length === 8) {
    return baseDate.slice(0, 6)
  }

  const now = new Date()
  return `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(2, '0')}`
}

async function loadTradeDateOptions() {
  const payload = await fetchTradeDates()
  tradeDates.value = payload.tradeDates || []
  tradeDateSourceLabel.value = payload.sourceLabel || ''
  return payload
}

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || '数据加载失败'
}

async function loadHistoryDashboard(date = historyDate.value) {
  const requestedDate = getSafeHistoryDate(date)
  if (!requestedDate) {
    throw new Error('未获取到可用交易日列表。')
  }

  const snapshot = await fetchHistoryDashboard(requestedDate)
  historyDashboard.value = snapshot
  historyError.value = ''
  historyDate.value = snapshot?.dataMeta?.requestedTradeDate || requestedDate
  return snapshot
}

async function loadCalendarPage({
  month = calendarMonth.value,
  range = calendarRange.value,
} = {}) {
  const requestedMonth = getSafeCalendarMonth(month)
  const requestedRange = ['1m', '3m', '6m', '1y'].includes(range) ? range : '3m'

  const [summaryPayload, trendPayload] = await Promise.all([
    fetchCalendarSummary(requestedMonth),
    fetchCalendarTrend(requestedRange),
  ])

  calendarSummary.value = summaryPayload
  calendarTrend.value = trendPayload
  calendarMonth.value = summaryPayload.month
  calendarRange.value = trendPayload.range
  calendarError.value = ''
}

async function loadActivePage(page = activePage.value) {
  loading.value = true
  NProgress.start()

  try {
    if (page === 'calendar') {
      await loadCalendarPage()
    } else {
      await loadHistoryDashboard(historyDate.value)
    }
  } catch (error) {
    const message = getErrorMessage(error)
    if (page === 'calendar') {
      calendarSummary.value = null
      calendarTrend.value = null
      calendarError.value = message
    } else {
      historyDashboard.value = null
      historyError.value = message
    }
    ElMessage.error(`数据加载失败：${message}`)
  } finally {
    loading.value = false
    NProgress.done()
  }
}

async function initializeDashboard() {
  try {
    const payload = await loadTradeDateOptions()
    const urlState = readUrlState()

    historyDate.value = getSafeHistoryDate(urlState.date || payload.defaultDate || '')
    calendarMonth.value = getSafeCalendarMonth(urlState.month || historyDate.value.slice(0, 6))
    calendarRange.value = ['1m', '3m', '6m', '1y'].includes(urlState.range) ? urlState.range : '3m'
    activePage.value = parsePage(urlState.page)
    writeUrlState({}, { replace: true })

    await loadActivePage()
  } catch (error) {
    const message = getErrorMessage(error)
    if (activePage.value === 'calendar') {
      calendarSummary.value = null
      calendarTrend.value = null
      calendarError.value = message
    } else {
      historyDashboard.value = null
      historyError.value = message
    }
    loading.value = false
    NProgress.done()
    ElMessage.error(`数据加载失败：${message}`)
  }
}

function handleRetry() {
  loadActivePage()
}

function handlePageChange(page) {
  const nextPage = parsePage(page)
  if (nextPage === activePage.value) {
    return
  }

  activePage.value = nextPage
  if (nextPage === 'calendar') {
    calendarMonth.value = getSafeCalendarMonth(historyDate.value.slice(0, 6))
  }
  writeUrlState({}, { replace: false })
  loadActivePage(nextPage)
}

function handleCalendarMonthChange(month) {
  calendarMonth.value = getSafeCalendarMonth(month)
  activePage.value = 'calendar'
  writeUrlState({}, { replace: false })
  loadCalendarPage({ month: calendarMonth.value, range: calendarRange.value })
}

function handleCalendarRangeChange(range) {
  calendarRange.value = range
  activePage.value = 'calendar'
  writeUrlState({}, { replace: false })
  loadCalendarPage({ month: calendarMonth.value, range })
}

async function openDetailPage(date, { ensureFetched = false } = {}) {
  loading.value = true
  NProgress.start()

  try {
    if (ensureFetched) {
      await fetchMarketEmotionForDate(date)
    }
    await loadHistoryDashboard(date)
    if (calendarSummary.value) {
      await loadCalendarPage({ month: calendarMonth.value, range: calendarRange.value })
    }
    historyDate.value = date
    activePage.value = 'detail'
    writeUrlState({}, { replace: false })
  } catch (error) {
    ElMessage.error(`数据加载失败：${getErrorMessage(error)}`)
  } finally {
    loading.value = false
    NProgress.done()
  }
}

function handleCalendarOpenDetail() {
  const latestTradeDate = calendarSummary.value?.latestTradeDate || tradeDates.value.at(-1) || historyDate.value
  if (!latestTradeDate) {
    handlePageChange('detail')
    return
  }

  openDetailPage(latestTradeDate)
}

function handleTrendPointClick(date) {
  openDetailPage(date)
}

function handleCalendarDayClick(day) {
  if (!day?.isTradeDate || day.isFuture) return

  if (day.status === 'ready') {
    openDetailPage(day.date)
    return
  }

  openDetailPage(day.date, { ensureFetched: true })
}

function handlePopState() {
  const urlState = readUrlState()
  activePage.value = parsePage(urlState.page)
  historyDate.value = getSafeHistoryDate(urlState.date || historyDate.value)
  calendarMonth.value = getSafeCalendarMonth(urlState.month || calendarMonth.value)
  calendarRange.value = ['1m', '3m', '6m', '1y'].includes(urlState.range) ? urlState.range : calendarRange.value
  loadActivePage(activePage.value)
}

function formatPercent(value, digits = 2) {
  return `${Number(value).toFixed(digits)}%`
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', handlePopState)
  }
  initializeDashboard()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('popstate', handlePopState)
  }
})
</script>

<template>
  <div v-loading="loading" class="dashboard-shell">
    <main class="main-panel">
      <div class="page-switch-shell">
        <button
          type="button"
          :class="['page-switch__btn', { 'is-active': activePage === 'detail' }]"
          @click="handlePageChange('detail')"
        >
          详情
        </button>
        <button
          type="button"
          :class="['page-switch__btn', { 'is-active': activePage === 'calendar' }]"
          @click="handlePageChange('calendar')"
        >
          日历总览
        </button>
      </div>

      <template v-if="activePage === 'detail' && dashboard">
      <section class="hero-panel">
        <div class="hero-panel__header">
          <div class="hero-main">
            <p class="hero-kicker">A-Share Market Timing</p>
            <div class="hero-title-row">
              <h1>大鸡腿大盘情绪看板</h1>
              <h2>{{ dashboard.marketSummary.regimeLabel }}</h2>
              <span
                :class="[
                  'open-status-badge',
                  dashboard.marketSummary.allowOpen ? 'is-open' : 'is-blocked',
                ]"
              >
                {{ dashboard.marketSummary.allowOpen ? '允许开仓' : '暂停开仓' }}
              </span>
            </div>
            <p class="hero-subtitle">
              交易日 {{ dashboard.marketSummary.effectiveDate }} | 数据抓取 {{ dataMeta.fetchedAt }}
            </p>
            <div class="meta-strip">
              <span :class="['meta-pill', cacheMetaPillClass]">
                {{ dataMeta.cacheLabel }}
              </span>
              <span class="meta-pill">
                {{ dataMeta.modeLabel }}
              </span>
              <span class="meta-pill">
                交易日 {{ formatTradeDate(dataMeta.requestedTradeDate || historyDate) }}
              </span>
              <span v-if="tradeDateSourceLabel" class="meta-pill">
                可选日期 {{ tradeDateSourceLabel }}
              </span>
            </div>
          </div>

          <div class="score-orb-wrap">
            <div class="score-orb">
              <span>Emotion</span>
              <strong>{{ dashboard.marketSummary.emotionScore.toFixed(1) }}</strong>
            </div>
          </div>
        </div>

        <div class="summary-grid">
          <article
            v-for="card in summaryCards"
            :key="card.label"
            class="summary-card"
          >
            <span>{{ card.label }}</span>
            <strong :class="card.tone">{{ card.value }}</strong>
            <small>{{ card.footnote }}</small>
          </article>

          <article :class="['summary-card', 'position-advice', `is-${dashboard.marketSummary.positionTone}`]">
            <div class="position-advice__top">
              <span>建议仓位</span>
              <span class="position-advice__tier">{{ dashboard.marketSummary.positionTier }}</span>
            </div>
            <strong class="position-advice__value">{{ dashboard.marketSummary.suggestedPosition }}%</strong>
            <div class="position-advice__track">
              <div
                class="position-advice__fill"
                :style="{ width: `${dashboard.marketSummary.suggestedPosition}%` }"
              ></div>
            </div>
          </article>
        </div>

        <div class="ban-reason-bar">
          <div class="ban-reason-label">风控结论</div>
          <div class="ban-reason-items">
            <strong class="risk-summary-title">
              {{ dashboard.marketSummary.riskSummary.title }}
            </strong>
            <p class="risk-summary-desc">
              {{ dashboard.marketSummary.riskSummary.description }}
            </p>
            <span v-for="reason in dashboard.marketSummary.banReasons" :key="reason" class="ban-chip">
              {{ reason }}
            </span>
          </div>
        </div>

        <div v-if="dataMeta.permissionWarnings.length" class="info-banner warning">
          <strong>接口受限说明</strong>
          <p>{{ dataMeta.permissionWarnings.join('；') }}</p>
        </div>

        <div v-if="dataMeta.approximationNotes.length" class="info-banner approx">
          <strong>近似项说明</strong>
          <p>{{ dataMeta.approximationNotes.join('；') }}</p>
        </div>
      </section>

      <section class="panel-grid decision-grid">
        <article class="panel-card gate-card">
          <div class="panel-head">
            <div>
              <h3>开仓门控</h3>
              <p>这里只显示策略真正使用的 3 条硬门控。</p>
            </div>
          </div>

          <div class="gate-list">
            <div v-for="gate in hardGates" :key="gate.key" class="gate-row">
              <div>
                <strong>{{ gate.label }}</strong>
                <p>{{ gate.description }}</p>
              </div>
              <div class="gate-values">
                <span :class="gate.passed ? 'score-up' : 'score-down'">{{ gate.current }}</span>
                <small>{{ gate.threshold }}</small>
              </div>
            </div>
          </div>
        </article>

        <article class="panel-card compact-chart-card">
          <div class="panel-head compact-chart-head">
            <div>
              <h3>趋势速览</h3>
              <p>观察 HS300 与 MA5、MA20 的位置关系。</p>
            </div>
            <el-tag :type="hs300TagType" effect="light">
              涨跌幅 {{ dashboard.marketSummary.hs300ChangePct > 0 ? '+' : '' }}{{ formatPercent(dashboard.marketSummary.hs300ChangePct) }}
            </el-tag>
          </div>

          <div class="compact-chart-metrics">
            <span>现价 {{ dashboard.marketSummary.hs300Close }}</span>
            <span>MA5 {{ dashboard.marketSummary.hs300Ma5 }}</span>
            <span>MA20 {{ dashboard.marketSummary.hs300Ma20 }}</span>
          </div>

          <MarketChart :chart-data="dashboard.marketChart" compact />
        </article>
      </section>

      <section class="panel-grid single-column">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <h3>因子明细</h3>
              <p>关键观察项已合并到这里，完整显示 8 个评分因子的原始值、得分、贡献和近似说明。</p>
            </div>
          </div>

          <el-table :data="sortedFactors" class="factor-table">
            <el-table-column label="因子" min-width="180">
              <template #default="{ row }">
                <div class="factor-name-cell">
                  <strong>{{ row.name }}</strong>
                  <span>{{ row.alias }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="原始值" min-width="220">
              <template #default="{ row }">
                <div class="factor-raw-value mono-text">{{ row.rawValue }}</div>
              </template>
            </el-table-column>
            <el-table-column label="得分" width="110">
              <template #default="{ row }">
                <strong>{{ row.score.toFixed(1) }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="权重" width="100">
              <template #default="{ row }">
                <span>{{ (row.weight * 100).toFixed(0) }}%</span>
              </template>
            </el-table-column>
            <el-table-column label="贡献" width="110">
              <template #default="{ row }">
                <strong class="score-up">{{ row.contribution.toFixed(2) }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="factorTagTypeMap[row.status]" effect="light">
                  {{ factorStatusLabelMap[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="240">
              <template #default="{ row }">
                <div class="factor-desc-cell">
                  <span :class="['tone-dot', factorToneMap[row.status]]"></span>
                  <p>{{ row.description }}</p>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </article>
      </section>
      </template>

      <CalendarOverviewPage
        v-else-if="activePage === 'calendar' && calendarSummary"
        :summary="calendarSummary"
        :trend="calendarTrend"
        :selected-range="calendarRange"
        @open-detail="handleCalendarOpenDetail"
        @month-change="handleCalendarMonthChange"
        @day-click="handleCalendarDayClick"
        @range-change="handleCalendarRangeChange"
        @trend-point-click="handleTrendPointClick"
      />

      <template v-else>
      <section class="panel-card empty-state-card">
        <div class="panel-head">
          <div>
            <h3>{{ emptyStateTitle }}</h3>
            <p>{{ emptyStateSubtitle }}</p>
          </div>
        </div>

        <el-alert
          :title="activeError || '请先配置 TUSHARE_TOKEN 并启动本地代理服务'"
          type="warning"
          :closable="false"
          show-icon
        />

        <div class="empty-state-steps">
          <p v-for="(step, index) in emptyStateSteps" :key="step">{{ index + 1 }}. {{ step }}</p>
        </div>

        <div class="empty-state-actions">
          <el-button type="primary" @click="handleRetry">重新加载</el-button>
        </div>
      </section>
      </template>

      <section class="footer-nav">
        <a
          v-for="item in footerNavLinks"
          :key="item.href"
          :href="item.href"
          target="_blank"
          rel="noreferrer"
          :class="['footer-nav-card', `is-${item.tone}`]"
        >
          <span class="footer-nav-card__eyebrow">相关导航</span>
          <strong>{{ item.title }}</strong>
          <span class="footer-nav-card__domain">{{ item.domain }}</span>
        </a>
      </section>

      <section class="footer-note">
        <div class="qr-card">
          <div class="qr-copy">
            <h3>交流与反馈</h3>
            <p>
              欢迎扫码进群交流，获取最新策略动态、量化研究思路和产品更新通知；如果二维码失效，也可以直接添加微信沟通。
            </p>
            <div class="qr-meta">
              <span class="contact-chip">扫码进群交流</span>
              <span class="contact-chip">微信号: Code_Mvp</span>
            </div>
            <div class="qr-hint">进群后可交流策略想法、页面建议和功能反馈。</div>
          </div>
          <img class="qr-image" src="/wechat_qr.jpg" alt="大鸡腿策略馆微信二维码" />
        </div>
      </section>

      <footer class="page-credit">
        鸣谢：
        <a
          href="https://mp.weixin.qq.com/s/E2EQ0e442-PNN43x6Mn5WA"
          target="_blank"
          rel="noreferrer"
        >
          群友饕餮风月
        </a> 提供大盘情绪算法
      </footer>
    </main>
  </div>
</template>

<style scoped>
.page-switch-shell {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  margin-bottom: 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(228, 232, 240, 0.95);
  box-shadow: var(--shadow-soft);
}

.page-switch__btn {
  border: 0;
  border-radius: 999px;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #6f7685;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-switch__btn.is-active {
  color: #111827;
  background: linear-gradient(135deg, #f8d56b, #ffefb0);
  box-shadow: 0 8px 20px rgba(248, 213, 107, 0.24);
}

.empty-state-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.footer-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.footer-nav-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 96px;
  padding: 16px 18px;
  border-radius: 22px;
  text-decoration: none;
  color: #43506a;
  border: 1px solid rgba(219, 226, 237, 0.9);
  box-shadow: 0 10px 24px rgba(31, 44, 70, 0.04);
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.footer-nav-card::after {
  content: '';
  position: absolute;
  right: -18px;
  bottom: -18px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  opacity: 0.45;
}

.footer-nav-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px rgba(31, 44, 70, 0.08);
}

.footer-nav-card__eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8b94a7;
}

.footer-nav-card strong {
  font-size: 21px;
  line-height: 1.2;
  color: #24314d;
}

.footer-nav-card__domain {
  font-size: 12px;
  color: #758099;
}

.footer-nav-card.is-blue {
  background: linear-gradient(135deg, rgba(74, 119, 214, 0.12), rgba(112, 151, 235, 0.08));
}

.footer-nav-card.is-blue::after {
  background: rgba(78, 122, 217, 0.14);
}

.footer-nav-card.is-teal {
  background: linear-gradient(135deg, rgba(69, 184, 163, 0.14), rgba(108, 214, 203, 0.08));
}

.footer-nav-card.is-teal::after {
  background: rgba(64, 179, 160, 0.14);
}

.footer-nav-card.is-violet {
  background: linear-gradient(135deg, rgba(178, 97, 214, 0.14), rgba(221, 126, 214, 0.08));
}

.footer-nav-card.is-violet::after {
  background: rgba(196, 109, 214, 0.14);
}

.footer-nav-card.is-amber {
  background: linear-gradient(135deg, rgba(245, 168, 53, 0.16), rgba(253, 205, 114, 0.08));
}

.footer-nav-card.is-amber::after {
  background: rgba(250, 180, 72, 0.14);
}

.footer-nav-card.is-indigo {
  background: linear-gradient(135deg, rgba(89, 118, 228, 0.13), rgba(95, 187, 204, 0.08));
}

.footer-nav-card.is-indigo::after {
  background: rgba(101, 140, 227, 0.14);
}

.footer-nav-card.is-orange {
  background: linear-gradient(135deg, rgba(235, 122, 49, 0.15), rgba(255, 173, 92, 0.08));
}

.footer-nav-card.is-orange::after {
  background: rgba(241, 128, 54, 0.14);
}

.footer-nav-card.is-green {
  background: linear-gradient(135deg, rgba(66, 184, 130, 0.14), rgba(108, 214, 163, 0.08));
}

.footer-nav-card.is-green::after {
  background: rgba(62, 179, 120, 0.14);
}

.footer-nav-card.is-rose {
  background: linear-gradient(135deg, rgba(226, 96, 132, 0.14), rgba(244, 136, 160, 0.08));
}

.footer-nav-card.is-rose::after {
  background: rgba(231, 103, 140, 0.14);
}

.footer-note {
  margin-top: 16px;
}

.qr-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  gap: 22px;
  align-items: center;
  padding: 22px 24px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(245, 247, 251, 0.92));
  border: 1px solid rgba(219, 226, 237, 0.92);
  box-shadow: 0 14px 32px rgba(31, 44, 70, 0.05);
}

.qr-copy h3 {
  margin: 0;
  color: #24314d;
  font-size: 17px;
}

.qr-copy p {
  margin: 10px 0 0;
  color: #6d7890;
  font-size: 14px;
  line-height: 1.9;
}

.qr-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 7px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(244, 247, 252, 0.98), rgba(228, 235, 246, 0.92));
  color: #4661a7;
  border: 1px solid rgba(202, 213, 231, 0.95);
  font-size: 13px;
  font-weight: 700;
}

.qr-hint {
  margin-top: 14px;
  color: #8a95a9;
  font-size: 13px;
  line-height: 1.8;
}

.qr-image {
  width: 128px;
  height: 128px;
  object-fit: cover;
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
  border: 1px solid rgba(214, 222, 235, 0.96);
  padding: 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.page-credit {
  margin-top: 16px;
  text-align: center;
  color: #7f8798;
  font-size: 13px;
}

.page-credit a {
  color: #3f7df6;
  font-weight: 600;
  text-decoration: none;
}

.page-credit a:hover {
  text-decoration: underline;
}

@media (max-width: 980px) {
  .footer-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .footer-nav {
    grid-template-columns: 1fr;
  }

  .qr-card {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .qr-image {
    width: 112px;
    height: 112px;
  }
}
</style>
