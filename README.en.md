[中文](README.md) | **English**

# UltiGrid

A React DOM grid stack for large two-dimensional datasets. The repository has three layers: **Studio**, an **application grid**, and a **rendering grid**. Studio provides demos and live configuration, `@ultigrid/insight` provides BI-ready table semantics, and `@ultigrid/core` owns the virtualized rendering hot path.

UltiGrid treats `100,000 × 100,000` as a logical coordinate space. Data is read by coordinate, rows and columns are virtualized together, and DOM size follows the viewport, overscan, and frozen regions rather than the full matrix.

> Current status: **0.1.0 / Alpha**. The project does not promise a fixed cross-device FPS; performance results need an explicit browser, device, dataset, and renderer configuration.

## Three-layer repository architecture

| Layer | Directory / artifact | Responsibility |
| --- | --- | --- |
| Studio | `src/studio`, `src/demo` | Interactive demos, live Props/JSON, real-source editing and preview, i18n, fullscreen, and diagnostics; not published to npm |
| Application grid | `src/bi` → `@ultigrid/insight` | Row and column models, trees, vertical adjacent-value merging within columns, conditional formatting, custom cells, and export |
| Rendering grid | `src/core` → `@ultigrid/core` | Axis, two-axis virtualization, four-edge freezing, rectangle merges, selection, navigation, copy, and DOM |

```text
Studio ──demo/config──▶ @ultigrid/insight ──domain semantics──▶ @ultigrid/core ──▶ viewport DOM
```

Both public packages are ESM-only and support React and ReactDOM `>=18.2 <20`. Insight depends on Core, and `@ultigrid/insight/style.css` already includes the Core styles.

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

## Grid capabilities

| Area | Capabilities |
| --- | --- |
| Large-scale rendering | Independent row and column virtualization, coordinate-based access, viewport rendering, configurable overscan |
| Layout | Freeze on all four edges, default/sparse/getter sizes, incremental visible-content measurement, container stretch, two-axis scrolling |
| Merging | Core renders 2D rectangles; Insight uses `mergeAdjacent` for vertically consecutive equal values in configured columns; horizontal or arbitrary 2D merges use explicit `mergedCells` |
| Cells | Text truncation, alignment, typography, color, images, icons, backgrounds, data bars, custom React components, shared theme color |
| Interaction | Click and drag selection, out-of-bounds auto-scroll, Shift extension, arrow/Tab/Enter navigation, merge-aware movement, TSV copy |
| Data models | Row arrays, `LazyRowSource`, `FlatRowModel`, `TreeRowModel`, materialized columns, and lazy `columnCount + getColumn` columns |
| Conditional formatting | Text, background, icons, two/three-color scales, signed data bars, priority, `stopIfTrue` |
| Output and integration | `scrollToCell`, imperative selection/copy APIs, Excel, CSV, current-viewport PNG, data-coordinate callbacks, `localeText`, ARIA grid/treegrid |

See [Capability status](docs/CAPABILITIES.md) for detailed boundaries.

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

At scale, keep getters, size maps, merge configuration, and renderers referentially stable; keep `getCell` / `getColumn` close to `O(1)`; use lazy columns for wide grids; and bound frozen regions, overscan, copy, and export ranges. When a mutable store behind a stable getter changes in place, increment `contentVersion` to invalidate cell-render and auto-measurement caches.

## Studio interaction layer

Studio demonstrates how the two npm packages compose. It is not a production runtime dependency. It has four top-level tabs:

Studio defaults to the Everyday preset: `1K × 40`, row/column overscan `2 / 1`, and automatic row sizing off. `100K × 100K` is an opt-in stress preset, not a fixed-FPS promise.

| Tab | Content |
| --- | --- |
| Overview | Presents the Studio, application-grid, and rendering-grid layers, publishing boundaries, and capability summary without occupying a grid demo |
| Component gallery | Groups 11 interactive examples into Basic and Advanced; each edits the TSX file that implements the Demo and refreshes its preview live, covering lazy rows/columns, multi-level trees, imperative APIs, and Excel/CSV/PNG export |
| Business analytics | Composite dimensions and metrics; roots and branches both expand across at least depths 0/1/2; same-column merging is independent and splits at sibling boundaries |
| Conditional formatting | Combined text, background, icon, color-scale, and data-bar rules |

The gallery editor reads the same `.tsx` file as the default preview through `?raw`, then recompiles edits with a 220ms debounce. Its runtime resolves only `react`, `lucide-react`, `@ultigrid/core`, and `@ultigrid/insight`; drafts remain in the current page.

This editor is a local Demo tool, not a security sandbox. Do not automatically load or execute untrusted source from URLs, remote storage, or third-party shares.

The component gallery verifies the public npm entry points one capability at a time. The right-hand workbench provides visual Props, JSON, scale presets, and performance observations; Chinese and English can be switched immediately.

## Repository layout

```text
packages/
├── core/          # @ultigrid/core publication entry
└── insight/       # @ultigrid/insight publication entry
src/
├── core/          # rendering grid layer
├── bi/            # application grid layer
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
npm test
npm run build
npm run verify:packages
npm run pack:packages
```

The root is a private npm workspace; the two `packages/*` directories are the public publication boundaries.

## npm publishing

`.github/workflows/publish.yml` runs build, test, and package-tarball checks on every `main` commit or manual `workflow_dispatch` (use `npm run pack:packages` for the matching local check). It queries existing npm versions and publishes only a `package.json` version that is not yet present, in `@ultigrid/core` → `@ultigrid/insight` order. Ordinary commits without a version bump skip publishing safely.

First publication:

1. Create or own the `@ultigrid` npm scope.
2. Create a granular access token with **Packages and scopes: Read and write** and **Bypass 2FA** enabled, then store it as the GitHub Actions Secret `NPM_TOKEN`.
3. Run the publishing workflow through `workflow_dispatch`.

After the first release, configure npm Trusted Publisher for both packages with owner `Whiskeyi`, repository `UltimateRenderTable`, and workflow `publish.yml`. Then set the repository Actions variable `NPM_USE_OIDC=true`; after an OIDC release succeeds, remove `NPM_TOKEN`.

## Roadmap

- Establish reproducible browser benchmarks and performance budgets.
- Add segmented scrolling / coordinate rebasing to reduce extreme CSS-canvas limits.
- Move very large exports to a Worker or server-side streaming pipeline.
- Add sorting, filtering, grouping, aggregation, pivoting, and editing as application plugins.

## Contributing

Issues, design discussions, and pull requests are welcome. Performance changes should include the browser, hardware, viewport, data scale, frozen regions, overscan, custom DOM, and comparable before/after results.

## License

[MIT](LICENSE) © 2026 UltiGrid contributors
