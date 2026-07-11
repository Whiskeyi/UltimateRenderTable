import type { CSSProperties, ReactNode } from 'react'
import type {
  InsightColumn,
  LazyRowSource,
  RowMeta,
} from '@ultigrid/insight'
import { translate, type Locale, type MessageKey } from '../i18n'
import type { StudioScenario } from '../studio'

export interface DemoRow {
  id: number
  index: number
}

const PRODUCTS = ['Cloud One', 'Atlas Pro', 'Nova BI', 'Pulse CRM', 'Orbit AI', 'Vertex DB']
const OWNERS: Record<Locale, readonly string[]> = {
  'zh-CN': ['林一', '周宁', '秦月', '陈屿', '苏禾', '顾言'],
  'en-US': ['Lynn', 'Noah', 'Quinn', 'Cody', 'Sofia', 'Gavin'],
}
const REGION_KEYS: readonly MessageKey[] = [
  'demo.region.east',
  'demo.region.south',
  'demo.region.north',
  'demo.region.southwest',
  'demo.region.northeast',
  'demo.region.overseas',
]
const CHANNEL_KEYS: readonly MessageKey[] = [
  'demo.channel.direct',
  'demo.channel.partner',
  'demo.channel.ecommerce',
  'demo.channel.enterprise',
]
const STATUS_KEYS: readonly MessageKey[] = [
  'demo.status.exceed',
  'demo.status.healthy',
  'demo.status.watch',
  'demo.status.risk',
]
const REGION_GROUP_SIZE = 8
const PRODUCT_GROUP_SIZE = 4

const AVATARS = [
  svgAvatar('LY', '#dbf4e6', '#177a4b'),
  svgAvatar('ZN', '#e7edff', '#405db8'),
  svgAvatar('QY', '#fff0d8', '#9a6118'),
  svgAvatar('CY', '#eee8ff', '#6c4eb5'),
  svgAvatar('SH', '#ffe7e5', '#a4433b'),
  svgAvatar('GY', '#e0f4f5', '#25747a'),
]

const COLUMN_WIDTHS: Record<StudioScenario, ReadonlyMap<number, number>> = {
  intro: new Map(),
  gallery: new Map(),
  analysis: new Map([
    [0, 200], [1, 160], [2, 148], [3, 108], [4, 136],
    [5, 116], [6, 116], [7, 148], [8, 160], [9, 166],
  ]),
  conditional: new Map([
    [0, 182], [1, 164], [2, 142], [3, 132], [4, 126],
    [5, 132], [6, 152], [7, 136], [8, 190],
  ]),
}

const TREE_COLUMN_WIDTHS = new Map([
  [0, 282], [1, 108], [2, 148], [3, 132], [4, 132],
  [5, 120], [6, 164], [7, 116], [8, 166],
])

export interface DemoViewOptions {
  treeEnabled?: boolean
}

export interface DemoRowSourceOptions extends DemoViewOptions {
  toggledRows: ReadonlySet<number>
  expandedByDefault: boolean
}

export function getDemoColumnWidths(
  scenario: StudioScenario,
  options: DemoViewOptions = {},
): ReadonlyMap<number, number> {
  if (scenario === 'analysis' && options.treeEnabled) return TREE_COLUMN_WIDTHS
  return COLUMN_WIDTHS[scenario]
}

export function createDemoRowSource(
  rowCount: number,
  options: DemoRowSourceOptions,
): LazyRowSource<DemoRow> {
  const cache = new Map<number, DemoRow>()
  const tree = options.treeEnabled
    ? createTreeVisibilityIndex(rowCount, options.toggledRows, options.expandedByDefault)
    : null
  return {
    rowCount: tree?.visibleCount ?? rowCount,
    getRow(index) {
      const cached = cache.get(index)
      if (cached) return cached
      const logicalIndex = tree?.logicalIndexAt(index) ?? index
      const row = { id: logicalIndex, index: logicalIndex }
      cache.set(index, row)
      trimCache(cache, 512)
      return row
    },
    getRowId: (row) => row.id,
    getRowMeta(index, target = emptyRowMeta()) {
      const logicalIndex = tree?.logicalIndexAt(index) ?? index
      const position = logicalIndex % TREE_GROUP_SIZE
      const groupRoot = logicalIndex - position
      const depth = tree ? treeDepth(logicalIndex) : 0
      const expandable = Boolean(tree && isTreeNodeExpandable(logicalIndex, rowCount))
      target.id = logicalIndex
      target.depth = depth
      target.parentId = depth === 0
        ? undefined
        : depth === 1
          ? groupRoot
          : groupRoot + branchPositionForLeaf(position)
      target.expandable = expandable
      target.expanded = expandable && tree!.isExpanded(logicalIndex)
      target.loading = false
      target.error = undefined
      return target
    },
  }
}

