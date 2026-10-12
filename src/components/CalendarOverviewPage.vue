<script setup>
import { computed } from 'vue'
import CalendarTrendChart from './CalendarTrendChart.vue'

const props = defineProps({
  summary: {
    type: Object,
    default: null,
  },
  trend: {
    type: Object,
    default: null,
  },
  selectedRange: {
    type: String,
    default: '3m',
  },
})

const emit = defineEmits([
  'open-detail',
  'month-change',
  'day-click',
  'range-change',
  'trend-point-click',
])

const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const calendarCells = computed(() => {
  const days = props.summary?.days || []
  if (!days.length) return []

  const firstDate = days[0].date
  const firstDay = new Date(`${firstDate.slice(0, 4)}-${firstDate.slice(4, 6)}-${firstDate.slice(6, 8)}T00:00:00`).getDay()
  const mondayIndex = firstDay === 0 ? 6 : firstDay - 1
  const leading = Array.from({ length: mondayIndex }, (_, index) => ({
    key: `empty-${index}`,
    empty: true,
  }))

  return [...leading, ...days.map((item) => ({ ...item, key: item.date }))]
})

function getDayLabel(day) {
  return `${Number(day.date.slice(6, 8))}`
}

function getStatusText(day) {
  if (day.isFuture) return '未到交易日'
  if (day.status === 'missing') return '待获取'
  if (day.status === 'error') return '获取失败'
  if (!day.isTradeDate) return '非交易日'
  return day.allowOpen ? '可开仓' : '暂停开仓'
}

function getScoreText(day) {
  if (day.emotionScore == null) return '--'
  return `${Number(day.emotionScore).toFixed(1)}`
}

function handleDayClick(day) {
  if (!day || day.empty || !day.isTradeDate || day.isFuture) return
  emit('day-click', day)
}
</script>

<template>
  <section class="calendar-page">
    <section class="hero-panel">
      <div class="calendar-head">
        <div>
          <p class="hero-kicker">Calendar Overview</p>
          <div class="hero-title-row">
            <h1>情绪日历总览</h1>
            <span class="open-status-badge is-open">按月查看情绪、仓位与开仓状态</span>
          </div>
          <p class="hero-subtitle">
            交易日但尚未缓存的数据会显示为“待获取”，点击后自动抓取并进入详情页。
          </p>
        </div>

        <div class="calendar-head__actions">
          <el-button @click="emit('open-detail')">查看最新详情</el-button>
        </div>
      </div>
    </section>

    <section class="panel-grid calendar-grid">
      <article class="panel-card calendar-card">
        <div class="panel-head calendar-panel-head">
          <div class="calendar-toolbar">
            <el-button text @click="emit('month-change', summary?.prevMonth)">上月</el-button>
            <strong>{{ summary?.monthLabel || '月历' }}</strong>
            <el-button text @click="emit('month-change', summary?.nextMonth)">下月</el-button>
          </div>
          <div class="calendar-tip">点击交易日可查看详情或补抓数据</div>
        </div>

        <div class="weekday-row">
          <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
        </div>

        <div class="month-grid">
          <button
            v-for="day in calendarCells"
            :key="day.key"
            type="button"
            :disabled="day.empty || !day.isTradeDate || day.isFuture"
            :class="[
              'calendar-cell',
              day.empty ? 'is-empty' : '',
              day.status ? `is-${day.status}` : '',
              day.allowOpen === true ? 'is-open-day' : '',
              day.allowOpen === false ? 'is-blocked-day' : '',
              day.isFuture ? 'is-future' : '',
            ]"
            @click="handleDayClick(day)"
          >
            <template v-if="!day.empty">
              <div class="calendar-cell__day">{{ getDayLabel(day) }}</div>
              <div class="calendar-cell__score">情绪 {{ getScoreText(day) }}</div>
              <div class="calendar-cell__position">
                仓位 {{ day.suggestedPosition != null ? `${day.suggestedPosition}%` : '--' }}
              </div>
              <div class="calendar-cell__status">{{ getStatusText(day) }}</div>
            </template>
          </button>
        </div>
      </article>

      <article class="panel-card calendar-trend-card">
        <div class="panel-head">
          <div>
            <h3>趋势总览</h3>
            <p>展示沪深300收盘走势与建议仓位走势，点击数据点可进入对应详情页。</p>
          </div>
          <div class="range-switch">
            <button
              v-for="range in ['1m', '3m', '6m', '1y']"
              :key="range"
              type="button"
              :class="['range-switch__btn', { 'is-active': selectedRange === range }]"
              @click="emit('range-change', range)"
            >
              {{ range }}
            </button>
          </div>
        </div>

        <CalendarTrendChart
          :series-data="trend?.series || []"
          @point-click="emit('trend-point-click', $event)"
        />
      </article>
    </section>
  </section>
</template>

<style scoped>
.calendar-page {
  display: grid;
  gap: 22px;
}

.hero-panel,
.panel-card {
  position: relative;
  overflow: hidden;
  background: var(--bg-soft);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow);
  border-radius: 28px;
  backdrop-filter: blur(18px);
}

.hero-panel {
  padding: 26px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.hero-kicker {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-title-row h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.hero-subtitle {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 14px;
}

.open-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.open-status-badge.is-open {
  background: rgba(239, 90, 90, 0.12);
  color: var(--accent-green);
}

.calendar-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.calendar-head__actions {
  display: flex;
  align-items: flex-start;
}

.calendar-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.calendar-card,
.calendar-trend-card {
  padding: 22px;
}

.calendar-panel-head {
  margin-bottom: 18px;
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
}

.calendar-toolbar strong {
  font-size: 22px;
}

.calendar-tip {
  color: var(--text-muted);
  font-size: 13px;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.weekday-row span {
  text-align: center;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}

.calendar-cell {
  min-height: 116px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.68);
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.calendar-cell:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft);
}

.calendar-cell:disabled {
  cursor: default;
}

.calendar-cell.is-empty {
  background: transparent;
  border-style: dashed;
  border-color: transparent;
}

.calendar-cell.is-ready.is-open-day {
  background: rgba(239, 90, 90, 0.1);
  border-color: rgba(239, 90, 90, 0.18);
}

.calendar-cell.is-ready.is-blocked-day {
  background: rgba(35, 163, 106, 0.1);
  border-color: rgba(35, 163, 106, 0.18);
}

.calendar-cell.is-missing {
  background: rgba(238, 155, 40, 0.12);
  border-color: rgba(238, 155, 40, 0.25);
}

.calendar-cell.is-future,
.calendar-cell.is-non_trading {
  background: rgba(237, 240, 245, 0.8);
  color: var(--text-muted);
}

.calendar-cell__day {
  font-size: 20px;
  font-weight: 700;
}

.calendar-cell__score,
.calendar-cell__position,
.calendar-cell__status {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.35;
}

.calendar-cell__status {
  font-weight: 700;
}

.range-switch {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(228, 232, 240, 0.95);
}

.range-switch__btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 12px;
  color: #6f7685;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
}

.range-switch__btn.is-active {
  color: #111827;
  background: linear-gradient(135deg, #f8d56b, #ffefb0);
}

@media (max-width: 820px) {
  .month-grid {
    gap: 8px;
  }

  .calendar-cell {
    min-height: 100px;
    padding: 10px;
  }
}
</style>
