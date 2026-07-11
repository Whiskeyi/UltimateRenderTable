import type { StudioScenario } from '../studio'

export const demoSnippets = {
  gallery: String.raw`import { UltiGridViewport } from '@ultigrid/core'
import { UltiGridInsight } from '@ultigrid/insight'

const examples = [
  { id: 'virtualization', component: UltiGridViewport },
  { id: 'business-grid', component: UltiGridInsight },
]

export function ComponentGallery() {
  return examples.map(({ id, component: Example }) => (
    <section key={id}><Example /></section>
  ))
}`,

  analysis: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

export function BusinessAnalysis({
  treeEnabled,
  mergeSameValueDimensions,
}) {
  return (
    <UltiGridInsight
      rowSource={treeEnabled ? treeRows : flatRows}
      columns={columns}
      treeColumnId={treeEnabled ? 'region' : undefined}
      mergeAdjacent={mergeSameValueDimensions
        ? { columns: [0, 1] }
        : false}
      frozen={{ top: 1, left: 2 }}
      stripedRows
      style={{ height: 560 }}
    />
  )
}`,

  conditional: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

const columns = [{
  id: 'revenue',
  header: 'Revenue',
  getValue: (row) => row.revenue,
  conditionalRules: [
    { id: 'bar', kind: 'dataBar', domain: [0, 300000], color: '#24935f' },
    { id: 'high', kind: 'text', when: { operator: 'greaterThan', value: 220000 },
      style: { color: '#126b44', fontWeight: 700 } },
  ],
}]

export function ConditionalTable({ rows }) {
  return <UltiGridInsight rows={rows} columns={columns} />
}`,

  virtualization: String.raw`import { UltiGridViewport } from '@ultigrid/core'

export function LogicalGrid() {
  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={(row, column) => ({ text: row + ':' + column })}
      overscan={{ rows: 5, columns: 2 }}
      style={{ height: 420 }}
    />
  )
}`,

  frozen: String.raw`import { UltiGridViewport } from '@ultigrid/core'

export function FourSideFrozenGrid() {
  return (
    <UltiGridViewport
      rowCount={200}
      columnCount={60}
      getCell={(row, column) => ({ text: row + ':' + column })}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      style={{ height: 420 }}
    />
  )
}`,

  sizing: String.raw`import { UltiGridViewport } from '@ultigrid/core'

const rowHeights = new Map([[1, 64], [4, 52]])
const columnWidths = new Map([[0, 220], [2, 96]])

export function AdaptiveGeometryGrid() {
  return (
    <UltiGridViewport
      rowCount={80}
      columnCount={8}
      getCell={(row, column) => ({ text: 'Cell ' + row + ':' + column })}
      rowHeights={rowHeights}
      columnWidths={columnWidths}
      autoSize={{ rows: true, columns: false }}
      fitColumns="stretch"
    />
  )
}`,

  mergeAdjacent: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

const columns = [
  { id: 'region', header: 'Region', getValue: (row) => row.region },
  { id: 'product', header: 'Product', getValue: (row) => row.product },
  {
    id: 'revenue',
    header: 'Revenue',
    getValue: (row) => row.revenue,
    renderContent: ({ displayValue, row, rowIndex }) => rowIndex === 0
      ? <strong>{displayValue} · {row.orders} orders · {row.margin}%</strong>
      : displayValue,
  },
  { id: 'orders', header: 'Orders', getValue: (row) => row.orders },
  { id: 'margin', header: 'Margin', getValue: (row) => row.margin },
]

export function DimensionMergeTable({ rows }) {
  return (
    <UltiGridInsight
      rows={rows}
      columns={columns}
      mergeAdjacent={{ columns: [0, 1] }}
      mergedCells={[{
        id: 'horizontal-note', rowStart: 0, rowEnd: 0,
        columnStart: 2, columnEnd: 4,
      }]}
    />
  )
}`,

  selection: String.raw`import { useRef, useState } from 'react'
import { UltiGridViewport } from '@ultigrid/core'

export function SelectionGrid() {
  const apiRef = useRef(null)
  const [selection, setSelection] = useState(null)
  return (
    <>
      <button onClick={() => apiRef.current?.copySelection()}>Copy TSV</button>
      <UltiGridViewport
        rowCount={200}
        columnCount={50}
        getCell={(row, column) => ({ text: row + ':' + column })}
        selection={selection}
        onSelectionChange={setSelection}
        apiRef={apiRef}
      />
    </>
  )
}`,

  renderer: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

function StatusCell({ displayValue }) {
  return <strong className="status-pill">{displayValue}</strong>
}

const columns = [{
  id: 'owner',
  header: 'Owner',
  getValue: (row) => row.owner,
  image: (context) => ({ src: context.row.avatar, width: 24, height: 24 }),
}, {
  id: 'status',
  header: 'Status',
  getValue: (row) => row.status,
  component: StatusCell,
  visualStyle: { horizontalAlign: 'center', color: '#176f49' },
}]

export function CustomCellTable({ rows }) {
  return <UltiGridInsight rows={rows} columns={columns} />
}`,

  tree: String.raw`import { useMemo } from 'react'
import { TreeRowModel, UltiGridInsight } from '@ultigrid/insight'

type Node = { id: string; label: string; children?: Node[] }

const roots: Node[] = [{
  id: 'root', label: 'Root', children: [{
    id: 'branch', label: 'Branch', children: [
      { id: 'leaf', label: 'Leaf' },
    ],
  }],
}]

export function TreeTable() {
  const model = useMemo(() => new TreeRowModel(roots, {
    getRowId: (row) => row.id,
    hasChildren: (row) => Boolean(row.children?.length),
    getChildren: (row) => row.children,
    defaultExpanded: (_row, depth) => depth < 2,
  }), [])
  return (
    <UltiGridInsight
      rowModel={model}
      columns={[{ id: 'name', header: 'Name', getValue: (row) => row.label }]}
      treeColumnId="name"
      onToggleRow={(rowId) => { void model.toggle(rowId) }}
      ariaLabel="Hierarchy table"
    />
  )
}`,

  conditionalMini: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

const columns = [{
  id: 'score',
  header: 'Score',
  getValue: (row) => row.score,
  conditionalRules: [
    { id: 'scale', kind: 'colorScale', domain: [0, 100], midpoint: 50,
      colors: ['#f8d7d4', '#fff5d6', '#dff3e7'] },
    { id: 'icon', kind: 'icon', when: { operator: 'greaterThanOrEqual', value: 85 },
      icon: { name: 'up', color: '#168052' } },
  ],
}]

export function SignalTable({ rows }) {
  return <UltiGridInsight rows={rows} columns={columns} />
}`,

  lazyData: String.raw`import {
  UltiGridInsight,
  type InsightColumn,
  type LazyRowSource,
} from '@ultigrid/insight'

const rowSource: LazyRowSource<{ id: number }> = {
  rowCount: 100_000,
  getRow: (index) => ({ id: index }),
  getRowId: (row) => row.id,
}

const getColumn = (column: number): InsightColumn<{ id: number }, number> => ({
  id: 'metric-' + column,
  header: 'Metric ' + (column + 1),
  getValue: (row) => ((row.id + 1) * (column + 17)) % 100_000,
})

export function LazyDataGrid() {
  return (
    <UltiGridInsight
      rowSource={rowSource}
      columnCount={10_000}
      getColumn={getColumn}
      fitColumns="none"
      style={{ height: 420 }}
    />
  )
}`,

  imperativeApi: String.raw`import { useRef, useState } from 'react'
import {
  UltiGridViewport,
  type CellRange,
  type UltiGridViewportApi,
} from '@ultigrid/core'

export function ImperativeGrid() {
  const apiRef = useRef<UltiGridViewportApi | null>(null)
  const [selection, setSelection] = useState<CellRange | null>(null)
  const selectRange = () => {
    const range = { rowStart: 1200, rowEnd: 1204, columnStart: 40, columnEnd: 44 }
    setSelection(range)
    apiRef.current?.scrollToCell({ row: range.rowStart, column: range.columnStart }, 'center')
    apiRef.current?.focus()
  }

  return (
    <>
      <button onClick={() => apiRef.current?.scrollToCell({ row: 24000, column: 240 }, 'center')}>
        Jump
      </button>
      <button onClick={selectRange}>Select range</button>
      <UltiGridViewport
        rowCount={50_000}
        columnCount={500}
        getCell={(row, column) => ({ text: row + ':' + column })}
        selection={selection}
        onSelectionChange={setSelection}
        apiRef={apiRef}
      />
    </>
  )
}`,

  exporting: String.raw`import { useRef } from 'react'
import { UltiGridInsight, type UltiGridInsightApi } from '@ultigrid/insight'

const range = { rowStart: 0, rowEnd: 23, columnStart: 0, columnEnd: 3 }

export function ExportableGrid({ rows, columns }) {
  const apiRef = useRef<UltiGridInsightApi | null>(null)
  return (
    <>
      <button onClick={() => void apiRef.current?.exportExcel('report', range)}>Excel</button>
      <button onClick={() => apiRef.current?.exportCsv('report.csv', range)}>CSV</button>
      <button onClick={() => void apiRef.current?.exportImage('report')}>PNG</button>
      <UltiGridInsight
        rows={rows.slice(0, 24)}
        columns={columns.slice(0, 4)}
        apiRef={apiRef}
        exportCellLimit={500}
      />
    </>
  )
}`,
} as const

export type DemoSnippetKey = keyof typeof demoSnippets

export const scenarioSnippetKeys: Record<StudioScenario, DemoSnippetKey> = {
  gallery: 'gallery',
  analysis: 'analysis',
  conditional: 'conditional',
}
