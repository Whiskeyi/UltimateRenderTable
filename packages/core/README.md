# @ultigrid/core

The low-level React DOM viewport engine behind UltiGrid.

`@ultigrid/core` is for grids that need full control over their data protocol and cell rendering. It addresses very large logical row and column counts without requiring a two-dimensional data array, and creates DOM primarily for the visible window, overscan, and effective frozen regions.

> Status: **0.1.0 / Alpha**. The package is ESM-only and does not make a fixed cross-device FPS promise.

## Install

```bash
npm install @ultigrid/core react react-dom
```

React and ReactDOM `>=18.2 <20` are peer dependencies.

Import the stylesheet once in your application entry:

```tsx
import '@ultigrid/core/style.css'
```

## Minimal usage

```tsx
import { useCallback, useMemo, useRef } from 'react'
import {
  UltiGridViewport,
  type MergedCellRange,
  type UltiGridViewportApi,
} from '@ultigrid/core'
import '@ultigrid/core/style.css'

export function LargeGrid() {
  const apiRef = useRef<UltiGridViewportApi | null>(null)
  const getCell = useCallback((row: number, column: number) => ({
    value: row * 100_000 + column,
    text: `${row}:${column}`,
  }), [])
  const columnWidths = useMemo(
    () => new Map<number, number>([[0, 220], [3, 168]]),
    [],
  )
  const mergedCells = useMemo<readonly MergedCellRange[]>(() => [
    { id: 'banner', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 10_500 },
  ], [])

  return (
    <UltiGridViewport
      rowCount={100_000}
      columnCount={100_000}
      getCell={getCell}
      columnWidths={columnWidths}
      mergedCells={mergedCells}
      frozen={{ top: 1, bottom: 1, left: 1, right: 1 }}
      overscan={{ rows: 5, columns: 2 }}
      fitColumns="stretch"
      apiRef={apiRef}
      style={{ height: 560 }}
      ariaLabel="Large virtual grid"
    />
  )
}
```

All cell and range coordinates are zero-based. Range ends are inclusive.

## Public API

The root entry intentionally exposes only the component contract:

- `UltiGridViewport`
- `UltiGridViewportProps` and `UltiGridViewportApi`
- cell, range, merge, frozen-edge, overscan, auto-size, viewport, and `ApiRef` types

Internal axis, merge-index, virtualizer, and selection implementations are not public package subpaths. The only supported exports are:

- `@ultigrid/core`
- `@ultigrid/core/style.css`

## Capabilities

- Independent row and column virtualization.
- On-demand `getCell(row, column)` access.
- Top, bottom, left, and right frozen regions, composed into at most nine clipped panes.
- Two-dimensional merged rectangles without per-cell expansion.
- Default sizes, sparse `ReadonlyMap` overrides, getters, and progressive visible-content measurement.
- Stretch-to-container behavior for narrow data and native horizontal scrolling for wide data.
- Cell-level renderer, style, class, ARIA, and metadata hooks.
- Click and drag selection, Shift extension, arrow/Tab/Enter navigation, and merged-cell-aware movement.
- Spreadsheet-compatible TSV copy through keyboard and imperative APIs.
- ARIA `grid` / `treegrid` roles and viewport callbacks.

## Performance contract

- Logical `100,000 × 100,000` addressing does not allocate a 10-billion-cell matrix.
- Ordinary DOM tracks the viewport, overscan, and frozen regions.
- Sparse custom sizes should use stable `ReadonlyMap` instances.
- `autoSize` measures rendered, non-merged cells incrementally; it is not a full-data scan.
- Copy materializes the selected range and defaults to a 100,000-cell safety limit.
- Custom renderers run on the main thread, so deep DOM and expensive synchronous work still affect scrolling.
- The current engine uses one native scroll coordinate space. Browser layout-size and scroll-precision limits still apply at extreme canvas sizes.

## License

MIT
