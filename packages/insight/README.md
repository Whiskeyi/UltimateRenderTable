# @ultigrid/insight

The BI-ready React application grid built on `@ultigrid/core`.

`@ultigrid/insight` adds row and column models, headers, row numbers, tree semantics, conditional formatting, layered custom cells, and client-side export while retaining the core viewport engine.

> Status: **0.1.0 / Alpha**. The package is ESM-only and does not make a fixed cross-device FPS promise.

## Install

```bash
npm install @ultigrid/insight react react-dom
```

React and ReactDOM `>=18.2 <20` are peer dependencies. `@ultigrid/core` is installed as a package dependency.

Import one self-contained stylesheet; it includes both Insight and core styles:

```tsx
import '@ultigrid/insight/style.css'
```

## Minimal usage

```tsx
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface Sale {
  id: number
  region: string
  revenue: number
}

const rows: Sale[] = [
  { id: 1, region: 'East', revenue: 268_000 },
  { id: 2, region: 'South', revenue: 146_000 },
]

const columns: InsightColumnDefinition<Sale>[] = [
  defineInsightColumn<Sale, string>({
    id: 'region',
    header: 'Region',
    width: 180,
    getValue: (row) => row.region,
  }),
  defineInsightColumn<Sale, number>({
    id: 'revenue',
    header: 'Revenue',
    width: 180,
    getValue: (row) => row.revenue,
    formatValue: (value) => `$${value.toLocaleString('en-US')}`,
    visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    conditionalRules: [
      { id: 'bar', kind: 'dataBar', domain: [0, 300_000], color: '#24935f' },
    ],
  }),
]

export function SalesTable() {
  return (
    <UltiGridInsight
      rows={rows}
      getRowId={(row) => row.id}
      columns={columns}
      frozen={{ left: 1 }}
      stripedRows
      fitColumns="stretch"
      style={{ height: 480 }}
    />
  )
}
```

## Data and column sources

Choose exactly one row source:

- `rows`: an in-memory array.
- `rowSource`: a synchronous `LazyRowSource` backed by caller-owned paging or generated data.
- `rowModel`: `FlatRowModel`, `TreeRowModel`, or another compatible model.

Choose exactly one column source:

- `columns`: a materialized heterogeneous column array.
- `columnCount + getColumn(index)`: lazy columns for very wide grids.

These choices are mutually exclusive in `UltiGridInsightProps`. Use `defineInsightColumn<TRow, TValue>()` to preserve each column's individual value type.

## Cell composition

An `InsightColumn` can provide:

- `visualStyle` for alignment, type, color, spacing, wrapping, and background.
- leading, trailing, or background `image`.
- named `icon`, with a custom `iconResolver` if required.
- a reusable React `component`.
- `renderContent` for cell-specific React output.
- `exportValue` for a stable business value when the visual content cannot be serialized.

The cell DOM keeps its visual/data-bar layer separate from the content layer so decorations do not interfere with selection.

## Conditional formatting

Five rule kinds are available:

- `text`
- `background`
- `icon`
- two- or three-stop `colorScale`
- signed `dataBar`

Rules support conditions, priority, and `stopIfTrue`. They compile when props change rather than rebuilding their rule arrays for every rendered cell.

## Tree rows

`TreeRowModel` supports synchronous children and asynchronous `loadChildren`. Expansion and collapse update the visible row sequence, and the tree column exposes depth, loading, error, and `aria-expanded` state through the shared renderer.

## Coordinates and imperative API

All public Insight coordinates are zero-based **data coordinates**. Headers and row numbers are excluded consistently from:

- controlled `selection` and `onSelectionChange`
- `onViewportChange`
- `apiRef.current.scrollToCell()`
- `apiRef.current.getSelection()` and `copySelection()`
- merge props and export ranges

The imperative API also exposes `exportExcel`, `exportCsv`, and `exportImage`.

## Export boundaries

- Excel and CSV materialize the requested range in browser memory and default to a 1,000,000-cell safety limit.
- Excel is limited to 16,384 columns and 1,048,576 total rows per worksheet, including the header.
- Image export captures the currently laid-out table shell—the visible virtual viewport—not a full logical-table long image.
- Custom React content should provide `exportValue` when its business value differs from the display value.

## Localization

Default interaction and error messages are English. Override any subset through `localeText`:

```tsx
<UltiGridInsight
  rows={rows}
  columns={columns}
  localeText={{
    expandRow: '展开此行',
    collapseRow: '折叠此行',
    nodeLoadError: '节点加载失败',
  }}
/>
```

Column titles, cell content, and number/date formatting remain caller-controlled.

## Public exports

The root entry exposes:

- `UltiGridInsight`, `InsightCell`, and `defineInsightColumn`
- `FlatRowModel`, `TreeRowModel`, and row-model types
- Insight prop, API, row/column, cell, locale, and viewport types
- conditional-rule and compiled-formatter types

The only supported package paths are:

- `@ultigrid/insight`
- `@ultigrid/insight/style.css`

## License

MIT