const TREE_GROUP_SIZE = 18
const TREE_BRANCH_POSITIONS = [1, 7, 13] as const

interface TreeVisibilityIndex {
  visibleCount: number
  logicalIndexAt(visibleIndex: number): number
  isExpanded(logicalIndex: number): boolean
}

function createTreeVisibilityIndex(
  rowCount: number,
  toggledRows: ReadonlySet<number>,
  expandedByDefault: boolean,
): TreeVisibilityIndex {
  const groupCount = Math.ceil(rowCount / TREE_GROUP_SIZE)
  const isExpanded = (logicalIndex: number) => {
    if (!isTreeNodeExpandable(logicalIndex, rowCount)) return false
    return expandedByDefault ? !toggledRows.has(logicalIndex) : toggledRows.has(logicalIndex)
  }
  const visiblePrefix = new Int32Array(groupCount + 1)
  for (let group = 0; group < groupCount; group += 1) {
    const root = group * TREE_GROUP_SIZE
    const length = Math.min(TREE_GROUP_SIZE, rowCount - root)
    visiblePrefix[group + 1] = visiblePrefix[group]!
      + visibleCountForGroup(root, length, isExpanded)
  }
  const visibleCount = visiblePrefix[groupCount] ?? 0

  return {
    visibleCount,
    logicalIndexAt(visibleIndex) {
      if (visibleCount === 0) return -1
      const target = Math.min(Math.max(0, visibleIndex), Math.max(0, visibleCount - 1))
      let low = 0
      let high = Math.max(0, groupCount - 1)
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (visiblePrefix[middle]! <= target) low = middle
        else high = middle - 1
      }
      const root = low * TREE_GROUP_SIZE
      const length = Math.min(TREE_GROUP_SIZE, rowCount - root)
      return logicalIndexInGroup(
        root,
        length,
        target - visiblePrefix[low]!,
        isExpanded,
      )
    },
    isExpanded,
  }
}

function visibleCountForGroup(
  root: number,
  length: number,
  isExpanded: (logicalIndex: number) => boolean,
): number {
  if (length <= 0) return 0
  if (!isExpanded(root)) return 1
  let visible = 1
  for (const branchPosition of TREE_BRANCH_POSITIONS) {
    if (branchPosition >= length) break
    visible += 1
    const childCount = branchChildCount(branchPosition, length)
    if (childCount > 0 && isExpanded(root + branchPosition)) visible += childCount
  }
  return visible
}

function logicalIndexInGroup(
  root: number,
  length: number,
  visibleIndex: number,
  isExpanded: (logicalIndex: number) => boolean,
): number {
  if (visibleIndex === 0) return root
  let cursor = 1
  for (const branchPosition of TREE_BRANCH_POSITIONS) {
    if (branchPosition >= length) break
    if (visibleIndex === cursor) return root + branchPosition
    cursor += 1
    const childCount = branchChildCount(branchPosition, length)
    if (childCount > 0 && isExpanded(root + branchPosition)) {
      if (visibleIndex < cursor + childCount) {
        return root + branchPosition + 1 + visibleIndex - cursor
      }
      cursor += childCount
    }
  }
  return root + length - 1
}

function isTreeNodeExpandable(logicalIndex: number, rowCount: number): boolean {
  if (logicalIndex < 0 || logicalIndex >= rowCount) return false
  const position = logicalIndex % TREE_GROUP_SIZE
  const groupLength = Math.min(TREE_GROUP_SIZE, rowCount - (logicalIndex - position))
  if (position === 0) return groupLength > 1
  return TREE_BRANCH_POSITIONS.includes(position as (typeof TREE_BRANCH_POSITIONS)[number])
    && branchChildCount(position, groupLength) > 0
}

