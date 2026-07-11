import {
  clampAddressToRange,
  normalizeRange,
  type CellAddress,
  type CellRange,
} from './viewportTypes.js'

export interface SelectionModel {
  anchor: CellAddress
  focus: CellAddress
}

export function reconcileSelectionModel(
  current: SelectionModel | null,
  selection: CellRange | null,
  bounds: CellRange | null,
): SelectionModel | null {
  if (!selection || !bounds) return null
  if (current) {
    const bounded = {
      anchor: clampAddressToRange(current.anchor, bounds),
      focus: clampAddressToRange(current.focus, bounds),
    }
    const boundedRange = normalizeRange({
      rowStart: bounded.anchor.row,
      rowEnd: bounded.focus.row,
      columnStart: bounded.anchor.column,
      columnEnd: bounded.focus.column,
    })
    if (rangesEqual(boundedRange, selection)) return bounded
  }
  return {
    anchor: { row: selection.rowStart, column: selection.columnStart },
    focus: { row: selection.rowEnd, column: selection.columnEnd },
  }
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return left.rowStart === right.rowStart
    && left.rowEnd === right.rowEnd
    && left.columnStart === right.columnStart
    && left.columnEnd === right.columnEnd
}
