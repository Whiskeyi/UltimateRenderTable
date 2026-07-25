# @ultigrid/insight

The BI-ready application grid built on the `@ultigrid/core` rendering foundation. Insight adds typed row and column models, trees, vertical adjacent-value merging within columns, conditional formatting, layered custom cells, localization, and client-side export while retaining the virtualized Core viewport.

> Status: **0.2.0 / Alpha**. ESM-only; React and ReactDOM `>=18.2 <20` are peer dependencies.

## Install

```bash
npm install @ultigrid/insight react react-dom
```

Import one stylesheet; it already contains the Core styles.

```tsx
import '@ultigrid/insight/style.css'
```

## Usage

```tsx
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface Sale { id: number; region: string; revenue: number }

const rows: Sale[] = [
  { id: 1, region: 'East', revenue: 268_000 },
  { id: 2, region: 'South', revenue: 146_000 },
]

const columns: InsightColumnDefinition<Sale>[] = [
  defineInsightColumn<Sale, string>({
    id: 'region', header: 'Region', width: 180,
    getValue: (row) => row.region,
  }),
  defineInsightColumn<Sale, number>({
    id: 'revenue', header: 'Revenue', width: 160,
    getValue: (row) => row.revenue,
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
      themeColor="#c2410c"
      style={{ height: 420 }}
    />
  )
}
```

## Migrating from 0.1.x to 0.2.0

`InsightColumn<TRow, TValue>` and `defineInsightColumn` now constrain `TValue` to `InsightCellValue`: `string | number | boolean | Date | null | undefined`. Columns that previously returned an object from `getValue` must return the primitive or `Date` used by built-in rendering and export. Read the richer domain object from `context.row` in a custom renderer:

```tsx
defineInsightColumn<Order, string>({
  id: 'customer',
  getValue: (row) => row.customer.name,
  renderContent: ({ row }) => <strong>{row.customer.name}</strong>,
})
```

## Application contract

| Area | API and behavior |
| --- | --- |
| Rows | Exactly one of `rows`, synchronous `LazyRowSource`, or `rowModel` |
| Columns | Exactly one of `columns` or `columnCount + getColumn`; `defineInsightColumn` preserves value types within the serializable `InsightCellValue` boundary |
| Flat/tree data | `FlatRowModel`, `TreeRowModel`, sync/async children, expansion state, ARIA tree metadata |
| Adjacent merging | `mergeAdjacent?: false \| AdjacentMergeOptions<TRow>`; `AdjacentMergeColumn<TRow>` selects columns whose vertically consecutive equal values become single-column Core rectangles |
| Conditional formatting | Text, background, icon, two/three-color scale, signed data bar, priority, `stopIfTrue` |
| Custom cells | Alignment, typography, colors, images, icons, background layer, `component`, `renderContent`, `exportValue` |
| Layout and interaction | Core sizing, fit, four-edge freezing, direct column resize, selection, navigation, data-cell click/copy callbacks, configurable copy limit, touch-first selection and copy, viewport callbacks |
| Theme | `themeColor` is shared with Core selection, focus, and tree interaction accents |
| Localization | English defaults with partial `localeText` overrides; business content stays caller-controlled |

Insight maps business columns and zero-based data coordinates onto Core gestures, selection bounds, and Axis updates. With a header shown, `columnResize` is enabled by default and accepts `false` to disable it; row-number chrome is excluded from selection, copy, resize callbacks, and column constraints. Touch waits for a short long press before resizing so horizontal pan remains native.

`columnWidths` overrides `column.width` and is the controlled persistence path for `onColumnResize`; persisting `phase: "end"` does not clear the live manual width or re-enter stretch. Excel export reads the current effective Core width, including stretch and manual resize. Increment `columnLayoutVersion` after mutating a stable lazy-column schema or when an external layout must authoritatively replace user widths; it re-reads lazy columns and clears measured/manual layout state.

Increment `contentVersion` when data or row metadata behind a stable getter or `rowSource` changes in place. Insight synchronously starts a new bounded row and row-metadata cache epoch before the first read, while Core invalidates memoized cell content and auto-measurement. Ordinary `contentVersion` changes keep user widths intact.

Adjacent-value equality is application semantics: Insight derives vertical same-column ranges through `mergeAdjacent`, while Core only indexes and renders rectangles. Horizontal or arbitrary 2D ranges use explicit data-coordinate `mergedCells`.