function branchChildCount(branchPosition: number, groupLength: number): number {
  const nextBranch = TREE_BRANCH_POSITIONS.find((position) => position > branchPosition)
    ?? TREE_GROUP_SIZE
  return Math.max(0, Math.min(nextBranch, groupLength) - branchPosition - 1)
}

function branchPositionForLeaf(position: number): number {
  if (position < 7) return 1
  if (position < 13) return 7
  return 13
}

export function createDemoColumnGetter(
  scenario: StudioScenario,
  locale: Locale,
  options: DemoViewOptions = {},
) {
  const baseColumns = createScenarioColumns(scenario, locale, options)
  return (index: number): InsightColumn<DemoRow> => {
    const base = baseColumns[index]
    if (base) return base
    if (scenario === 'conditional') return createConditionalMetricColumn(index, locale)
    return createMetricColumn(index, baseColumns.length, locale)
  }
}

function createScenarioColumns(
  scenario: StudioScenario,
  locale: Locale,
  options: DemoViewOptions,
): InsightColumn<DemoRow>[] {
  if (scenario === 'conditional') return createConditionalColumns(locale)
  if (scenario === 'analysis' && options.treeEnabled) return createTreeColumns(locale)
  return createAnalysisColumns(locale)
}

function createAnalysisColumns(locale: Locale): InsightColumn<DemoRow>[] {
  const number = new Intl.NumberFormat(locale)
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'zh-CN' ? 'CNY' : 'USD',
    maximumFractionDigits: 0,
  })
  const statuses = localizedList(locale, STATUS_KEYS)
  const owners = OWNERS[locale]

  return [
    {
      id: 'dimension',
      header: <ColumnHeader label={translate(locale, 'demo.column.region')} sort />,
      headerText: translate(locale, 'demo.column.region'),
      getValue: (row) => localizedValue(locale, REGION_KEYS, Math.floor(row.index / REGION_GROUP_SIZE)),
      renderContent: ({ rowIndex, displayValue }) => {
        const regionIndex = Math.floor(rowIndex / REGION_GROUP_SIZE) % REGION_KEYS.length
        const markerStyle = {
          '--demo-region-color': ENTITY_COLORS[regionIndex],
        } as CSSProperties
        return (
          <span className="demo-entity-cell">
            <span
              className="demo-region-marker"
              data-region={regionIndex}
              style={markerStyle}
              aria-hidden="true"
            />
            <span>
              <strong>{displayValue}</strong>
              <small>{localizedValue(locale, CHANNEL_KEYS, Math.floor(rowIndex / REGION_GROUP_SIZE))}</small>
            </span>
          </span>
        )
      },
      visualStyle: { color: '#27332d', fontWeight: 600 },
    },
    {
      id: 'product',
      header: <ColumnHeader label={translate(locale, 'demo.column.product')} />,
      headerText: translate(locale, 'demo.column.product'),
      getValue: (row) => PRODUCTS[Math.floor(row.index / PRODUCT_GROUP_SIZE) % PRODUCTS.length],
      visualStyle: { color: '#59635d' },
    },
    {
      id: 'revenue',
      header: <ColumnHeader label={translate(locale, 'demo.column.revenue')} sort />,
      headerText: translate(locale, 'demo.column.revenue'),
      getValue: (row) => 42_000 + metricValue(row.index, 2) * 2.6,
      formatValue: (value) => currency.format(Math.round(Number(value))),
      renderContent: ({ displayValue, rowIndex }) => (
        <span className="demo-kpi-stack">
          <strong>{displayValue}</strong>
          <small>{translate(locale, 'demo.plan', { value: 82 + rowIndex % 19 })}</small>
        </span>
      ),
      visualStyle: { horizontalAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10 },
      conditionalRules: [
        {
          id: 'revenue-bar',
          kind: 'dataBar',
          domain: [0, 300_000],
          color: 'rgba(34, 139, 86, 0.17)',
        },
        {
          id: 'revenue-high',
          kind: 'text',
          when: { operator: 'greaterThan', value: 220_000 },
          style: { color: '#117346', fontWeight: 700 },
        },
      ],
    },
    {
      id: 'orders',
      header: <ColumnHeader label={translate(locale, 'demo.column.orders')} />,
      headerText: translate(locale, 'demo.column.orders'),
      getValue: (row) => 80 + Math.round(metricValue(row.index, 3) / 370),
      formatValue: (value) => number.format(Number(value)),
      visualStyle: numericStyle(),
    },
    createCompletionColumn(locale),
    createChangeColumn(locale),
    {
      id: 'status',
      header: <ColumnHeader label={translate(locale, 'demo.column.status')} />,
      headerText: translate(locale, 'demo.column.status'),
      getValue: (row) => statuses[(row.index * 5 + 2) % statuses.length],
      renderContent: ({ displayValue, rowIndex }) => (
        <span className={`demo-status demo-status--tone-${(rowIndex * 5 + 2) % 4}`}>
          {displayValue}
        </span>
      ),
    },
    {
      id: 'owner',
      header: <ColumnHeader label={translate(locale, 'demo.column.owner')} />,
      headerText: translate(locale, 'demo.column.owner'),
      getValue: (row) => owners[row.index % owners.length],
      image: (context) => ({
        src: AVATARS[context.rowIndex % AVATARS.length]!,
        alt: translate(locale, 'demo.avatar', { name: String(context.value) }),
        width: 22,
        height: 22,
      }),
      visualStyle: { color: '#3d4942', fontWeight: 600 },
    },
    createTrendColumn(locale),
    createUpdatedColumn(locale),
  ]
}

