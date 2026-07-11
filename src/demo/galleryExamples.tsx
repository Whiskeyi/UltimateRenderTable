import {
  ClipboardCopy,
  MousePointer2,
} from 'lucide-react'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  UltiGridViewport,
  type CellRange,
  type MergedCellRange,
  type UltiGridViewportApi,
} from '@ultigrid/core'
import {
  TreeRowModel,
  UltiGridInsight,
  defineInsightColumn,
  type InsightCellComponentProps,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import type { Locale, MessageKey, Translate } from '../i18n'
import type { DemoSnippetKey } from './demoSnippets'

interface GalleryExampleProps {
  locale: Locale
  t: Translate
}

type GalleryExampleComponent = (props: GalleryExampleProps) => ReactElement

export type GalleryExampleId =
  | 'virtualization'
  | 'frozen'
  | 'sizing'
  | 'merging'
  | 'selection'
  | 'renderer'
  | 'tree'
  | 'conditional'

export interface GalleryExampleDefinition {
  id: GalleryExampleId
  packageName: '@ultigrid/core' | '@ultigrid/insight'
  titleKey: MessageKey
  detailKey: MessageKey
  hintKey: MessageKey
  sourceKey: DemoSnippetKey
  component: GalleryExampleComponent
}

export const GALLERY_EXAMPLES: readonly GalleryExampleDefinition[] = [
  {
    id: 'virtualization',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.virtualization.title',
    detailKey: 'gallery.virtualization.detail',
    hintKey: 'gallery.virtualization.hint',
    sourceKey: 'virtualization',
    component: VirtualizationExample,
  },
  {
    id: 'frozen',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.frozen.title',
    detailKey: 'gallery.frozen.detail',
    hintKey: 'gallery.frozen.hint',
    sourceKey: 'frozen',
    component: FrozenExample,
  },
  {
    id: 'sizing',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.sizing.title',
    detailKey: 'gallery.sizing.detail',
    hintKey: 'gallery.sizing.hint',
    sourceKey: 'sizing',
    component: SizingExample,
  },
  {
    id: 'merging',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.merging.title',
    detailKey: 'gallery.merging.detail',
    hintKey: 'gallery.merging.hint',
    sourceKey: 'mergeAdjacent',
    component: MergingExample,
  },
  {
    id: 'selection',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.selection.title',
    detailKey: 'gallery.selection.detail',
    hintKey: 'gallery.selection.hint',
    sourceKey: 'selection',
    component: SelectionExample,
  },
  {
    id: 'renderer',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.renderer.title',
    detailKey: 'gallery.renderer.detail',
    hintKey: 'gallery.renderer.hint',
    sourceKey: 'renderer',
    component: RendererExample,
  },
  {
    id: 'tree',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.tree.title',
    detailKey: 'gallery.tree.detail',
    hintKey: 'gallery.tree.hint',
    sourceKey: 'tree',
    component: TreeExample,
  },
  {
    id: 'conditional',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.conditional.title',
    detailKey: 'gallery.conditional.detail',
    hintKey: 'gallery.conditional.hint',
    sourceKey: 'conditionalMini',
    component: ConditionalExample,
  },
]

function VirtualizationExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number) => ({
    value: row * 100_000 + column,
    text: `${row.toLocaleString()} : ${column.toLocaleString()}`,
  }), [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      defaultRowHeight={34}
      defaultColumnWidth={128}
      overscan={{ rows: 5, columns: 2 }}
      fitColumns="none"
      ariaLabel={t('gallery.virtualization.title')}
      style={{ height: '100%' }}
    />
  )
}

function FrozenExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number) => ({
    text: `${row + 1} / ${column + 1}`,
    style: row === 0 || row === 199 || column === 0 || column === 59
      ? { backgroundColor: '#edf6f0', color: '#176f49', fontWeight: 700 }
      : undefined,
  }), [])

  return (
    <UltiGridViewport
      rowCount={200}
      columnCount={60}
      getCell={getCell}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      defaultColumnWidth={116}
      ariaLabel={t('gallery.frozen.title')}
      style={{ height: '100%' }}
    />
  )
}

const GALLERY_ROW_HEIGHTS = new Map<number, number>([
  [1, 62],
  [4, 54],
  [7, 70],
])

const GALLERY_COLUMN_WIDTHS = new Map<number, number>([
  [0, 210],
  [1, 164],
  [3, 96],
])

