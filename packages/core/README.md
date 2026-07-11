# @ultigrid/core

The rendering grid behind UltiGrid: a React DOM viewport engine with two-axis virtualization, four-edge freezing, rectangle merges, selection, keyboard navigation, and copy.

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
      style={{ height: 520 }}
    />
  )
}
```

Coordinates are zero-based and range ends are inclusive. Keep getters, size maps, merge arrays, and renderers referentially stable.

## Public contract

| Area | API |
| --- | --- |
| Component | `UltiGridViewport` |
| Data | `rowCount`, `columnCount`, `getCell` |
| Layout | defaults, sparse size maps/getters, `frozen`, `overscan`, `fitColumns`, `autoSize` |
| Rendering | `renderCell`, styles, classes, metadata, ARIA hooks |
| Merging | explicit, non-overlapping `MergedCellRange` rectangles, including horizontal and arbitrary 2D ranges |
| Interaction | controlled/uncontrolled selection, keyboard navigation, TSV copy |
| Imperative API | scroll, selection, copy through `UltiGridViewportApi` / `ApiRef` |
| Observation | `onViewportChange`, `ViewportSnapshot` |

Only these package paths are supported:

- `@ultigrid/core`
- `@ultigrid/core/style.css`

Axis, virtualizer, MergeIndex, and selection helpers are internal implementations.

## Performance and memory

- Row and column windows are located in `O(log N)` through typed segment trees.
- Ordinary DOM follows the viewport, overscan, effective frozen regions, and merge fragments.
- Sparse custom sizes use `ReadonlyMap`; the axis trees themselves use `O(Nᵣ + N𝚌)` memory.
- A merge spanning many cells remains one indexed rectangle; Core never expands it into per-cell records.
- `autoSize` measures rendered, non-merged cells incrementally and can trigger synchronous layout reads.
- Copy materializes the target range and defaults to a 100,000-cell limit.
- Custom renderers run on the main thread. Deep DOM and expensive synchronous work affect scrolling directly.
- Extreme logical canvases remain subject to browser layout-size and native-scroll precision limits.

See the project [architecture](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/ARCHITECTURE.md) and [capability status](https://github.com/Whiskeyi/UltimateRenderTable/blob/main/docs/CAPABILITIES.md).

## License

MIT