function createTreeColumns(locale: Locale): InsightColumn<DemoRow>[] {
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'zh-CN' ? 'CNY' : 'USD',
    maximumFractionDigits: 0,
  })
  const owners = OWNERS[locale]
  const statuses = localizedList(locale, STATUS_KEYS)
  return [
    {
      id: 'dimension',
      header: <ColumnHeader label={translate(locale, 'demo.column.tree')} />,
      headerText: translate(locale, 'demo.column.tree'),
      getValue: (row) => treeLabel(row.index, locale),
      renderContent: ({ row, displayValue }) => (
        <span className={`demo-tree-node demo-tree-node--depth-${treeDepth(row.index)}`}>
          <i>{treeNodeCode(row.index)}</i>
          <span>
            <strong>{displayValue}</strong>
            <small>{localizedValue(locale, CHANNEL_KEYS, row.index)}</small>
          </span>
        </span>
      ),
      visualStyle: { color: '#26342d' },
    },
    {
      id: 'node-type',
      header: <ColumnHeader label={translate(locale, 'demo.column.portfolio')} />,
      headerText: translate(locale, 'demo.column.portfolio'),
      getValue: (row) => treeDepth(row.index),
      formatValue: (value) => [
        translate(locale, 'demo.node.group'),
        translate(locale, 'demo.node.portfolio'),
        translate(locale, 'demo.node.workstream'),
      ][Number(value)] ?? translate(locale, 'demo.node.node'),
      renderContent: ({ displayValue, value }) => (
        <span className={`demo-node-type demo-node-type--${value}`}>{displayValue}</span>
      ),
    },
    {
      id: 'owner',
      header: <ColumnHeader label={translate(locale, 'demo.column.owner')} />,
      headerText: translate(locale, 'demo.column.owner'),
      getValue: (row) => owners[row.index % owners.length],
      image: (context) => ({
        src: AVATARS[context.row.index % AVATARS.length]!,
        alt: translate(locale, 'demo.avatar', { name: String(context.value) }),
        width: 22,
        height: 22,
      }),
      visualStyle: { fontWeight: 600 },
    },
    {
      id: 'actual',
      header: <ColumnHeader label={translate(locale, 'demo.column.revenue')} />,
      headerText: translate(locale, 'demo.column.revenue'),
      getValue: (row) => 65_000 + metricValue(row.index, 12) * 2,
      formatValue: (value) => currency.format(Number(value)),
      visualStyle: numericStyle(),
    },
    {
      id: 'budget',
      header: <ColumnHeader label={translate(locale, 'demo.column.budget')} />,
      headerText: translate(locale, 'demo.column.budget'),
      getValue: (row) => 80_000 + metricValue(row.index, 13) * 1.8,
      formatValue: (value) => currency.format(Number(value)),
      visualStyle: numericStyle(),
    },
    {
      id: 'variance',
      header: <ColumnHeader label={translate(locale, 'demo.column.change')} />,
      headerText: translate(locale, 'demo.column.change'),
      getValue: (row) => ((metricValue(row.index, 14) % 4000) - 1600) / 100,
      formatValue: signedPercent,
      visualStyle: numericStyle(),
      conditionalRules: signedIconRules(locale),
    },
    {
      id: 'contribution',
      header: <ColumnHeader label={translate(locale, 'demo.column.completion')} />,
      headerText: translate(locale, 'demo.column.completion'),
      getValue: (row) => (metricValue(row.index, 15) % 1000) / 10,
      formatValue: (value) => `${Number(value).toFixed(1)}%`,
      renderContent: ({ value, displayValue }) => (
        <span className="demo-contribution">
          <span><i style={{ width: `${Math.min(100, Number(value))}%` }} /></span>
          <strong>{displayValue}</strong>
        </span>
      ),
    },
    {
      id: 'state',
      header: <ColumnHeader label={translate(locale, 'demo.column.status')} />,
      headerText: translate(locale, 'demo.column.status'),
      getValue: (row) => statuses[(row.index + treeDepth(row.index)) % statuses.length],
      renderContent: ({ displayValue, row }) => (
        <span className={`demo-status demo-status--tone-${(row.index + treeDepth(row.index)) % 4}`}>
          {displayValue}
        </span>
      ),
    },
    createUpdatedColumn(locale),
  ]
}

