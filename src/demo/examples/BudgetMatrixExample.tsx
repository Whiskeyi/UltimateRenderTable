import { Target } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  UltiGridInsight,
  type InsightColumn,
  type InsightColumnDefinition,
  type LazyRowSource,
  type UltiGridInsightApi,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface BudgetRow {
  id: number
  index: number
}

type MetricKind = 'budget' | 'actual' | 'variance'

const ROW_COUNT = 12_000
const REPORTING_YEAR = 2026
const LATEST_ACTUAL_MONTH = 6
const DIMENSION_COLUMN_COUNT = 2
const METRICS_PER_MONTH = 3
const MONTH_COUNT = 12
const COLUMN_COUNT = DIMENSION_COLUMN_COUNT + MONTH_COUNT * METRICS_PER_MONTH
const LATEST_ACTUAL_COLUMN = DIMENSION_COLUMN_COUNT
  + LATEST_ACTUAL_MONTH * METRICS_PER_MONTH
  + 1

const SEASONAL_FACTOR = [
  0.88,
  0.91,
  0.96,
  1.01,
  1.04,
  1.08,
  1.12,
  1.09,
  1.03,
  1.06,
  1.14,
  1.22,
] as const

const ROW_SOURCE: LazyRowSource<BudgetRow> = {
  rowCount: ROW_COUNT,
  getRow: (index) => ({ id: index, index }),
  getRowId: (row) => row.id,
}

const SHELL_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  border: '1px solid #dfe5e1',
  borderRadius: 12,
  background: '#fff',
}

const TOOLBAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
  padding: '8px 10px',
  borderBottom: '1px solid rgba(21, 63, 47, 0.12)',
  background: 'rgba(246, 250, 248, 0.92)',
  color: '#29483b',
  fontSize: 12,
}

const TOOLBAR_GROUP_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
}

const BUTTON_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 30,
  padding: '5px 10px',
  border: '1px solid rgba(24, 119, 79, 0.24)',
  borderRadius: 8,
  background: '#fff',
  color: '#176f49',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const GRID_STYLE: CSSProperties = {
  height: '100%',
  minHeight: 0,
}

function budgetFor(rowIndex: number, monthIndex: number): number {
  const base = 280_000 + ((rowIndex * 17_389) % 1_050_000)
  const seasonal = SEASONAL_FACTOR[monthIndex] ?? 1
  return Math.round((base * seasonal + monthIndex * 17_500) / 100) * 100
}

function varianceFor(rowIndex: number, monthIndex: number, budget: number): number {
  if ((rowIndex + monthIndex * 3) % 41 === 0) return 0
  const varianceBand = ((rowIndex * 7 + monthIndex * 13) % 17) - 8
  return Math.round((budget * varianceBand * 0.012) / 100) * 100
}

function actualFor(rowIndex: number, monthIndex: number): number | null {
  if (monthIndex > LATEST_ACTUAL_MONTH) return null
  const budget = budgetFor(rowIndex, monthIndex)
  return budget + varianceFor(rowIndex, monthIndex, budget)
}

function varianceValueFor(rowIndex: number, monthIndex: number): number | null {
  const actual = actualFor(rowIndex, monthIndex)
  return actual === null ? null : actual - budgetFor(rowIndex, monthIndex)
}

