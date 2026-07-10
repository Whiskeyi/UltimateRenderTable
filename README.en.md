[中文](README.md) | **English**

# UltiGrid

A React DOM grid for very large two-dimensional datasets: one focused viewport engine and one BI application grid built on top of it.

UltiGrid treats `100,000 × 100,000` as a logical address space, not as 10 billion cell objects to create up front. Data is read by coordinate, both axes are virtualized, merged regions are indexed as rectangles, and DOM size is driven primarily by the viewport, overscan, and frozen regions.

> The current release line is **0.1.0 / Alpha**. The repository contains publishable ESM packages, a working Vite Studio, and automated tests, but it makes no fixed cross-device or cross-browser FPS promise. Performance claims should be based on reproducible data, hardware, and browser conditions.

For evidence against the original requirements and known gaps, see the [requirements audit](docs/REQUIREMENTS-AUDIT.md). For hot paths, complexity, and the memory model, see the [architecture guide](docs/ARCHITECTURE.md).

## Two-layer architecture

```text
Product data, column definitions, rules, custom React content
                            │
                            ▼
                   @ultigrid/insight
            BI semantics, tree rows, formatting, export
                            │
                            ▼
                     @ultigrid/core
        Axes, 2D windows, merge index, selection, DOM
                            │
                            ▼
                    Viewport-sized React DOM
```

| Package | Choose it when | Main public surface | Styles |
| --- | --- | --- | --- |
| `@ultigrid/core` | You need full control over the data protocol and cell DOM for a renderer, designer, or higher-level grid | `UltiGridViewport` and its prop, API, coordinate, and sizing types | `@ultigrid/core/style.css` |
| `@ultigrid/insight` | You need headers, row numbers, trees, conditional formatting, custom content, and export for a BI/product grid | `UltiGridInsight`, `InsightCell`, `defineInsightColumn`, row models, and conditional-rule types | `@ultigrid/insight/style.css` |

`@ultigrid/insight` depends on `@ultigrid/core`, and its `style.css` already contains the core styles. If you use only Insight, do not import a second stylesheet.

Both packages are ESM-only and require React and ReactDOM `>=18.2 <20`. The only public package paths are the root entry and `./style.css`; do not depend on `dist` or source deep imports.

## Installation

Rendering foundation only:

```bash
npm install @ultigrid/core react react-dom
```

```tsx
import '@ultigrid/core/style.css'
```

BI application grid:

```bash
npm install @ultigrid/insight react react-dom
```

```tsx
import '@ultigrid/insight/style.css'
```

If the same application imports APIs or types directly from both packages, install both explicitly.

## Minimal examples

### `@ultigrid/core`

```tsx
import { useCallback } from 'react'
import { UltiGridViewport } from '@ultigrid/core'
import '@ultigrid/core/style.css'

export function CoordinateGrid() {
  const getCell = useCallback((row: number, column: number) => ({
    value: row * 100_000 + column,
    text: `${row}:${column}`,
  }), [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      defaultRowHeight={34}
      defaultColumnWidth={136}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      overscan={{ rows: 5, columns: 2 }}
      fitColumns="stretch"
      style={{ height: 520 }}
      ariaLabel="Coordinate grid"
    />
  )
}
```

`getCell` is read only for the current working set; no two-dimensional array is required. In production, keep getters, size maps, merge arrays, and renderers referentially stable.

### `@ultigrid/insight`

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
      { id: 'revenue-bar', kind: 'dataBar', domain: [0, 300_000], color: '#24935f' },
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
      style={{ height: 420 }}
    />
  )
}
```

`rows`, `rowSource`, and `rowModel` are mutually exclusive at the type level; so are `columns` and `columnCount + getColumn`. `defineInsightColumn` preserves the individual value type of every heterogeneous column.

## Advanced: lazy 100K × 100K data and 10K-span merges on both axes

```tsx
import type { MergedCellRange } from '@ultigrid/core'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
  type LazyRowSource,
} from '@ultigrid/insight'
import '@ultigrid/insight/style.css'

interface PlanningRow { index: number }

const rowSource: LazyRowSource<PlanningRow> = {
  rowCount: 100_000,
  getRow: (index) => ({ index }),
  getRowId: (row) => row.index,
}

const getColumn = (column: number): InsightColumnDefinition<PlanningRow> =>
  defineInsightColumn<PlanningRow, number>({
    id: `period-${column}`,
    header: `Period ${column}`,
    getValue: (row) => row.index * 100_000 + column,
  })

const mergedCells: MergedCellRange[] = [
  { id: 'wide', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 10_500 },
  { id: 'tall', rowStart: 2, rowEnd: 10_500, columnStart: 0, columnEnd: 0 },
]