function createConditionalColumns(locale: Locale): InsightColumn<DemoRow>[] {
  const statuses = localizedList(locale, STATUS_KEYS)
  return [
    {
      id: 'entity',
      header: <ConditionHeader label={translate(locale, 'demo.column.region')} detail={translate(locale, 'demo.rule.dimension')} />,
      headerText: translate(locale, 'demo.column.region'),
      getValue: (row) => localizedValue(locale, REGION_KEYS, row.index),
      renderContent: ({ rowIndex, displayValue }) => (
        <span className="demo-signal-entity">
          <i>{String(rowIndex + 1).padStart(2, '0')}</i>
          <strong>{displayValue}</strong>
        </span>
      ),
      visualStyle: { fontWeight: 650 },
    },
    {
      id: 'revenue-bar',
      header: <ConditionHeader label={translate(locale, 'demo.column.revenue')} detail={translate(locale, 'demo.rule.dataBar')} tone="green" />,
      headerText: translate(locale, 'demo.column.revenue'),
      getValue: (row) => metricValue(row.index, 21),
      formatValue: (value) => compactNumber(value, locale),
      visualStyle: numericStyle(),
      conditionalRules: [{
        id: 'signal-revenue-bar',
        kind: 'dataBar',
        domain: [0, 100_000],
        color: 'rgba(33, 153, 91, 0.32)',
      }],
    },
    {
      id: 'attainment-scale',
      header: <ConditionHeader label={translate(locale, 'demo.column.completion')} detail={translate(locale, 'demo.rule.colorScale')} tone="amber" />,
      headerText: translate(locale, 'demo.column.completion'),
      getValue: (row) => (metricValue(row.index, 22) % 8500) / 10_000 + 0.45,
      formatValue: (value) => `${(Number(value) * 100).toFixed(1)}%`,
      visualStyle: numericStyle(),
      conditionalRules: [{
        id: 'signal-attainment-scale',
        kind: 'colorScale',
        domain: [0.45, 1.3],
        colors: ['#f9d9d6', '#fff2c7', '#cfeedd'],
        midpoint: 0.9,
        target: 'background',
      }],
    },
    {
      id: 'variance-icon',
      header: <ConditionHeader label={translate(locale, 'demo.column.change')} detail={translate(locale, 'demo.rule.iconSet')} tone="red" />,
      headerText: translate(locale, 'demo.column.change'),
      getValue: (row) => ((metricValue(row.index, 23) % 5000) - 2000) / 100,
      formatValue: signedPercent,
      visualStyle: numericStyle(),
      conditionalRules: signedIconRules(locale),
    },
    {
      id: 'margin-text',
      header: <ConditionHeader label={translate(locale, 'demo.column.margin')} detail={translate(locale, 'demo.rule.text')} tone="blue" />,
      headerText: translate(locale, 'demo.column.margin'),
      getValue: (row) => (metricValue(row.index, 24) % 6200) / 100,
      formatValue: (value) => `${Number(value).toFixed(1)}%`,
      visualStyle: numericStyle(),
      conditionalRules: [
        {
          id: 'margin-low',
          kind: 'text',
          when: { operator: 'lessThan', value: 20 },
          style: { color: '#bb3e38', fontWeight: 750 },
        },
        {
          id: 'margin-high',
          kind: 'text',
          when: { operator: 'greaterThanOrEqual', value: 45 },
          style: { color: '#117346', fontWeight: 750 },
        },
      ],
    },
    {
      id: 'risk-background',
      header: <ConditionHeader label={translate(locale, 'demo.column.risk')} detail={translate(locale, 'demo.rule.background')} tone="red" />,
      headerText: translate(locale, 'demo.column.risk'),
      getValue: (row) => statuses[(row.index * 3 + 1) % statuses.length],
      renderContent: ({ displayValue, rowIndex }) => (
        <span className={`demo-status demo-status--tone-${(rowIndex * 3 + 1) % 4}`}>{displayValue}</span>
      ),
      conditionalRules: [
        {
          id: 'risk-background',
          kind: 'background',
          when: { operator: 'equals', value: statuses[3] },
          color: '#fde7e5',
        },
        {
          id: 'healthy-background',
          kind: 'background',
          when: { operator: 'equals', value: statuses[1] },
          color: '#e2f5e9',
        },
      ],
    },
    {
      id: 'sla-bar',
      header: <ConditionHeader label={translate(locale, 'demo.column.sla')} detail={translate(locale, 'demo.rule.signedBar')} tone="blue" />,
      headerText: translate(locale, 'demo.column.sla'),
      getValue: (row) => ((metricValue(row.index, 25) % 2000) - 1000) / 10,
      formatValue: signedPercent,
      visualStyle: numericStyle(),
      conditionalRules: [{
        id: 'sla-signed-bar',
        kind: 'dataBar',
        domain: [-100, 100],
        axis: 0,
        color: '#2d9b62',
        negativeColor: '#d45750',
      }],
    },
    {
      id: 'quality-icon',
      header: <ConditionHeader label={translate(locale, 'demo.column.quality')} detail={translate(locale, 'demo.rule.thresholds')} tone="green" />,
      headerText: translate(locale, 'demo.column.quality'),
      getValue: (row) => metricValue(row.index, 26) % 101,
      formatValue: (value) => `${value}/100`,
      visualStyle: numericStyle(),
      conditionalRules: [
        {
          id: 'quality-good',
          kind: 'icon',
          when: { operator: 'greaterThanOrEqual', value: 80 },
          icon: { name: 'check', color: '#168653', label: translate(locale, 'demo.quality.good'), position: 'trailing' },
        },
        {
          id: 'quality-warning',
          kind: 'icon',
          when: { operator: 'lessThan', value: 50 },
          icon: { name: 'warning', color: '#cc5c46', label: translate(locale, 'demo.quality.warning'), position: 'trailing' },
        },
      ],
    },
    {
      id: 'rule-legend',
      header: <ConditionHeader label={translate(locale, 'demo.column.rules')} detail={translate(locale, 'demo.rule.layeredDom')} />,
      headerText: translate(locale, 'demo.column.rules'),
      getValue: (row) => row.index,
      renderContent: ({ rowIndex }) => (
        <span className="demo-rule-legend">
          <i className="is-scale" />
          <i className={rowIndex % 2 ? 'is-positive' : 'is-negative'} />
          <small>{translate(locale, 'demo.rule.count', { count: 3 + rowIndex % 5 })}</small>
        </span>
      ),
    },
  ]
}