export default function BudgetMatrixExample({ locale, t }: GalleryExampleProps) {
  const apiRef = useRef<UltiGridInsightApi | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth <= 640
  ))
  const isChinese = locale === 'zh-CN'

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const update = () => setCompact(shell.clientWidth <= 640)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const copy = useMemo(() => isChinese
    ? {
        division: '事业群',
        costCenter: '成本中心',
        budget: '预算',
        actual: '实际',
        variance: '差异',
        through: '实际已关账至',
        jump: '定位最近实际月份',
        rows: '个成本中心',
        columns: '列',
        noActual: '待关账',
      }
    : {
        division: 'Division',
        costCenter: 'Cost center',
        budget: 'Budget',
        actual: 'Actual',
        variance: 'Variance',
        through: 'Actuals closed through',
        jump: 'Jump to latest actuals',
        rows: 'cost centers',
        columns: 'columns',
        noActual: 'Pending close',
      }, [isChinese])

  const divisions = useMemo(() => isChinese
    ? ['华东', '华南', '华北', '西区', '海外', '平台', '供应链', '企业服务']
    : ['East', 'South', 'North', 'West', 'International', 'Platform', 'Supply Chain', 'Enterprise'],
  [isChinese])

  const portfolios = useMemo(() => isChinese
    ? ['云产品', '数据智能', '客户成功', '商业增长', '交付运营', '研发效能']
    : ['Cloud', 'Data Intelligence', 'Customer Success', 'Growth', 'Delivery', 'R&D'],
  [isChinese])

  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      timeZone: 'UTC',
    })
    return Array.from({ length: MONTH_COUNT }, (_, monthIndex) => formatter.format(
      new Date(Date.UTC(REPORTING_YEAR, monthIndex, 1)),
    ))
  }, [locale])

  const money = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    notation: 'compact',
    maximumFractionDigits: 1,
  }), [locale])

  const integer = useMemo(() => new Intl.NumberFormat(locale), [locale])

  const formatMoney = useCallback((value: number | null) => (
    value === null ? copy.noActual : money.format(value)
  ), [copy.noActual, money])

  const formatVariance = useCallback((value: number | null) => {
    if (value === null) return copy.noActual
    if (value === 0) return money.format(0)
    return `${value > 0 ? '+' : '-'}${money.format(Math.abs(value))}`
  }, [copy.noActual, money])

  const getMetricColumn = useCallback((
    kind: MetricKind,
    monthIndex: number,
  ): InsightColumn<BudgetRow, number | null> => {
    const month = monthLabels[monthIndex] ?? String(monthIndex + 1)
    const baseStyle = {
      horizontalAlign: 'right' as const,
      fontFamily: 'var(--font-mono)',
      paddingInline: 10,
    }

    if (kind === 'budget') {
      return {
        id: `${REPORTING_YEAR}-${monthIndex + 1}-budget`,
        header: `${month} · ${copy.budget}`,
        headerText: `${month} ${copy.budget}`,
        getValue: (row) => budgetFor(row.index, monthIndex),
        formatValue: formatMoney,
        visualStyle: baseStyle,
        conditionalRules: [{
          id: `budget-bar-${monthIndex}`,
          kind: 'dataBar',
          domain: [0, 2_000_000],
          color: 'rgba(52, 116, 186, 0.19)',
        }],
      }
    }

    if (kind === 'actual') {
      return {
        id: `${REPORTING_YEAR}-${monthIndex + 1}-actual`,
        header: `${month} · ${copy.actual}`,
        headerText: `${month} ${copy.actual}`,
        getValue: (row) => actualFor(row.index, monthIndex),
        formatValue: formatMoney,
        visualStyle: ({ value }) => ({
          ...baseStyle,
          color: value === null ? '#8b9892' : '#243f34',
          fontStyle: value === null ? 'italic' : 'normal',
        }),
        conditionalRules: [{
          id: `actual-bar-${monthIndex}`,
          kind: 'dataBar',
          domain: [0, 2_000_000],
          color: 'rgba(29, 143, 93, 0.20)',
        }],
      }
    }

    return {
      id: `${REPORTING_YEAR}-${monthIndex + 1}-variance`,
      header: `${month} · ${copy.variance}`,
      headerText: `${month} ${copy.variance}`,
      getValue: (row) => varianceValueFor(row.index, monthIndex),
      formatValue: formatVariance,
      visualStyle: ({ value }) => ({
        ...baseStyle,
        color: value === null ? '#8b9892' : undefined,
        fontStyle: value === null ? 'italic' : 'normal',
      }),
      conditionalRules: [
        {
          id: `variance-bar-${monthIndex}`,
          kind: 'dataBar',
          domain: [-200_000, 200_000],
          axis: 0,
          color: 'rgba(29, 143, 93, 0.27)',
          negativeColor: 'rgba(196, 72, 67, 0.25)',
        },
        {
          id: `variance-positive-${monthIndex}`,
          kind: 'text',
          when: { operator: 'greaterThan', value: 0 },
          style: { color: '#177a50', fontWeight: 700 },
        },
        {
          id: `variance-negative-${monthIndex}`,
          kind: 'text',
          when: { operator: 'lessThan', value: 0 },
          style: { color: '#b54c48', fontWeight: 700 },
        },
        {
          id: `variance-zero-${monthIndex}`,
          kind: 'text',
          when: { operator: 'equals', value: 0 },
          style: { color: '#6d7d75', fontWeight: 600 },
        },
      ],
    }
  }, [copy, formatMoney, formatVariance, monthLabels])

  const getColumn = useCallback((columnIndex: number): InsightColumnDefinition<BudgetRow> => {
    if (columnIndex === 0) {
      return {
        id: 'division',
        header: copy.division,
        headerText: copy.division,
        getValue: (row) => divisions[row.index % divisions.length] ?? '',
        visualStyle: {
          color: '#24483a',
          fontWeight: 700,
          paddingInline: 12,
        },
      }
    }

    if (columnIndex === 1) {
      return {
        id: 'cost-center',
        header: copy.costCenter,
        headerText: copy.costCenter,
        getValue: (row) => {
          const code = String(row.index + 1).padStart(5, '0')
          const portfolio = portfolios[Math.floor(row.index / divisions.length) % portfolios.length] ?? ''
          return `CC-${code} · ${portfolio}`
        },
        visualStyle: {
          color: '#263b32',
          fontWeight: 600,
          paddingInline: 12,
        },
      }
    }

    const metricIndex = columnIndex - DIMENSION_COLUMN_COUNT
    const monthIndex = Math.floor(metricIndex / METRICS_PER_MONTH)
    const kind: MetricKind = metricIndex % METRICS_PER_MONTH === 0
      ? 'budget'
      : metricIndex % METRICS_PER_MONTH === 1
        ? 'actual'
        : 'variance'
    return getMetricColumn(kind, monthIndex)
  }, [copy, divisions, getMetricColumn, portfolios])

  const getColumnWidth = useCallback((columnIndex: number) => {
    if (columnIndex === 0) return compact ? 104 : 124
    if (columnIndex === 1) return compact ? 168 : 196
    return compact
      ? 120
      : (columnIndex - DIMENSION_COLUMN_COUNT) % METRICS_PER_MONTH === 2 ? 138 : 132
  }, [compact])

  const jumpToLatestActuals = useCallback(() => {
    apiRef.current?.scrollToCell({ row: 0, column: LATEST_ACTUAL_COLUMN }, 'center')
    apiRef.current?.focus()
  }, [])

  const latestMonth = monthLabels[LATEST_ACTUAL_MONTH] ?? String(LATEST_ACTUAL_MONTH + 1)

  return (
    <div ref={shellRef} style={SHELL_STYLE}>
      <div style={TOOLBAR_STYLE}>
        <div style={TOOLBAR_GROUP_STYLE}>
          <strong>{REPORTING_YEAR} · CNY</strong>
          <span>{integer.format(ROW_COUNT)} {copy.rows} · {COLUMN_COUNT} {copy.columns}</span>
          <span>{copy.through} {latestMonth}</span>
        </div>
        <button
          type="button"
          onClick={jumpToLatestActuals}
          style={BUTTON_STYLE}
          aria-label={`${copy.jump}: ${latestMonth}`}
        >
          <Target size={14} aria-hidden="true" />
          {copy.jump} · {latestMonth}
        </button>
      </div>

      <div style={GRID_STYLE}>
        <UltiGridInsight
          rowSource={ROW_SOURCE}
          columnCount={COLUMN_COUNT}
          getColumn={getColumn}
          getColumnWidth={getColumnWidth}
          apiRef={apiRef}
          frozen={{ top: 0, left: compact ? 1 : 2 }}
          fitColumns="none"
          defaultColumnWidth={132}
          defaultRowHeight={36}
          overscan={{ rows: 8, columns: 3 }}
          showRowNumbers={false}
          stripedRows
          columnResize={{ minWidth: 96, maxWidth: 260 }}
          themeColor="#18774f"
          ariaLabel={t('gallery.budget.title')}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