function SizingExample({ t }: GalleryExampleProps) {
  const getCell = useCallback((row: number, column: number) => ({
    text: column === 0
      ? `${t('gallery.sizing.dimension', { index: Math.floor(row / 3) + 1 })}\n${t('gallery.sizing.measured')}`
      : t('gallery.sizing.cell', { row: row + 1, column: column + 1 }),
    style: column === 0 ? { whiteSpace: 'normal', lineHeight: 1.35 } : undefined,
  }), [t])

  return (
    <UltiGridViewport
      rowCount={80}
      columnCount={8}
      getCell={getCell}
      rowHeights={GALLERY_ROW_HEIGHTS}
      columnWidths={GALLERY_COLUMN_WIDTHS}
      autoSize={{ rows: true, columns: false }}
      fitColumns="stretch"
      ariaLabel={t('gallery.sizing.title')}
      style={{ height: '100%' }}
    />
  )
}

interface MergeRow {
  id: number
  region: 'east' | 'south' | 'north'
  product: 'cloud' | 'data' | 'ai'
  revenue: number
  orders: number
  margin: number
}

const MERGE_REGIONS = ['east', 'south', 'north'] as const
const MERGE_PRODUCTS = ['cloud', 'data', 'ai'] as const

const MERGE_ROWS: readonly MergeRow[] = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  region: MERGE_REGIONS[Math.floor(index / 6)]!,
  product: MERGE_PRODUCTS[Math.floor(index / 2) % 3]!,
  revenue: 86_000 + index * 7_400,
  orders: 120 + index * 9,
  margin: 18 + index % 7,
}))

const MERGE_EXPLICIT: readonly MergedCellRange[] = [{
  id: 'gallery-horizontal-summary',
  rowStart: 0,
  rowEnd: 0,
  columnStart: 2,
  columnEnd: 4,
}]

