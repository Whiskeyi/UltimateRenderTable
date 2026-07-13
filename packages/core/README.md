# @ultigrid/core

The rendering grid behind UltiGrid: a React DOM viewport engine with two-axis virtualization, four-edge freezing, rectangle merges, desktop and touch selection, keyboard navigation, and copy.

Core reads cells by coordinate and keeps BI semantics outside the rendering hot path. It does not allocate a two-dimensional data matrix or infer merges from business values.

> Status: **0.1.0 / Alpha**. ESM-only; React and ReactDOM `>=18.2 <20` are peer dependencies.

## Install

```bash
npm install @ultigrid/core react react-dom
```

```tsx
import '@ultigrid/core/style.css'
```

## Usage

```tsx
import { useCallback, useMemo } from 'react'
import { UltiGridViewport, type MergedCellRange } from '@ultigrid/core'
import '@ultigrid/core/style.css'

export function CoordinateGrid() {
  const getCell = useCallback((row: number, column: number) => ({
    value: row * 100_000 + column,
    text: `${row}:${column}`,
  }), [])
  const mergedCells = useMemo<readonly MergedCellRange[]>(() => [
    { id: 'header', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 3 },
  ], [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      mergedCells={mergedCells}
      frozen={{ top: 1, left: 1 }}
      overscan={{ rows: 5, columns: 2 }}
      themeColor="#c2410c"
      mobileInteraction={{ mode: 'auto' }}
      selectionBounds={{ rowStart: 1, rowEnd: 99_999, columnStart: 0, columnEnd: 99_999 }}
      columnResize={{ headerRows: [0], minWidth: 72, maxWidth: 520, touchActivationDelay: 280 }}
      style={{ height: 520 }}
    />
  )
}
```

Coordinates are zero-based and range ends are inclusive. Keep getters, size maps, merge arrays, and renderers referentially stable. Increment `contentVersion` whenever data behind a stable getter mutates in place.

## Public contract

| Area | API |
| --- | --- |
| Component | `UltiGridViewport` |
| Data | `rowCount`, `columnCount`, `getCell` |
| Layout | defaults, sparse size maps/getters, `frozen`, `overscan`, `fitColumns`, `autoSize`, direct column resize |
| Rendering | `renderCell`, styles, classes, metadata, ARIA hooks, `contentVersion` cache invalidation |
| Merging | explicit, non-overlapping `MergedCellRange` rectangles, including horizontal and arbitrary 2D ranges |
| Interaction | bounded controlled/uncontrolled selection, keyboard navigation, TSV copy, direction-locked touch scrolling, tap-safe selection, drag handle, safe-area copy action |
| Theme | `themeColor` controls selection and focus accents; CSS variables remain available for deeper styling |
| Imperative API | scroll, selection, effective width reads, and copy through `UltiGridViewportApi` / `ApiRef` |
| Observation | `onViewportChange`, `ViewportSnapshot` |

Only these package paths are supported:

- `@ultigrid/core`
- `@ultigrid/core/style.css`

Axis, virtualizer, MergeIndex, and selection helpers are internal implementations.

`mobileInteraction` defaults to automatic coarse-pointer and live touch-input detection, so hybrid laptops do not show touch chrome until it is useful. One-finger scrolling uses a dominant-axis lock: vertical movement keeps native browser scrolling and momentum, while a clearly horizontal gesture updates only `scrollLeft` and continues with single-axis momentum. Set `scrollAxisLock: 'native'` to restore browser-managed two-axis panning. A cell is selected only after a tap completes without a pan or scroll. The active cell exposes a 44 px drag target for range extension and edge auto-scroll, while a 44 px safe-area-aware action copies the range. Use `labels` to localize every visible or announced string, or set `showCopyAction: false` when the host supplies its own toolbar.

Core owns raw pointer gestures, zero-based viewport coordinates, and Axis updates. It does not infer business columns or host chrome.

`selectionBounds` constrains pointer starts, drag extension, controlled/default ranges, and keyboard navigation to one inclusive viewport rectangle. Pass `null` to disable selection without disabling scrolling.

`columnResize` is opt-in and defaults to viewport row `0` as its header. Configure exact zero-based `headerRows`, exclude chrome columns with `isColumnResizable`, set numeric or per-column `minWidth` / `maxWidth`, a keyboard step, and a localized separator label. Touch waits 280 ms by default before activating resize, so the 44 px coarse-pointer separator does not steal a horizontal pan; set `touchActivationDelay: 0` for immediate activation. Separators also support mouse, pen, `ArrowLeft` / `ArrowRight`, `Home`, and `End`; `Alt` uses a one-pixel step and `Shift` accelerates. Core applies widths immediately and reports the lifecycle through `onColumnResize`. Its `viewportColumn` is always the zero-based Core coordinate, including host-added row-number or hierarchy columns. New `columnWidths` or `getColumnWidth` references are consumed without discarding the active manual layout or re-entering stretch, so `phase: "end"` can be persisted directly. `columnCount`, `defaultColumnWidth`, `fitColumns`, and `columnLayoutVersion` are layout-reset inputs. Increment `columnLayoutVersion` after mutating stable width getters, replacing a same-sized column model, or when an external source must authoritatively replace the active stretch/manual layout; Core then re-reads widths and clears measured, stretch-baseline, and manual width state. `contentVersion` remains content-only.

`apiRef.current.getColumnWidth(viewportColumn)` returns the effective width, including fit and active/manual resize state, or `undefined` for an invalid coordinate. This supports WYSIWYG export without exposing internal width maps.

## Performance and memory

- Row and column windows are located in `O(log N)` through typed segment trees.
- Exact visible ranges are tracked separately from a direction-aware retained render window; scrolling inside its guard does not regroup React cells.
- Scroll rAF writes pane-layer transforms directly. `onViewportChange` still reports exact visible bounds while `renderedCellCount` reports the retained workset.
- Column-resize pointer events are coalesced to one rAF; the active Axis changes in `O(log N)` and the sparse width map is persisted once on completion.
- Ordinary DOM follows the viewport, overscan, effective frozen regions, and merge fragments.
- Sparse custom sizes use `ReadonlyMap`; the axis trees themselves use `O(Nᵣ + N𝚌)` memory.
- A merge spanning many cells remains one indexed rectangle; Core never expands it into per-cell records.
- `autoSize` measures rendered, non-merged cells incrementally and can trigger synchronous layout reads.
- Copy materializes the target range and defaults to a 100,000-cell limit.
- Custom renderers run on the main thread. Deep DOM and expensive synchronous work affect scrolling directly.
- Extreme logical canvases remain subject to browser layout-size and native-scroll precision limits.

See the project [architecture](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/ARCHITECTURE.md) and [capability status](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/CAPABILITIES.md).

## Publishing

Repository releases run through `.github/workflows/publish.yml`: every `main` commit builds, tests, and packs both packages, then publishes only versions not already present on npm, in Core → Insight order. A commit without a `package.json` version bump skips publishing safely; use `npm run pack:packages` for the local tarball check.

For the first release, create or own the `@ultigrid` scope and store a granular access token as `NPM_TOKEN` with **Packages and scopes: Read and write** and **Bypass 2FA** enabled, then run `workflow_dispatch`. Afterward, configure Trusted Publisher for both packages as `Whiskeyi / UltimateRenderTable / publish.yml`, set the repository variable `NPM_USE_OIDC=true`, and remove `NPM_TOKEN` after OIDC succeeds.

## License

MIT
