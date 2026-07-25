[中文](README.zh-CN.md) | **English**

# UltiGrid

A React DOM grid stack for large two-dimensional datasets. The repository combines **Studio**, an **application grid**, and a **grid rendering foundation**. Studio provides demos and live configuration, `@ultigrid/insight` provides BI-ready table semantics, and `@ultigrid/core` owns the virtualized rendering hot path.

UltiGrid treats `100,000 × 100,000` as a logical coordinate space. Data is read by coordinate, rows and columns are virtualized together, and DOM size follows the viewport, overscan, and frozen regions rather than the full matrix.

> Current status: **0.2.0 / Alpha**. The project does not promise a fixed cross-device FPS; performance results need an explicit browser, device, dataset, and renderer configuration.

## Three-layer repository architecture

| Layer | Directory / artifact | Responsibility |
| --- | --- | --- |
| Studio | `src/studio`, `src/demo` | Interactive demos, live Props/JSON, real-source editing and preview, i18n, fullscreen, and diagnostics; not published to npm |
| Application grid | `src/bi` → `@ultigrid/insight` | Row and column models, trees, vertical adjacent-value merging within columns, conditional formatting, custom cells, and export |
| Grid rendering foundation | `src/core` → `@ultigrid/core` | Axis, two-axis virtualization, four-edge freezing, rectangle merges, selection, navigation, copy, and DOM |

```text
Studio ──demo/config──▶ @ultigrid/insight ──domain semantics──▶ @ultigrid/core ──▶ viewport DOM
```

The application grid and rendering foundation ship as ESM packages and support React and ReactDOM `>=18.2 <20`. Insight depends on Core, and `@ultigrid/insight/style.css` already includes the Core styles.

## Quick start

Application grid:

```bash
npm install @ultigrid/insight react react-dom
```

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
    id: 'region', header: 'Region', getValue: (row) => row.region,
  }),
  defineInsightColumn<Sale, number>({
    id: 'revenue',
    header: 'Revenue',
    getValue: (row) => row.revenue,
    conditionalRules: [
      { id: 'bar', kind: 'dataBar', domain: [0, 300_000], color: '#24935f' },
    ],
  }),
]

export function RevenueTable() {
  return <UltiGridInsight rows={rows} columns={columns} style={{ height: 420 }} />
}
```

Install `@ultigrid/core` when you only need the coordinate protocol and direct control over cell DOM. See the [Core README](packages/core/README.md) and [Insight README](packages/insight/README.md) for their complete entry points.

## Migrating to 0.2.0

`InsightColumn<TRow, TValue>` and `defineInsightColumn` now constrain `TValue` to the serializable cell-value union `string | number | boolean | Date | null | undefined`. If a 0.1.x column returned an object from `getValue`, return the primitive or `Date` used for display, formatting, sorting, and export instead. Custom renderers still receive the typed source row, so read richer objects from `context.row`:

```tsx
defineInsightColumn<Order, string>({
  id: 'customer',
  getValue: (row) => row.customer.name,
  renderContent: ({ row }) => <strong>{row.customer.name}</strong>,
})
```

This keeps the cell value compatible with built-in rendering and export while preserving access to the full domain object.

## Grid capabilities

| Area | Capabilities |
| --- | --- |
| Large-scale rendering | Independent row and column virtualization, coordinate-based access, viewport rendering, configurable overscan |
| Layout | Freeze on all four edges, default/sparse/getter sizes, visible-content measurement, container stretch, two-axis scrolling, and direct mouse/touch/keyboard column resize |
| Merging | Core renders 2D rectangles; Insight uses `mergeAdjacent` for vertically consecutive equal values in configured columns; horizontal or arbitrary 2D merges use explicit `mergedCells` |
| Cells | Text truncation, alignment, typography, color, images, icons, backgrounds, data bars, custom React components, shared theme color |
| Interaction | Click/drag selection, edge auto-scroll, Shift and keyboard navigation; direction-locked mobile scrolling, tap selection, drag-handle extension, and a floating mobile copy action |
| Data models | Row arrays, `LazyRowSource`, `FlatRowModel`, `TreeRowModel`, materialized columns, and lazy `columnCount + getColumn` columns |
| Conditional formatting | Text, background, icons, two/three-color scales, signed data bars, priority, `stopIfTrue` |
| Output and integration | `scrollToCell`, imperative selection/copy APIs, Excel, CSV, current-viewport PNG, data-coordinate callbacks, `localeText`, and ARIA grid/treegrid semantics with logical rowgroup/row ownership across frozen panes |

See [Capability status](docs/CAPABILITIES.md) for detailed boundaries.

Mobile responsibilities stay layered: Core owns gestures, viewport coordinates, and Axis; Insight maps business columns and data coordinates; Studio owns the responsive shell, focus, and safe areas. Core `columnResize` is opt-in. Insight enables it when a header is shown and accepts `false` to disable it.

## Architecture and implementation

The scroll hot path separates visual movement from React window updates:

```text
scroll → requestAnimationFrame → exact visible window → direct pane transform
                                  └─ exits retained guard
                                     → replenish render window → MergeIndex query → React cells
