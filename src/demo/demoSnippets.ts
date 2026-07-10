export const capabilities = String.raw`import { useMemo } from 'react'
import { UltiGridViewport, type MergedCellRange } from '@ultigrid/core'

const merges: MergedCellRange[] = [
  { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 10_500 },
]

export function ExtremeGrid() {
  const rowHeights = useMemo(() => new Map([[0, 52], [9, 64]]), [])
  const columnWidths = useMemo(() => new Map([[0, 220], [3, 168]]), [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={(row, column) => ({
        value: row * 100_000 + column,
        text: row + ':' + column,
      })}
      rowHeights={rowHeights}
      columnWidths={columnWidths}
      mergedCells={merges}
      frozen={{ top: 2, bottom: 1, left: 2, right: 1 }}
      overscan={{ rows: 6, columns: 3 }}
      autoSize={{ rows: true }}
      fitColumns="stretch"
      style={{ height: 640 }}
      ariaLabel="Extreme virtual grid"
    />
  )
}`

export const analysis = String.raw`import {
  UltiGridInsight,
  type InsightColumn,
  type LazyRowSource,
} from '@ultigrid/insight'

type Sale = { id: number; region: string; revenue: number; owner: string }

const rows: LazyRowSource<Sale> = {
  rowCount: 100_000,
  getRow: (index) => ({
    id: index,
    region: ['East', 'South', 'North'][index % 3]!,
    revenue: 48_000 + index * 37,
    owner: ['Lin', 'Zhou', 'Chen'][index % 3]!,
  }),
  getRowId: (row) => row.id,
}

const columns: InsightColumn<Sale>[] = [
  { id: 'region', header: 'Region', getValue: (row) => row.region, width: 180 },
  {
    id: 'revenue',
    header: 'Revenue',
    getValue: (row) => row.revenue,
    formatValue: (value) => Number(value).toLocaleString(),
    visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
  },
  {
    id: 'owner',
    header: 'Owner',
    getValue: (row) => row.owner,
    renderContent: ({ displayValue }) => <strong>{displayValue}</strong>,
  },
]

export function AnalysisTable() {
  return (
    <UltiGridInsight
      rowSource={rows}
      columns={columns}
      frozen={{ top: 1, left: 1 }}
      fitColumns="stretch"
      autoSize={{ rows: true }}
      stripedRows
      style={{ height: 640 }}
    />
  )
}`

export const tree = String.raw`import { useMemo } from 'react'
import { TreeRowModel, UltiGridInsight, type InsightColumn } from '@ultigrid/insight'

type Node = { id: string; label: string; value: number; children?: Node[] }

const roots: Node[] = [
  {
    id: 'growth',
    label: 'Growth',
    value: 128,
    children: [{ id: 'commerce', label: 'Commerce', value: 76 }],
  },
]

export function TreeTable() {
  const model = useMemo(() => new TreeRowModel(roots, {
    getRowId: (row) => row.id,
    hasChildren: (row) => Boolean(row.children?.length),
    getChildren: (row) => row.children ?? [],
    defaultExpanded: (_row, depth) => depth === 0,
  }), [])
  const columns = useMemo<InsightColumn<Node>[]>(() => [
    { id: 'name', header: 'Portfolio', getValue: (row) => row.label, width: 260 },
    { id: 'value', header: 'Value', getValue: (row) => row.value },
  ], [])

  return (
    <UltiGridInsight
      rowModel={model}
      columns={columns}
      treeColumnId="name"
      onToggleRow={async (id, expanded) => {
        if (expanded) await model.expand(id)
        else model.collapse(id)
      }}
      frozen={{ left: 1 }}
      style={{ height: 640 }}
    />
  )
}`

export const conditional = String.raw`import { UltiGridInsight, type InsightColumn } from '@ultigrid/insight'

type Metric = { region: string; score: number }

const rows: Metric[] = [
  { region: 'East', score: 92 },
  { region: 'West', score: 43 },
]

const columns: InsightColumn<Metric>[] = [
  { id: 'region', header: 'Region', getValue: (row) => row.region },
  {
    id: 'score',
    header: 'Score',
    getValue: (row) => row.score,
    conditionalRules: [
      { id: 'text', kind: 'text', when: { operator: 'greaterThan', value: 80 }, style: { color: '#147548', fontWeight: 750 } },
      { id: 'fill', kind: 'background', when: { operator: 'lessThan', value: 50 }, color: '#fde9e7' },
      { id: 'icon', kind: 'icon', when: { operator: 'greaterThan', value: 80 }, icon: { name: 'check', color: '#168653' } },
      { id: 'scale', kind: 'colorScale', domain: [0, 100], colors: ['#f6dddd', '#fff1c7', '#cfeeda'] },
      { id: 'bar', kind: 'dataBar', domain: [0, 100], color: '#27915b' },
    ],
  },
]

export function ConditionalTable() {
  return <UltiGridInsight rows={rows} columns={columns} style={{ height: 520 }} />
}`

export const merged = String.raw`import { useRef } from 'react'
import type { MergedCellRange } from '@ultigrid/core'
import {
  UltiGridInsight,
  type InsightColumn,
  type LazyRowSource,
  type UltiGridInsightApi,
} from '@ultigrid/insight'

type PlanningRow = { index: number }

const rows: LazyRowSource<PlanningRow> = {
  rowCount: 100_000,
  getRow: (index) => ({ index }),
}
const merges: MergedCellRange[] = [
  { id: 'wide', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 10_500 },
  { id: 'tall', rowStart: 2, rowEnd: 10_500, columnStart: 0, columnEnd: 0 },
]
const getColumn = (column: number): InsightColumn<PlanningRow> => ({
  id: 'period-' + column,
  header: 'Period ' + column,
  getValue: (row) => row.index * 100_000 + column,
})

export function MergedCanvas() {
  const apiRef = useRef<UltiGridInsightApi | null>(null)
  return (
    <section>
      <button onClick={() => void apiRef.current?.exportExcel('planning')}>Excel</button>
      <button onClick={() => void apiRef.current?.exportImage('planning')}>PNG</button>
      <UltiGridInsight
        rowSource={rows}
        columnCount={100_000}
        getColumn={getColumn}
        mergedCells={merges}
        showHeader={false}
        showRowNumbers={false}
        fitColumns="none"
        apiRef={apiRef}
        style={{ height: 640 }}
      />
    </section>
  )
}`

export const demoSnippets = Object.freeze({
  capabilities,
  analysis,
  tree,
  conditional,
  merged,
})

export type DemoSnippetKey = keyof typeof demoSnippets
