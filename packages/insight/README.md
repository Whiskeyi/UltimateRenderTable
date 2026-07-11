# @ultigrid/insight

The BI-ready application grid built on `@ultigrid/core`. Insight adds typed row and column models, trees, vertical adjacent-value merging within columns, conditional formatting, layered custom cells, localization, and client-side export while retaining the virtualized Core viewport.

> Status: **0.1.0 / Alpha**. ESM-only; React and ReactDOM `>=18.2 <20` are peer dependencies.

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

## Application contract

| Area | API and behavior |
| --- | --- |
| Rows | Exactly one of `rows`, synchronous `LazyRowSource`, or `rowModel` |
| Columns | Exactly one of `columns` or `columnCount + getColumn`; `defineInsightColumn` preserves value types |
| Flat/tree data | `FlatRowModel`, `TreeRowModel`, sync/async children, expansion state, ARIA tree metadata |
| Adjacent merging | `mergeAdjacent?: false \| AdjacentMergeOptions<TRow>`; `AdjacentMergeColumn<TRow>` selects columns whose vertically consecutive equal values become single-column Core rectangles |
| Conditional formatting | Text, background, icon, two/three-color scale, signed data bar, priority, `stopIfTrue` |
| Custom cells | Alignment, typography, colors, images, icons, background layer, `component`, `renderContent`, `exportValue` |
| Layout and interaction | Core sizing, fit, four-edge freezing, selection, navigation, copy, viewport callbacks |
| Theme | `themeColor` is shared with Core selection, focus, and tree interaction accents |
| Localization | English defaults with partial `localeText` overrides; business content stays caller-controlled |

Adjacent-value equality is application semantics: Insight derives vertical same-column ranges through `mergeAdjacent`, while Core only indexes and renders rectangles. Horizontal or arbitrary 2D ranges use explicit data-coordinate `mergedCells`.

## Cell DOM

```text
.ultigrid-cell
└── .ultigrid-cell__content
    └── .ultigrid-insight-cell
        ├── visual-layer     # background image and data bar
        └── content-layer    # images, icons, text, or a React component
```

The visual layer ignores pointer events so decorations do not interfere with selection. Text truncates to one line by default; wrapping is opt-in.

## Coordinates and API

All public coordinates are zero-based data coordinates. Headers and row numbers are excluded from selection, viewport callbacks, merge ranges, scrolling, copy, and export ranges.

`UltiGridInsightApi` exposes `scrollToCell`, `getSelection`, `copySelection`, `exportExcel`, `exportCsv`, and `exportImage`.

Only these package paths are supported:

- `@ultigrid/insight`
- `@ultigrid/insight/style.css`

The root also exports row models, public component/column/cell types, conditional-rule types, and `AdjacentMergeOptions` / `AdjacentMergeColumn`.

## Performance, memory, and export boundaries

- Rendering inherits Core's two-axis viewport, pane, and merge-index costs.
- Lazy columns use a bounded 2,048-entry cache; row and row-metadata caches hold at most 512 entries each.
- Vertical adjacent merging scans the current row sequence across configured dimensions when its inputs change; generated regions default to a 100,000-item limit.
- Conditional rules compile when Props change; visible-cell evaluation is approximately `O(W × R)`.
- Tree models keep the current visible sequence. Caller-owned arrays, remote pages, and caches remain caller memory.
- Excel and CSV materialize the requested range in `O(A)` time and memory, with a default 1,000,000-cell limit.
- Excel additionally limits a sheet to 16,384 columns and 1,048,576 rows.
- Image export captures the currently laid-out virtual viewport, not the complete logical table.
- Custom React renderers run on the main thread; keep their DOM and synchronous work small.

See the project [architecture](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/ARCHITECTURE.md) and [capability status](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/CAPABILITIES.md).

## Publishing

Repository releases run through `.github/workflows/publish.yml`: every `main` commit builds, tests, and packs both packages, then publishes only versions not already present on npm, in Core → Insight order. A commit without a `package.json` version bump skips publishing safely; use `npm run pack:packages` for the local tarball check.

For the first release, create or own the `@ultigrid` scope and store a granular access token as `NPM_TOKEN` with **Packages and scopes: Read and write** and **Bypass 2FA** enabled, then run `workflow_dispatch`. Afterward, configure Trusted Publisher for both packages as `Whiskeyi / UltimateRenderTable / publish.yml`, set the repository variable `NPM_USE_OIDC=true`, and remove `NPM_TOKEN` after OIDC succeeds.

## License

MIT