function MergingExample({ locale, t }: GalleryExampleProps) {
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const columns = useMemo<readonly InsightColumnDefinition<MergeRow>[]>(() => [
    defineInsightColumn<MergeRow, MergeRow['region']>({
      id: 'region',
      header: t('gallery.merging.region'),
      headerText: t('gallery.merging.region'),
      width: 128,
      getValue: (row) => row.region,
      formatValue: (value) => t(`gallery.merging.${value}`),
      visualStyle: { fontWeight: 700, verticalAlign: 'middle' },
    }),
    defineInsightColumn<MergeRow, MergeRow['product']>({
      id: 'product',
      header: t('gallery.merging.product'),
      headerText: t('gallery.merging.product'),
      width: 132,
      getValue: (row) => row.product,
      formatValue: (value) => t(`gallery.merging.${value}`),
      visualStyle: { color: '#526058', verticalAlign: 'middle' },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'revenue',
      header: t('gallery.merging.revenue'),
      headerText: t('gallery.merging.revenue'),
      getValue: (row) => row.revenue,
      formatValue: (value) => number.format(value),
      renderContent: ({ displayValue, row, rowIndex }) => rowIndex === 0 ? (
        <span className="component-gallery__merge-summary">
          <strong>{t('gallery.merging.summary')}</strong>
          <small>
            {displayValue} · {number.format(row.orders)} {t('gallery.merging.orders')} · {row.margin}%
          </small>
        </span>
      ) : displayValue,
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'orders',
      header: t('gallery.merging.orders'),
      headerText: t('gallery.merging.orders'),
      getValue: (row) => row.orders,
      formatValue: (value) => number.format(value),
      visualStyle: { horizontalAlign: 'right' },
    }),
    defineInsightColumn<MergeRow, number>({
      id: 'margin',
      header: t('gallery.merging.margin'),
      headerText: t('gallery.merging.margin'),
      getValue: (row) => row.margin,
      formatValue: (value) => `${value}%`,
      visualStyle: { horizontalAlign: 'right' },
    }),
  ], [number, t])

  return (
    <UltiGridInsight
      rows={MERGE_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      mergeAdjacent={{ columns: [0, 1] }}
      mergedCells={MERGE_EXPLICIT}
      frozen={{ left: 1 }}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.merging.title')}
      style={{ height: '100%' }}
    />
  )
}

function SelectionExample({ t }: GalleryExampleProps) {
  const apiRef = useRef<UltiGridViewportApi | null>(null)
  const [selection, setSelection] = useState<CellRange | null>({
    rowStart: 1,
    rowEnd: 3,
    columnStart: 1,
    columnEnd: 3,
  })
  const [copiedRows, setCopiedRows] = useState<number | null>(null)
  const getCell = useCallback((row: number, column: number) => ({
    text: t('gallery.selection.value', { row: row + 1, column: column + 1 }),
  }), [t])

  const copy = useCallback(async () => {
    const value = await apiRef.current?.copySelection()
    setCopiedRows(value ? value.split(/\r?\n/).length : null)
  }, [])

  return (
    <div className="component-gallery__example-stack">
      <div className="component-gallery__example-toolbar">
        <span><MousePointer2 size={14} /> {t('gallery.selection.toolbar')}</span>
        <button type="button" onClick={() => void copy()}>
          <ClipboardCopy size={14} /> {copiedRows === null
            ? t('gallery.selection.tsv')
            : t('gallery.selection.rows', { count: copiedRows })}
        </button>
      </div>
      <div className="component-gallery__example-grid">
        <UltiGridViewport
          rowCount={200}
          columnCount={50}
          getCell={getCell}
          selection={selection}
          onSelectionChange={setSelection}
          apiRef={apiRef}
          defaultColumnWidth={132}
          ariaLabel={t('gallery.selection.title')}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

interface RendererRow {
  id: number
  owner: string
  team: 'growth' | 'platform' | 'commerce' | 'data' | 'ai' | 'cloud'
  score: number
  status: 'healthy' | 'watch' | 'risk'
}

const RENDERER_ROWS: readonly RendererRow[] = [
  { id: 1, owner: 'Avery', team: 'growth', score: 92, status: 'healthy' },
  { id: 2, owner: 'Blake', team: 'platform', score: 76, status: 'watch' },
  { id: 3, owner: 'Casey', team: 'commerce', score: 64, status: 'risk' },
  { id: 4, owner: 'Devon', team: 'data', score: 87, status: 'healthy' },
  { id: 5, owner: 'Emery', team: 'ai', score: 71, status: 'watch' },
  { id: 6, owner: 'Flynn', team: 'cloud', score: 96, status: 'healthy' },
]

function GalleryStatusCell({ displayValue, value }: InsightCellComponentProps<RendererRow, RendererRow['status']>) {
  return <span className={`component-gallery__status component-gallery__status--${value}`}>{displayValue}</span>
}

function RendererExample({ locale, t }: GalleryExampleProps) {
  const columns = useMemo<readonly InsightColumnDefinition<RendererRow>[]>(() => [
    defineInsightColumn<RendererRow, string>({
      id: 'owner',
      header: t('gallery.renderer.owner'),
      headerText: t('gallery.renderer.owner'),
      width: 168,
      getValue: (row) => row.owner,
      image: ({ rowIndex }) => ({
        src: avatarData(RENDERER_ROWS[rowIndex]?.owner.slice(0, 1) ?? '?', rowIndex),
        alt: '',
        width: 24,
        height: 24,
      }),
      visualStyle: { fontWeight: 700 },
    }),
    defineInsightColumn<RendererRow, RendererRow['team']>({
      id: 'team',
      header: t('gallery.renderer.team'),
      headerText: t('gallery.renderer.team'),
      getValue: (row) => row.team,
      formatValue: (value) => t(`gallery.renderer.team.${value}`),
      visualStyle: { color: '#667169', fontSize: 13 },
    }),
    defineInsightColumn<RendererRow, number>({
      id: 'score',
      header: t('gallery.renderer.score'),
      headerText: t('gallery.renderer.score'),
      getValue: (row) => row.score,
      formatValue: (value) => Intl.NumberFormat(locale).format(value),
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
      conditionalRules: [{
        id: 'gallery-score-bar',
        kind: 'dataBar',
        domain: [0, 100],
        color: 'rgba(36, 147, 95, 0.2)',
      }],
    }),
    defineInsightColumn<RendererRow, RendererRow['status']>({
      id: 'status',
      header: t('gallery.renderer.status'),
      headerText: t('gallery.renderer.status'),
      getValue: (row) => row.status,
      formatValue: (value) => t(`gallery.renderer.status.${value}`),
      component: GalleryStatusCell,
      visualStyle: { horizontalAlign: 'center' },
    }),
  ], [locale, t])

  return (
    <UltiGridInsight
      rows={RENDERER_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      fitColumns="stretch"
      stripedRows
      ariaLabel={t('gallery.renderer.title')}
      style={{ height: '100%' }}
    />
  )
}

interface GalleryTreeRow {
  id: string
  labelKey: MessageKey
  value: number
  children?: readonly GalleryTreeRow[]
}

const TREE_ROOTS: readonly GalleryTreeRow[] = [
  {
    id: 'commercial',
    labelKey: 'gallery.tree.commercial',
    value: 284,
    children: [
      { id: 'direct', labelKey: 'gallery.tree.direct', value: 168 },
      { id: 'partners', labelKey: 'gallery.tree.partners', value: 116 },
    ],
  },
  {
    id: 'product',
    labelKey: 'gallery.tree.product',
    value: 231,
    children: [
      { id: 'cloud', labelKey: 'gallery.tree.cloud', value: 142 },
      { id: 'data', labelKey: 'gallery.tree.data', value: 89 },
    ],
  },
]

function TreeExample({ locale, t }: GalleryExampleProps) {
  const model = useMemo(() => new TreeRowModel(TREE_ROOTS, {
    getRowId: (row) => row.id,
    hasChildren: (row) => Boolean(row.children?.length),
    getChildren: (row) => row.children,
    defaultExpanded: (_row, depth) => depth === 0,
  }), [])
  const columns = useMemo<readonly InsightColumnDefinition<GalleryTreeRow>[]>(() => [
    defineInsightColumn<GalleryTreeRow, string>({
      id: 'name',
      header: t('gallery.tree.dimension'),
      headerText: t('gallery.tree.dimension'),
      width: 248,
      getValue: (row) => t(row.labelKey),
      visualStyle: { fontWeight: 650 },
    }),
    defineInsightColumn<GalleryTreeRow, number>({
      id: 'value',
      header: t('gallery.tree.value'),
      headerText: t('gallery.tree.value'),
      getValue: (row) => row.value,
      formatValue: (value) => Intl.NumberFormat(locale).format(value),
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    }),
  ], [locale, t])

  return (
    <UltiGridInsight
      rowModel={model}
      columns={columns}
      treeColumnId="name"
      onToggleRow={(rowId) => { void model.toggle(rowId) }}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.tree.title')}
      style={{ height: '100%' }}
    />
  )
}

interface ConditionalRow {
  id: number
  entity: number
  revenue: number
  score: number
  variance: number
  risk: number
}

const CONDITIONAL_ROWS: readonly ConditionalRow[] = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  entity: index + 1,
  revenue: 48 + (index * 17) % 100,
  score: 42 + (index * 11) % 59,
  variance: -18 + (index * 7) % 38,
  risk: (index * 13) % 100,
}))

function ConditionalExample({ t }: GalleryExampleProps) {
  const columns = useMemo<readonly InsightColumnDefinition<ConditionalRow>[]>(() => [
    defineInsightColumn<ConditionalRow, number>({
      id: 'entity',
      header: t('gallery.conditional.entity'),
      headerText: t('gallery.conditional.entity'),
      getValue: (row) => row.entity,
      formatValue: (value) => t('gallery.conditional.unit', {
        index: String(value).padStart(2, '0'),
      }),
      visualStyle: { fontWeight: 700 },
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'revenue',
      header: t('gallery.conditional.bar'),
      headerText: t('gallery.conditional.bar'),
      getValue: (row) => row.revenue,
      conditionalRules: [{
        id: 'gallery-data-bar',
        kind: 'dataBar',
        domain: [0, 150],
        color: 'rgba(36, 147, 95, 0.24)',
      }],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'score',
      header: t('gallery.conditional.scale'),
      headerText: t('gallery.conditional.scale'),
      getValue: (row) => row.score,
      conditionalRules: [{
        id: 'gallery-color-scale',
        kind: 'colorScale',
        domain: [0, 100],
        midpoint: 60,
        colors: ['#f8dedb', '#fff4d0', '#dff2e7'],
      }],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'variance',
      header: t('gallery.conditional.icon'),
      headerText: t('gallery.conditional.icon'),
      getValue: (row) => row.variance,
      formatValue: (value) => `${value > 0 ? '+' : ''}${value}%`,
      conditionalRules: [
        { id: 'gallery-up', kind: 'icon', when: { operator: 'greaterThanOrEqual', value: 5 }, icon: { name: 'up', color: '#168052' } },
        { id: 'gallery-down', kind: 'icon', when: { operator: 'lessThan', value: 0 }, icon: { name: 'down', color: '#b64d46' } },
      ],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'risk',
      header: t('gallery.conditional.rule'),
      headerText: t('gallery.conditional.rule'),
      getValue: (row) => row.risk,
      conditionalRules: [
        { id: 'gallery-risk-bg', kind: 'background', when: { operator: 'greaterThan', value: 72 }, color: '#fff0ed' },
        { id: 'gallery-risk-text', kind: 'text', when: { operator: 'greaterThan', value: 72 }, style: { color: '#a7443e', fontWeight: 800 } },
      ],
    }),
  ], [t])

  return (
    <UltiGridInsight
      rows={CONDITIONAL_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.conditional.title')}
      style={{ height: '100%' }}
    />
  )
}

function avatarData(label: string, index: number): string {
  const palette = [
    ['#dff3e7', '#176f49'],
    ['#f8ead8', '#8a5a1b'],
    ['#e5ebf7', '#405c92'],
  ] as const
  const [background, foreground] = palette[index % palette.length]!
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="${background}"/><text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="${foreground}">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