## Cell DOM

```text
Plain static text/style path:
.ultigrid-cell
└── .ultigrid-cell__content
    └── .ultigrid-insight-cell--plain

Rich path (rules, media, dynamic style, or custom renderer):
.ultigrid-cell
└── .ultigrid-cell__content
    └── .ultigrid-insight-cell
        ├── visual-layer     # background image and data bar
        └── content-layer    # images, icons, text, or a React component
```

Both paths retain `.ultigrid-insight-cell` plus `data-row-id` / `data-column-id` as stable styling hooks. The visual layer ignores pointer events so decorations do not interfere with selection. Text truncates to one line by default; wrapping is opt-in.

## Coordinates and API

All public coordinates are zero-based data coordinates. Headers and row numbers are excluded from selection, viewport callbacks, merge ranges, scrolling, copy, and export ranges.

`onCellClick` receives the typed row plus data-column context; `onCopy` receives the copied data range and TSV payload. Coordinate and selection types such as `CellAddress`, `CellRange`, and `SelectionKind` are re-exported by Insight, so application code does not need a second Core import.

`UltiGridInsightApi` exposes `scrollToCell`, `getSelection`, `getActiveCell`, `focus`, `copySelection`, `exportExcel`, `exportCsv`, and `exportImage`; the nested Core viewport remains an implementation detail. `exportExcel(fileName?, range?, options?)` publicly accepts `signal`, `onProgress`, and `yieldEveryRows` in its third argument.

Only these package paths are supported:

- `@ultigrid/insight`
- `@ultigrid/insight/style.css`

The root also exports row models, public component/column/cell types, conditional-rule types, and `AdjacentMergeOptions` / `AdjacentMergeColumn`.

## Performance, memory, and export boundaries

- Rendering inherits Core's retained two-axis window, direct pane-transform path, and merge-index costs.
- Lazy columns use a bounded 2,048-entry cache; row and row-metadata caches hold at most 512 entries each.
- Vertical adjacent merging scans the current row sequence across configured dimensions when its inputs change; generated regions default to a 100,000-item limit.
- Conditional rules compile when Props change; visible-cell evaluation is approximately `O(W × R)`.
- Tree models keep the current visible sequence. Caller-owned arrays, remote pages, and caches remain caller memory.
- Excel and CSV materialize the requested range in `O(A)` time and memory, with a default 250,000-cell limit. Raise `exportCellLimit` deliberately for capable devices or move larger exports to a Worker/backend stream.
- CSV synchronously materializes each target column definition once and neutralizes string prefixes that spreadsheet applications could interpret as formulas.
- XLSX export yields every 500 rows by default and reports materialization/serialization/complete phases through the public third-argument `onProgress` callback. The same options object accepts cooperative `AbortSignal` cancellation between row batches plus `yieldEveryRows`; workbook serialization itself is not interruptible.
- Excel additionally limits a sheet to 16,384 columns and 1,048,576 rows.
- Image export captures the currently laid-out virtual viewport, not the complete logical table.
- Custom React renderers run on the main thread; keep their DOM and synchronous work small.

See the project [architecture](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/ARCHITECTURE.md) and [capability status](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/CAPABILITIES.md).

## Publishing

Pull requests, merge queues, and `main` pushes run the repository CI matrix: Node 18/20/22 package compatibility, lint/build/bundle budgets, packed Vite consumers (including React 18), and Chromium interaction tests. Locally, `npm run verify` covers the main non-browser gates; CI additionally repeats the packed consumer with React 18. After `npx playwright install chromium`, `npm run test:e2e` runs the built Studio browser suite.

Repository releases run through manual-only `.github/workflows/publish.yml`. `workflow_dispatch` with `publish=false` verifies a candidate; `publish=true` enters the protected `npm` environment and publishes verified tarballs in Core → Insight order. A release fails when every target version already exists, so bump each changed package version instead of relying on a silent skip.

For the first release, create or own the `@ultigrid` scope and store a granular access token as `NPM_TOKEN` with **Packages and scopes: Read and write** and **Bypass 2FA** enabled, then run `workflow_dispatch` with `publish=true`. Afterward, configure Trusted Publisher for both packages as `Whiskeyi / UltimateRenderTable / publish.yml`, set the repository variable `NPM_USE_OIDC=true`, and remove `NPM_TOKEN` after OIDC succeeds.

## License

MIT