function createCompletionColumn(locale: Locale): InsightColumn<DemoRow> {
  return {
    id: 'completion',
    header: <ColumnHeader label={translate(locale, 'demo.column.completion')} sort />,
    headerText: translate(locale, 'demo.column.completion'),
    getValue: (row) => 0.54 + (metricValue(row.index, 4) % 6900) / 10_000,
    formatValue: (value) => `${(Number(value) * 100).toFixed(1)}%`,
    visualStyle: { horizontalAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 650 },
    conditionalRules: [
      {
        id: 'completion-scale',
        kind: 'colorScale',
        domain: [0.5, 1.25],
        colors: ['#fdeceb', '#fff8e5', '#dff4e8'],
        midpoint: 0.9,
        target: 'background',
      },
      {
        id: 'completion-text',
        kind: 'text',
        when: { operator: 'greaterThanOrEqual', value: 1 },
        style: { color: '#137448', fontWeight: 700 },
      },
    ],
  }
}

function createChangeColumn(locale: Locale): InsightColumn<DemoRow> {
  return {
    id: 'change',
    header: <ColumnHeader label={translate(locale, 'demo.column.change')} />,
    headerText: translate(locale, 'demo.column.change'),
    getValue: (row) => ((metricValue(row.index, 5) % 4400) - 1500) / 100,
    formatValue: signedPercent,
    visualStyle: numericStyle(),
    conditionalRules: signedIconRules(locale),
  }
}

