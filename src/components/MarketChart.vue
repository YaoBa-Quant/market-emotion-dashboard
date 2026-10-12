<script setup>
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  chartData: {
    type: Object,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const chartRef = ref(null)
let chartInstance

const chartOption = computed(() => ({
  animationDuration: 600,
  color: ['#ef5a5a', '#23a36a', '#3f7df6'],
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(19, 26, 39, 0.92)',
    borderWidth: 0,
    textStyle: {
      color: '#f6f8fb',
      fontSize: 12,
    },
  },
  legend: {
    top: props.compact ? 2 : 6,
    right: 8,
    itemWidth: 10,
    itemHeight: 10,
    textStyle: {
      color: '#6f7685',
    },
  },
  grid: {
    left: 16,
    right: 16,
    top: props.compact ? 36 : 48,
    bottom: props.compact ? 10 : 18,
    containLabel: true,
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: props.chartData.dates,
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
  yAxis: {
    type: 'value',
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
  series: [
    {
      name: '沪深300',
      type: 'line',
      data: props.chartData.close,
      symbol: 'circle',
      symbolSize: 6,
      smooth: true,
      lineStyle: {
        width: 3,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(239, 90, 90, 0.25)' },
            { offset: 1, color: 'rgba(239, 90, 90, 0.02)' },
          ],
        },
      },
    },
    {
      name: 'MA5',
      type: 'line',
      data: props.chartData.ma5,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 2,
      },
    },
    {
      name: 'MA20',
      type: 'line',
      data: props.chartData.ma20,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 2,
      },
    },
  ],
}))

function renderChart() {
  if (!chartRef.value) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  chartInstance.setOption(chartOption.value)
}

function handleResize() {
  chartInstance?.resize()
}

watch(
  () => props.chartData,
  () => renderChart(),
  { deep: true },
)

onMounted(() => {
  renderChart()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<template>
  <div ref="chartRef" :class="['market-chart', { compact }]"></div>
</template>

<style scoped>
.market-chart {
  width: 100%;
  height: 340px;
}

.market-chart.compact {
  height: 240px;
}
</style>