```

| Module | Implementation | Key cost |
| --- | --- | --- |
| `Axis` | Default size, sparse `Map`, `Float64Array` segment tree | Offset/index lookup `O(log N)` |
| Virtualizer | Exact visible window plus a direction-aware retained window | Lookup `O(log Nᵣ + log N𝚌)`; no React cell regrouping inside the guard |
| Frozen panes | start/middle/end bands per axis, up to nine clipped panes | DOM follows the window and effective frozen regions |
| `MergeIndex` | Stable-id `Map` plus packed R-tree | Build about `O(M log M)`; typical query `O(log M + I)` |
| Selection | One inclusive rectangle with independent anchor/focus | Resident state `O(1)` |
| Insight vertical adjacent merge | Scans displayed rows and configured dimensions when inputs change | Main pass `O(Nᵣ × D)` |
| Insight formatter | Rules compile when props change; color palettes are precomputed | Visible-cell evaluation about `O(W × R)` |

Core does not understand trees, conditional formatting, or value equality. Insight projects domain rows and columns into zero-based data coordinates, then converts vertical same-column regions derived by `mergeAdjacent` into the non-overlapping rectangles consumed by Core; horizontal or arbitrary 2D regions are supplied explicitly through `mergedCells`. Headers and row numbers exist only in internal viewport coordinates; public selection, scrolling, and export APIs consistently use data coordinates.

See [Architecture](docs/ARCHITECTURE.md) for the full data flow, DOM contract, and complexity model.

## Performance and memory

| State | Growth | Notes |
| --- | --- | --- |
| Logical data | Caller-defined | Core keeps no `Nᵣ × N𝚌` cell copy |
| Axis trees | `O(Nᵣ + N𝚌)` | Raw typed buffers for 100K rows and 100K columns total about 4 MiB |
| Custom sizes | `O(Kᵣ + K𝚌)` | Sparse `ReadonlyMap`; only overrides are stored |
| Merge index | `O(M)` | A range spanning many cells remains one rectangle |
| DOM / React cells | `O(W)` | `W` is the retained-window, frozen-pane, and merge-fragment workset |
| Insight working-set caches | Bounded | Up to 2,048 columns; 512 rows and 512 row metadata entries |
| Copy and export | `O(A)` | The target range must be materialized and is guarded by limits |

`100,000 × 100,000` describes logical addressing, not ten billion allocated values. The current implementation uses one native scroll coordinate space and remains subject to browser layout limits, scroll precision, and available memory. Frozen regions, overscan, auto-size measurement, and deep custom DOM all add main-thread work.

At scale, keep getters, size maps, merge configuration, and renderers referentially stable; keep `getCell` / `getColumn` close to `O(1)`; use lazy columns for wide grids; and bound frozen regions, overscan, copy, and export ranges. When a mutable store behind a stable getter changes in place, increment `contentVersion`. Core then invalidates memoized cell content and auto-measurement; Insight also starts a new bounded row and row-metadata cache epoch, so a stable `rowSource` can safely replace rows in place. `contentVersion` does not reset user-resized columns; use `columnLayoutVersion` for authoritative layout replacement.

CSV still materializes synchronously on the main thread. XLSX export yields between row batches (500 rows by default), and the public `UltiGridInsightApi.exportExcel(fileName, range, options)` third argument accepts `signal`, `onProgress`, and `yieldEveryRows`. Progress reports `materializing`, `serializing`, and `complete` phases; `AbortSignal` cancellation is cooperative between batches and before/after serialization. Workbook serialization itself is not interruptible, so hosts should still keep ranges bounded or own a Worker/server export pipeline for very large jobs.

## Studio interaction layer

Studio composes the public capabilities of the application grid and rendering foundation. It is not a production runtime dependency. It has four top-level tabs:

Studio defaults to the Everyday preset: `1K × 40`, row/column overscan `2 / 1`, and automatic row sizing off. `100K × 100K` is an opt-in stress preset, not a fixed-FPS promise.

| Tab | Content |
| --- | --- |
| Overview | Presents Studio, the application grid, and the grid rendering foundation, plus quick-start, production-case, and package-documentation actions, without occupying a grid demo |
| Component gallery | Groups 14 interactive examples into Production, Basic, and Advanced. Order fulfillment supports order/tracking/customer search, attention filtering, and selection-copy handoff; the annual budget matrix filters ≥ CNY 50K overruns, locates the largest overrun, and exports a review CSV; mobile field inspection exercises touch selection and copy. The remaining examples isolate individual capabilities. Every item edits its real TSX and refreshes live. |
| Business analytics | Composite dimensions and metrics; roots and branches both expand across at least depths 0/1/2; same-column merging is independent and splits at sibling boundaries |
| Spreadsheet | Demonstrates editing, formulas, atomic paste, relative formula translation for copy, stable formula references for cut/move, formatting, merge/reset safeguards, and undo/redo as an application integration built on the grid foundation. It does not implement an autofill handle or series fill. |

The gallery editor reads the same `.tsx` file as the default preview through `?raw`, then recompiles edits with a 220ms debounce. Its runtime resolves only `react`, `lucide-react`, `@ultigrid/core`, and `@ultigrid/insight`; drafts remain in the current page.

On narrow screens, Studio keeps the grid stage primary, compresses the top navigation into a horizontal scroller, and moves Props into a safe-area-aware bottom sheet with a backdrop and drag handle. The Overview cards stack vertically at 320–390 px, and the Spreadsheet ribbon keeps non-shrinking groups in a horizontally scrollable lane. Mobile field inspection is a Production gallery case backed by real editable source.

The Spreadsheet module retains up to 50 undo/redo steps in memory across top-level scenario switches within the current page. `sessionStorage` persists only the current worksheet snapshot: a same-tab reload restores the sheet but starts with empty undo/redo history. Pending editors are committed on unmount/page hide, dirty sessions request confirmation before unload, cut never deletes the source unless the system clipboard write succeeds and preserves formula references when moved, out-of-bounds paste is rejected atomically, and destructive merge/reset actions request confirmation and remain undoable. This is session recovery only: there is no durable file save, server synchronization, multi-sheet workbook, or autofill/series-fill workflow.

This editor is a local Demo tool, not a security sandbox. Do not automatically load or execute untrusted source from URLs, remote storage, or third-party shares.

The component gallery verifies the public npm entry points one capability at a time. The right-hand workbench provides visual Props, JSON, scale presets, and performance observations; Chinese and English can be switched immediately.

## Repository layout

```text
packages/
├── core/          # @ultigrid/core publication entry
└── insight/       # @ultigrid/insight publication entry
src/
├── core/          # grid rendering foundation
├── bi/            # application grid
├── studio/        # Studio shell and Props editor
├── demo/          # scenarios, component gallery, real Demo sources, and live-edit runtime
└── i18n/          # Studio Chinese/English copy
tests/             # algorithms, coordinates, data models, and public contracts
docs/              # architecture and capability boundaries
```

## Documentation

- [Architecture, hot path, and memory model](docs/ARCHITECTURE.md)
- [Capability status and boundaries](docs/CAPABILITIES.md)
- [`@ultigrid/core` guide](packages/core/README.md)
- [`@ultigrid/insight` guide](packages/insight/README.md)

## Local development

```bash
npm ci
npm run dev
npm run verify
npx playwright install chromium
npm run test:e2e
```

`npm run verify` runs lint, unit tests, the workspace build, gzip bundle budgets, package-contract checks, and packed Vite-consumer checks. Install Chromium once, then `npm run test:e2e` builds Studio and runs the interaction suite against the built preview; use `npm run test:e2e:built` after an existing `build:demo`. Individual commands such as `npm test`, `npm run verify:packages`, `npm run verify:tarballs`, and `npm run check:size` remain available. The root is a private npm workspace; the two `packages/*` directories are the public publication boundaries.

## npm publishing

Pull requests, merge queues, and `main` pushes run `.github/workflows/ci.yml`: Node 18/20/22 unit/package compatibility, lint, full build, gzip budgets, packed Vite consumers (including React 18), and Chromium interaction tests. GitHub Pages deploys a successful `main` CI result.

`.github/workflows/publish.yml` is manual-only. Run `workflow_dispatch` with `publish=false` to verify a release candidate, or `publish=true` to enter the protected `npm` environment and publish verified tarballs in `@ultigrid/core` → `@ultigrid/insight` order. Release verification repeats lint, tests, build, bundle budgets, package contracts, and packed consumers. If every target version already exists, publishing fails instead of reporting an empty successful release; bump each changed package version before publishing. `--allow-existing` is reserved for explicitly validating a completed release.

First publication:

1. Create or own the `@ultigrid` npm scope.
2. Create a granular access token with **Packages and scopes: Read and write** and **Bypass 2FA** enabled, then store it as the GitHub Actions Secret `NPM_TOKEN`.
3. Run the publishing workflow through `workflow_dispatch` with `publish=true`.

After the first release, configure npm Trusted Publisher for both packages with owner `Whiskeyi`, repository `UltimateRenderTable`, and workflow `publish.yml`. Then set the repository Actions variable `NPM_USE_OIDC=true`; after an OIDC release succeeds, remove `NPM_TOKEN`.

## Roadmap

- Establish reproducible performance benchmarks in addition to the current bundle budgets and browser interaction suite.
- Add segmented scrolling / coordinate rebasing to reduce extreme CSS-canvas limits.
- Move very large exports to a Worker or server-side streaming pipeline.
- Add sorting, filtering, grouping, aggregation, pivoting, validation, durable save, and autofill as application plugins.

## Contributing

Issues, design discussions, and pull requests are welcome. Performance changes should include the browser, hardware, viewport, data scale, frozen regions, overscan, custom DOM, and comparable before/after results.

## License

[MIT](LICENSE) © 2026 UltiGrid contributors