function createTrendColumn(locale: Locale): InsightColumn<DemoRow> {
  return {
    id: 'trend',
    header: <ColumnHeader label={translate(locale, 'demo.column.trend')} />,
    headerText: translate(locale, 'demo.column.trend'),
    getValue: (row) => metricValue(row.index, 8),
    renderContent: ({ rowIndex, displayValue }) => (
      <span className="demo-mini-chart" aria-label={translate(locale, 'demo.trend', { value: displayValue })}>
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index} style={{ height: `${4 + (metricValue(rowIndex, index + 18) % 16)}px` }} />
        ))}
      </span>
    ),
  }
}

function createUpdatedColumn(locale: Locale): InsightColumn<DemoRow> {
  return {
    id: 'updated',
    header: <ColumnHeader label={translate(locale, 'demo.column.updated')} />,
    headerText: translate(locale, 'demo.column.updated'),
    getValue: (row) => `2026-07-${String((row.index % 9) + 1).padStart(2, '0')}  ${String(8 + row.index % 10).padStart(2, '0')}:30`,
    visualStyle: { color: '#7a847e', fontFamily: 'var(--font-mono)', fontSize: 9 },
  }
}

function createMetricColumn(index: number, baseCount: number, locale: Locale): InsightColumn<DemoRow> {
  const metricIndex = index - baseCount + 1
  return {
    id: `metric-${metricIndex}`,
    header: <ColumnHeader label={translate(locale, 'demo.column.metric', { index: String(metricIndex).padStart(4, '0') })} />,
    headerText: translate(locale, 'demo.column.metric', { index: metricIndex }),
    getValue: (row) => metricValue(row.index, index),
    formatValue: (value) => Number(value).toLocaleString(locale),
    visualStyle: numericStyle(),
    conditionalRules: metricIndex % 7 === 0 ? [{
      id: `scale-${metricIndex}`,
      kind: 'colorScale',
      domain: [0, 100_000],
      colors: ['#fff', '#e4f6ec', '#9edbb9'],
      target: 'background',
    }] : undefined,
  }
}

function createConditionalMetricColumn(index: number, locale: Locale): InsightColumn<DemoRow> {
  const tone = index % 3
  return {
    id: `signal-${index}`,
    header: <ConditionHeader
      label={translate(locale, 'demo.column.metric', { index })}
      detail={translate(locale, tone === 0 ? 'demo.rule.colorScale' : tone === 1 ? 'demo.rule.dataBar' : 'demo.rule.text')}
    />,
    headerText: translate(locale, 'demo.column.metric', { index }),
    getValue: (row) => metricValue(row.index, index),
    formatValue: (value) => compactNumber(value, locale),
    visualStyle: numericStyle(),
    conditionalRules: tone === 0
      ? [{
          id: `metric-scale-${index}`,
          kind: 'colorScale',
          domain: [0, 100_000],
          colors: ['#f7dddd', '#fff1c7', '#cfeeda'],
          midpoint: 50_000,
          target: 'background',
        }]
      : tone === 1
        ? [{
            id: `metric-bar-${index}`,
            kind: 'dataBar',
            domain: [0, 100_000],
            color: 'rgba(35, 142, 87, 0.28)',
          }]
        : [{
            id: `metric-text-${index}`,
            kind: 'text',
            when: { operator: 'greaterThanOrEqual', value: 75_000 },
            style: { color: '#117346', fontWeight: 750 },
          }],
  }
}