export function PlanningCanvas() {
  return (
    <UltiGridInsight
      rowSource={rowSource}
      columnCount={100_000}
      getColumn={getColumn}
      mergedCells={mergedCells}
      showHeader={false}
      showRowNumbers={false}
      fitColumns="none"
      overscan={{ rows: 5, columns: 2 }}
      style={{ height: 640 }}
    />
  )
}
```

Merge coordinates are zero-based, inclusive data coordinates. The example spans 10,501 columns horizontally and 10,499 rows vertically; each region remains one rectangle instead of expanding into per-cell records.

## Capability matrix

| Capability | `@ultigrid/core` | `@ultigrid/insight` |
| --- | --- | --- |
| Two-axis virtualization | ✓ | Inherited from core |
| On-demand data access | `getCell(row, column)` | Arrays, `LazyRowSource`, `FlatRowModel`, `TreeRowModel` |
| Frozen on all four edges | ✓, composed into at most nine clipped panes | ✓, with headers and row numbers translated automatically |
| Merged cells | Two-dimensional rectangle index | Data-coordinate props delegated to core |
| Custom row/column sizes | Defaults, sparse `Map`, getters | Same as core; lazy columns may supply a width getter |
| Content sizing | Incremental measurement of rendered, non-merged cells | Same as core |
| Container fit | `fitColumns="stretch"` or native horizontal scroll | Same as core |
| Custom cells | `renderCell`, styles, classes, metadata | Alignment, type, images, icons, `component`, `renderContent` |
| Selection and navigation | Click, drag, Shift, arrows, Tab, Enter | Public APIs use data coordinates excluding headers/row numbers |
| Copy | `Ctrl/Cmd + C` and TSV API | Data-coordinate API; inherits core's default 100,000-cell copy limit |
| Flat/tree data | Domain-agnostic | Flat data, sync/async trees, real expansion/collapse, `treegrid` |
| Conditional formatting | Domain-agnostic | Text, background, icons, two/three-color scales, signed data bars |
| Export | — | Excel, CSV, and PNG of the visible viewport |
| Localization | Caller-provided content | `localeText` overrides interaction and error messages |
| Accessibility | ARIA `grid` / `treegrid`, focus, keyboard | Headers, tree levels, expansion state, localized labels |

Sorting, filtering, grouping, aggregation, pivoting, editing, and undo/redo are not presented as completed data-engine features. They are roadmap items, not hidden switches.

## Five interactive demos

The Vite Studio exposes five top-level tabs: one capability overview and four extension scenarios with distinct column schemas, renderers, data models, and visual languages.

| Tab | Focus | Implementation evidence |
| --- | --- | --- |
| Capabilities | Responsibilities of both public packages, a 10¹⁰-cell logical space, two-axis 10K merges, and five formatting primitives | `CapabilityOverview` |
| Business analytics | Composite dimensions, KPIs, data bars, avatars, status, and mini trends | Dedicated analysis columns and renderers |
| Hierarchy explorer | Lazy visible tree, expand/collapse, node types, owners, and contribution | Collapsing genuinely removes visible descendants |
| Signal matrix | Text, background, icons, color scales, data bars, and a rule legend | A dedicated rule-matrix column schema |
| Merged canvas | Horizontal, vertical, two-dimensional blocks, and a 12,000-merge stress preset | Independent 10,501-column and 10,499-row rectangles |

Every tab includes **View code**, with copyable TSX that uses the final npm entries. The snippets live in [`src/demo/demoSnippets.ts`](src/demo/demoSnippets.ts). Automated tests assert distinct column/renderer compositions across the four data scenarios and validate merge bounds, unique ids, and non-overlap.

Studio also provides:

- A live grid stage on the left and a visual Props/JSON editor on the right, with drafts separated from explicit apply actions.
- One shared set of scale presets: `1K × 40`, `10K × 2K`, `100K × 100K`, and `12K merges`.
- Live `zh-CN` / `en-US` switching with persistence.
- Fullscreen prefers the native `requestFullscreen()` / `exitFullscreen()` path and synchronizes state through `fullscreenchange`. If an embedding permission policy rejects the native API, the same stage automatically uses a fixed-position compatibility mode; click again or press Escape to exit.
- An on-demand performance HUD. It shows page-wide `requestAnimationFrame` callback cadence (Hz derived from the median frame interval), frame-interval P95, and viewport-reported visible/rendered cell counts. It is not “grid FPS” and is not a cross-device benchmark.

## Internationalization

The demo application provides complete `zh-CN` and `en-US` dictionaries for Studio, the capability overview, scenarios, accessibility labels, and export errors. It stores the selected locale in `localStorage` and updates `document.documentElement.lang`.

The packages do not depend on the demo's `I18nProvider`. `@ultigrid/insight` uses English interaction messages by default, and products can partially or fully override them through `localeText`:

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

Column headings, cell content, and number/date formatting remain product-controlled props.

## Performance and memory design

### Hot path

- Scroll events are coalesced with `requestAnimationFrame`; CSS transforms update every frame, while React window state changes only when visible index boundaries change.
- Each axis uses `Axis`: a default size, sparse `Map` overrides, and a typed segment tree. Offset, offset-to-index, and size updates are `O(log N)`.
- Ordinary DOM grows mainly with the viewport, overscan, and effective frozen regions—not with the full matrix area.
- Merged regions use an id `Map` and packed R-tree; a single 10K+ span remains one region.
- Conditional rules compile when props change, color scales precompute a 256-entry palette, and the per-cell path reuses result objects while supporting priority and `stopIfTrue`.
- Insight bounds its lazy-column cache at 2,048 entries and its row and row-metadata working-set caches at 512 entries each.

### Costs virtualization does not hide

- The Axis typed tree uses `O(N)` memory per axis. At 100,000 items, one raw `Float64Array` tree is roughly 2 MiB; two axes are roughly 4 MiB before React, DOM, JS objects, and browser internals.
- Frozen regions render in full within the available viewport. Large frozen counts and overscan both increase DOM.
- `autoSize` measures only currently rendered content and adds synchronous layout reads and progressive caches; it is not a full-table scan.
- Custom React renderers run on the main thread. Deep DOM, synchronous image decoding, and expensive computation directly affect scrolling.
- Copy and export materialize every cell in the target range, so time and extra memory grow with range area.

## Honest scale boundaries

`100,000 × 100,000` describes logical addressability. It does not mean the browser has created 10 billion values in memory, and it is not proof that every device will be smooth.

At default sizes, the logical scroll canvas is approximately `13,600,000 × 3,400,000` CSS pixels. The current implementation uses one native scroll coordinate space without segmented scrolling or coordinate rebasing, so browser layout limits, scroll precision, zoom, and device memory still matter.

The repository does not promise fixed FPS. A reproducible performance report should at least pin the browser version, hardware, viewport, zoom, data getter, size and merge distributions, frozen regions, overscan, and renderer. Studio's page-rAF median/P95 can help inspect one session, but it cannot be attributed as the grid's own rendering frame rate.

## Export and materialization boundaries

- A single Excel worksheet supports at most 16,384 columns; the API rejects wider ranges before export. Total rows, including the header, cannot exceed 1,048,576.
- Excel and CSV share a default 1,000,000-cell client limit, which `exportCellLimit` can lower. Use a range, Worker, or server pipeline for larger exports.
- At extreme scale, Studio exports only the first 2,000 rows × 128 columns to Excel/CSV by default to avoid an accidental page freeze.
- `exportImage()` captures the DOM currently laid out in the table shell—the visible viewport—not a 100K × 100K full-table long image.
- Custom React content cannot become an Excel value automatically; use the column's `exportValue` for its business export value.

## Local development and verification

```bash
npm ci
npm run dev
```

The development server runs at <http://127.0.0.1:4173> by default.

```bash
npm test                 # Vitest: algorithms, BI, demos, i18n, public types/coordinates
npm run build             # Build core, insight, and the Vite demo
npm run verify:packages   # Verify exports, declarations, README/LICENSE, chunks, self-contained CSS
npm run preview
```

The repository root is a private npm workspace; `packages/core` and `packages/insight` are the public packages. Each package's `prepack` rebuilds its artifacts to prevent stale `dist` contents from being published.

## Repository structure

```text
packages/
├── core/        # @ultigrid/core manifest, build entry, release artifacts
└── insight/     # @ultigrid/insight manifest, build entry, release artifacts
src/
├── core/        # UltiGridViewport and rendering hot path
├── bi/          # UltiGridInsight, row models, conditional formatting, export
├── studio/      # Props/JSON workbench, fullscreen, diagnostics UI
├── demo/        # Five-tab data, capability overview, public-API snippets
├── i18n/        # zh-CN / en-US demo dictionaries and Provider
├── styles/      # Demo and global styles
├── App.tsx      # Studio, code panel, and demo assembly
└── main.tsx     # Vite entry
tests/           # Algorithm, BI, scenario, i18n, coordinate, public-type regressions
scripts/         # npm package contract verification
docs/            # Architecture and requirement boundaries
```

## Roadmap

- Establish reproducible browser benchmarks, a hardware matrix, and performance regression budgets.
- Add segmented scrolling or coordinate rebasing to reduce the risk of browser limits on very large CSS canvases.
- Move very large Excel/CSV and tiled full-table image export to Worker or server streaming pipelines.
- Add sorting, filtering, grouping, aggregation, pivoting, column drag, and resize through a plugin layer.
- Add editing, paste, fill handles, validation, and undo/redo transactions.
- Expand frozen-pane × merge coverage, browser screenshot regressions, and accessibility tests.

## Contributing

Issues, design discussions, tests, documentation, and pull requests are welcome. Performance contributions should include a minimal reproduction, browser and hardware, viewport, row/column scale, size and merge distributions, frozen regions, overscan, custom DOM, and before/after data measured under the same conditions.

Before submitting, run:

```bash
npm test
npm run build
npm run verify:packages
```

Keep the rendering layer domain-agnostic and place BI semantics in `src/bi` or above. When adding a public API, update its type tests, package README, and root documentation together.

## License

[MIT](LICENSE) © 2026 UltiGrid contributors
