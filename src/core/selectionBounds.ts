import {
  clampAddressToRange,
  clampRangeToBounds,
  normalizeRange,
  type CellAddress,
  type CellRange,
  type SelectionEndpoints,
  type SelectionKind,
} from './viewportTypes.js'

export interface SelectionModel {
  anchor: CellAddress
  focus: CellAddress
  active: CellAddress
  range: CellRange
}

export interface SelectionOverlayFragment {
  range: CellRange
  activeRange: CellRange | null
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

export interface SelectionMergeExpander {
  expandBoundsToIntersectingMerges(bounds: CellRange): CellRange
}

export function reconcileSelectionModel(
  current: SelectionModel | null,
  selection: CellRange | null,
  bounds: CellRange | null,
  controlledActiveCell?: CellAddress | null,
  controlledEndpoints?: SelectionEndpoints | null,
  kind: SelectionKind = 'cell',
  merges?: SelectionMergeExpander,
): SelectionModel | null {
  const boundedSelection = clampRangeToBounds(selection, bounds)
  if (!boundedSelection || !bounds) return null
  const controlledActive = controlledActiveCell
    ? clampAddressToRange(controlledActiveCell, boundedSelection)
    : null
  const resolvedEndpoints = resolveControlledEndpoints(
    controlledEndpoints,
    bounds,
    boundedSelection,
    kind,
    merges,
  )
  if (current && (resolvedEndpoints || controlledEndpoints === undefined)) {
    const currentRange = clampRangeToBounds(current.range, bounds)
    const bounded = {
      anchor: resolvedEndpoints?.anchor ?? clampAddressToRange(current.anchor, bounds),
      focus: resolvedEndpoints?.focus ?? clampAddressToRange(current.focus, bounds),
      active: controlledActive ?? clampAddressToRange(current.active, boundedSelection),
      range: boundedSelection,
    }
    if (resolvedEndpoints || (currentRange && rangesEqual(currentRange, boundedSelection))) return bounded
  }
  const anchor = { row: boundedSelection.rowStart, column: boundedSelection.columnStart }
  const active = controlledActive ?? anchor
  const defaultEndpoints = kind === 'column'
    ? {
        anchor: { row: active.row, column: boundedSelection.columnStart },
        focus: { row: active.row, column: boundedSelection.columnEnd },
      }
    : kind === 'row'
      ? {
          anchor: { row: boundedSelection.rowStart, column: active.column },
          focus: { row: boundedSelection.rowEnd, column: active.column },
        }
      : kind === 'sheet'
        ? { anchor: active, focus: active }
        : {
            anchor,
            focus: { row: boundedSelection.rowEnd, column: boundedSelection.columnEnd },
          }
  return {
    anchor: resolvedEndpoints?.anchor ?? defaultEndpoints.anchor,
    focus: resolvedEndpoints?.focus ?? defaultEndpoints.focus,
    active,
    range: boundedSelection,
  }
}

function resolveControlledEndpoints(
  endpoints: SelectionEndpoints | null | undefined,
  bounds: CellRange,
  selection: CellRange,
  kind: SelectionKind,
  merges: SelectionMergeExpander | undefined,
): SelectionEndpoints | null {
  if (!endpoints) return null
  const resolved = {
    anchor: clampAddressToRange(endpoints.anchor, bounds),
    focus: clampAddressToRange(endpoints.focus, bounds),
  }
  const range = normalizeRange({
    rowStart: resolved.anchor.row,
    rowEnd: resolved.focus.row,
    columnStart: resolved.anchor.column,
    columnEnd: resolved.focus.column,
  })
  const expandedCellRange = merges
    ? clampRangeToBounds(merges.expandBoundsToIntersectingMerges(range), bounds)
    : range
  const matches = kind === 'column'
    ? range.columnStart === selection.columnStart && range.columnEnd === selection.columnEnd
    : kind === 'row'
      ? range.rowStart === selection.rowStart && range.rowEnd === selection.rowEnd
      : kind === 'sheet'
        ? true
        : Boolean(expandedCellRange && rangesEqual(expandedCellRange, selection))
  return matches ? resolved : null
}

export function resolveSelectionOverlayFragment(
  selection: CellRange | null,
  pane: CellRange,
  activeRange: CellRange | null,
): SelectionOverlayFragment | null {
  const range = intersectRanges(selection, pane)
  if (!range || !selection) return null
  return {
    range,
    activeRange: intersectRanges(activeRange, range),
    top: range.rowStart === selection.rowStart,
    right: range.columnEnd === selection.columnEnd,
    bottom: range.rowEnd === selection.rowEnd,
    left: range.columnStart === selection.columnStart,
  }
}

export function resolveSelectionThroughMerges(
  selection: CellRange | null,
  bounds: CellRange | null,
  merges: SelectionMergeExpander,
  kind: SelectionKind = 'cell',
): CellRange | null {
  const boundedSelection = clampRangeToBounds(selection, bounds)
  if (!boundedSelection || !bounds) return null
  const resolved = kind === 'cell'
    ? merges.expandBoundsToIntersectingMerges(boundedSelection)
    : boundedSelection
  return clampRangeToBounds(resolved, bounds)
}

function intersectRanges(left: CellRange | null, right: CellRange): CellRange | null {
  if (!left || left.rowStart > right.rowEnd || left.rowEnd < right.rowStart
    || left.columnStart > right.columnEnd || left.columnEnd < right.columnStart) return null
  return {
    rowStart: Math.max(left.rowStart, right.rowStart),
    rowEnd: Math.min(left.rowEnd, right.rowEnd),
    columnStart: Math.max(left.columnStart, right.columnStart),
    columnEnd: Math.min(left.columnEnd, right.columnEnd),
  }
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return left.rowStart === right.rowStart
    && left.rowEnd === right.rowEnd
    && left.columnStart === right.columnStart
    && left.columnEnd === right.columnEnd
}