function ColumnHeader({ label, sort = false }: { label: string; sort?: boolean }): ReactNode {
  return (
    <span className="demo-column-header">
      <span>{label}</span>
      {sort ? <i aria-hidden="true">↓</i> : null}
    </span>
  )
}

function ConditionHeader({
  label,
  detail,
  tone = 'neutral',
}: {
  label: string
  detail: string
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
}): ReactNode {
  return (
    <span className="demo-condition-header">
      <i className={`is-${tone}`} />
      <span><strong>{label}</strong><small>{detail}</small></span>
    </span>
  )
}

function signedIconRules(locale: Locale) {
  return [
    {
      id: 'positive-icon',
      kind: 'icon' as const,
      when: { operator: 'greaterThanOrEqual' as const, value: 0 },
      icon: {
        name: 'up',
        color: '#159056',
        size: 13,
        position: 'trailing' as const,
        label: translate(locale, 'demo.growth'),
      },
    },
    {
      id: 'positive-text',
      kind: 'text' as const,
      when: { operator: 'greaterThanOrEqual' as const, value: 0 },
      style: { color: '#17794b' },
    },
    {
      id: 'negative-icon',
      kind: 'icon' as const,
      when: { operator: 'lessThan' as const, value: 0 },
      icon: {
        name: 'down',
        color: '#c0524d',
        size: 13,
        position: 'trailing' as const,
        label: translate(locale, 'demo.decline'),
      },
    },
    {
      id: 'negative-text',
      kind: 'text' as const,
      when: { operator: 'lessThan' as const, value: 0 },
      style: { color: '#b84c47' },
    },
  ]
}

function treeLabel(index: number, locale: Locale): string {
  const depth = treeDepth(index)
  if (depth === 0) return localizedValue(locale, REGION_KEYS, Math.floor(index / TREE_GROUP_SIZE))
  if (depth === 1) return `${localizedValue(locale, CHANNEL_KEYS, index)} · ${PRODUCTS[index % PRODUCTS.length]}`
  return `${PRODUCTS[index % PRODUCTS.length]} / ${String(index + 1).padStart(4, '0')}`
}

function treeDepth(index: number): number {
  const position = index % TREE_GROUP_SIZE
  return position === 0 ? 0 : position % 6 === 1 ? 1 : 2
}

function treeNodeCode(index: number): string {
  const depth = treeDepth(index)
  return depth === 0 ? 'G' : depth === 1 ? 'P' : 'W'
}

function numericStyle() {
  return {
    horizontalAlign: 'right' as const,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  }
}

function localizedList(locale: Locale, keys: readonly MessageKey[]): string[] {
  return keys.map((key) => translate(locale, key))
}

function localizedValue(locale: Locale, keys: readonly MessageKey[], index: number): string {
  return translate(locale, keys[index % keys.length]!)
}

function signedPercent(value: unknown): string {
  const number = Number(value)
  return `${number >= 0 ? '+' : ''}${number.toFixed(1)}%`
}

function compactNumber(value: unknown, locale: Locale): string {
  return Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
}

const ENTITY_COLORS = ['#31926a', '#d4933e', '#5f78b8', '#aa6aa5', '#4a8ea3', '#9a6b4a']

function metricValue(row: number, column: number): number {
  let value = (Math.imul(row + 1, 1_103_515_245) + Math.imul(column + 11, 12_345)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 2_246_822_519) >>> 0
  value ^= value >>> 13
  return (value >>> 0) % 100_001
}

function emptyRowMeta(): RowMeta {
  return {
    id: 0,
    depth: 0,
    parentId: undefined,
    expandable: false,
    expanded: false,
    loading: false,
    error: undefined,
  }
}

function trimCache<TKey, TValue>(cache: Map<TKey, TValue>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as TKey | undefined
    if (oldest === undefined) return
    cache.delete(oldest)
  }
}

function svgAvatar(label: string, background: string, foreground: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="${background}"/><text x="24" y="29" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="${foreground}">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
