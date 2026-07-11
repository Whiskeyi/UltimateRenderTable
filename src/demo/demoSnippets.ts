import type { StudioScenario } from '../studio'

export const demoSnippets = {
  capabilities: String.raw`import { UltiGridViewport } from '@ultigrid/core'
import { UltiGridInsight } from '@ultigrid/insight'

// Studio demonstrates both public layers; it is not an npm package.
export const layers = {
  studio: 'interactive demos and live props',
  insight: UltiGridInsight,
  core: UltiGridViewport,
}`,

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

  tree: String.raw`import { UltiGridInsight } from '@ultigrid/insight'

export function TreeTable({ rowSource, onToggleRow }) {
  return (
    <UltiGridInsight
      rowSource={rowSource}
      columns={columns}
      treeColumnId="name"
      onToggleRow={onToggleRow}
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
} as const

export type DemoSnippetKey = keyof typeof demoSnippets

export const scenarioSnippetKeys: Record<StudioScenario, DemoSnippetKey> = {
  capabilities: 'capabilities',
  gallery: 'gallery',
  analysis: 'analysis',
  conditional: 'conditional',
}
