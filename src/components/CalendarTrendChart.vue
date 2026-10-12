<script setup>
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  seriesData: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['point-click'])

const chartRef = ref(null)
let chartInstance
let resizeObserver

const chartOption = computed(() => {
  const labels = props.seriesData.map((item) => (item.tradeDate || '').slice(4))
  const hs300Series = props.seriesData.map((item) => item.hs300Close ?? null)
  const positionSeries = props.seriesData.map((item) => item.suggestedPosition ?? null)

  return {
    animationDuration: 500,
    color: ['#ef5a5a', '#3f7df6'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(19, 26, 39, 0.92)',
      borderWidth: 0,
      textStyle: {
        color: '#f6f8fb',
        fontSize: 12,
      },
      formatter(params) {
        const point = props.seriesData[params?.[0]?.dataIndex] || {}
        const hs300 = point.hs300Close != null ? point.hs300Close : '-'
        const position = point.suggestedPosition != null ? `${point.suggestedPosition}%` : '-'
        const emotion = point.emotionScore != null ? point.emotionScore : '-'
        return [
          `${point.tradeDate || '-'}`,
          `沪深300: ${hs300}`,
          `建议仓位: ${position}`,
          `情绪分数: ${emotion}`,
        ].join('<br/>')
      },
    },
    legend: {
      top: 6,
      right: 8,
      textStyle: {
        color: '#6f7685',
      },
    },
    grid: {
      left: 20,
      right: 20,
      top: 42,
      bottom: 20,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: {
        lineStyle: {
          color: '#d7dbe4',
        },
      },
      axisLabel: {
        color: '#8c93a4',
        fontSize: 11,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: 'HS300',
        scale: true,
        splitLine: {
          lineStyle: {
            color: '#edf0f5',
          },
        },
        axisLabel: {
          color: '#8c93a4',
          fontSize: 11,
        },
      },
      {
        type: 'value',
        name: '仓位',
        min: 0,
        max: 100,
        splitLine: {
          show: false,
        },
        axisLabel: {
          formatter: '{value}%',
          color: '#8c93a4',
          fontSize: 11,
        },
      },
    ],
    series: [
      {
        name: '沪深300',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: hs300Series,
        lineStyle: {
          width: 3,
        },
      },
      {
        name: '建议仓位',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 6,
        data: positionSeries,
        lineStyle: {
          width: 3,
        },
      },
    ],
  }
})

function handleResize() {
  chartInstance?.resize()
}

function bindClick() {
  if (!chartInstance) return
  chartInstance.off('click')
  chartInstance.on('click', (params) => {
    const point = props.seriesData[params.dataIndex]
    if (point?.tradeDate) {
      emit('point-click', point.tradeDate)
    }
  })
}

function renderChart() {
  if (!chartRef.value) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  chartInstance.resize()
  chartInstance.setOption(chartOption.value)
  bindClick()
}

watch(
  () => props.seriesData,
  () => renderChart(),
  { deep: true },
)

onMounted(() => {
  renderChart()
  window.addEventListener('resize', handleResize)
  if (typeof ResizeObserver !== 'undefined' && chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>

<template>
  <div ref="chartRef" class="calendar-trend-chart"></div>
</template>

<style scoped>
.calendar-trend-chart {
  width: 100%;
  height: 320px;
}
</style>
