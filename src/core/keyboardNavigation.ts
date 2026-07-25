import type { CellAddress, CellRange } from './viewportTypes.js'

export type KeyboardNavigationDirection = 'up' | 'down' | 'left' | 'right'

export function getKeyboardNavigationDirection(
  key: string,
  reverse = false,
): KeyboardNavigationDirection | null {
  switch (key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case 'Tab': return reverse ? 'left' : 'right'
    case 'Enter': return reverse ? 'up' : 'down'
    default: return null
  }
}

export function shouldExtendKeyboardSelection(key: string, shiftKey: boolean): boolean {
  return shiftKey && key.startsWith('Arrow')
}

export function hasSelectionTraversalWrapped(
  active: CellAddress,
  next: CellAddress,
  direction: KeyboardNavigationDirection,
): boolean {
  if (active.row === next.row && active.column === next.column) return false
  if (direction === 'right') {
    return next.row < active.row || (next.row === active.row && next.column <= active.column)
  }
  if (direction === 'left') {
    return next.row > active.row || (next.row === active.row && next.column >= active.column)
  }
  if (direction === 'down') {
    return next.column < active.column || (next.column === active.column && next.row <= active.row)
  }
  return next.column > active.column || (next.column === active.column && next.row >= active.row)
}

export function moveNavigationAddress(
  address: CellAddress,
  bounds: CellRange,
  direction: KeyboardNavigationDirection,
  merge?: CellRange,
): CellAddress {
  const next = { ...address }
  if (direction === 'up') next.row = (merge?.rowStart ?? address.row) - 1
  if (direction === 'down') next.row = (merge?.rowEnd ?? address.row) + 1
  if (direction === 'left') next.column = (merge?.columnStart ?? address.column) - 1
  if (direction === 'right') next.column = (merge?.columnEnd ?? address.column) + 1
  return {
    row: Math.min(bounds.rowEnd, Math.max(bounds.rowStart, next.row)),
    column: Math.min(bounds.columnEnd, Math.max(bounds.columnStart, next.column)),
  }
}

export function moveTabAddress(
  address: CellAddress,
  bounds: CellRange,
  reverse: boolean,
  getMerge: (address: CellAddress) => CellRange | undefined,
): CellAddress {
  const direction = reverse ? 'left' : 'right'
  const currentMerge = getMerge(address)
  let cursor = address

  while (true) {
    const candidate = stepTabAddress(cursor, bounds, direction)
    if (!candidate) return address
    const merge = getMerge(candidate)
    if (!merge) return candidate

    const canonical = {
      row: Math.max(bounds.rowStart, merge.rowStart),
      column: Math.max(bounds.columnStart, merge.columnStart),
    }
    const isCurrentSurface = sameRange(merge, currentMerge)
    const spansFullRow = merge.columnStart <= bounds.columnStart
      && merge.columnEnd >= bounds.columnEnd
    if (!isCurrentSurface
      && (sameAddress(candidate, canonical)
        || (reverse && (spansFullRow || candidate.row === canonical.row)))) return canonical
    cursor = skipCoveredMerge(candidate, merge, bounds, direction)
  }
}

export function moveWithinSelection(
  active: CellAddress,
  selection: CellRange,
  direction: KeyboardNavigationDirection,
): CellAddress {
  let row = active.row
  let column = active.column
  if (direction === 'right') {
    column += 1
    if (column > selection.columnEnd) {
      column = selection.columnStart
      row = row >= selection.rowEnd ? selection.rowStart : row + 1
    }
  } else if (direction === 'left') {
    column -= 1
    if (column < selection.columnStart) {
      column = selection.columnEnd
      row = row <= selection.rowStart ? selection.rowEnd : row - 1
    }
  } else if (direction === 'down') {
    row += 1
    if (row > selection.rowEnd) {
      row = selection.rowStart
      column = column >= selection.columnEnd ? selection.columnStart : column + 1
    }
  } else {
    row -= 1
    if (row < selection.rowStart) {
      row = selection.rowEnd
      column = column <= selection.columnStart ? selection.columnEnd : column - 1
    }
  }
  return { row, column }
}

export function moveWithinSelectionSurfaces(
  active: CellAddress,
  selection: CellRange,
  direction: KeyboardNavigationDirection,
  getMerge: (address: CellAddress) => CellRange | undefined,
): CellAddress {
  const activeMerge = getMerge(active)
  if (activeMerge && containsRange(activeMerge, selection)) return active
  let cursor = activeMerge && (direction === 'right' || direction === 'down')
    ? moveToMergeEdge(active, activeMerge, selection, direction)
    : active
  const visited = new Set<string>()

  while (true) {
    const next = moveWithinSelection(cursor, selection, direction)
    if (sameAddress(next, active)) return active
    const key = `${next.row}:${next.column}`
    if (visited.has(key)) return active
    visited.add(key)
    const merge = getMerge(next)
    if (!merge) return next
    const owner = { row: merge.rowStart, column: merge.columnStart }
    const ownerInside = containsAddress(selection, owner)
    const isCurrentSurface = sameRange(merge, activeMerge)
    if (sameAddress(next, owner) && !isCurrentSurface) return owner
    if (direction === 'left' && ownerInside && !isCurrentSurface
      && (next.row === merge.rowStart || spansSelectionWidth(merge, selection))) return owner
    if (direction === 'up' && ownerInside && !isCurrentSurface
      && (next.column === merge.columnStart || spansSelectionHeight(merge, selection))) return owner
    cursor = moveToMergeEdge(next, merge, selection, direction)
  }
}

function stepTabAddress(
  address: CellAddress,
  bounds: CellRange,
  direction: 'left' | 'right',
): CellAddress | null {
  if (direction === 'right') {
    if (address.column < bounds.columnEnd) return { row: address.row, column: address.column + 1 }
    if (address.row < bounds.rowEnd) return { row: address.row + 1, column: bounds.columnStart }
    return null
  }
  if (address.column > bounds.columnStart) return { row: address.row, column: address.column - 1 }
  if (address.row > bounds.rowStart) return { row: address.row - 1, column: bounds.columnEnd }
  return null
}

function skipCoveredMerge(
  candidate: CellAddress,
  merge: CellRange,
  bounds: CellRange,
  direction: 'left' | 'right',
): CellAddress {
  const spansFullRow = merge.columnStart <= bounds.columnStart
    && merge.columnEnd >= bounds.columnEnd
  if (direction === 'right') {
    return {
      row: spansFullRow ? Math.min(bounds.rowEnd, merge.rowEnd) : candidate.row,
      column: spansFullRow ? bounds.columnEnd : Math.min(bounds.columnEnd, merge.columnEnd),
    }
  }
  return {
    row: spansFullRow ? Math.max(bounds.rowStart, merge.rowStart) : candidate.row,
    column: spansFullRow ? bounds.columnStart : Math.max(bounds.columnStart, merge.columnStart),
  }
}

function moveToMergeEdge(
  address: CellAddress,
  merge: CellRange,
  selection: CellRange,
  direction: KeyboardNavigationDirection,
): CellAddress {
  if (direction === 'right') {
    return {
      row: spansSelectionWidth(merge, selection)
        ? Math.min(selection.rowEnd, merge.rowEnd)
        : address.row,
      column: Math.min(selection.columnEnd, merge.columnEnd),
    }
  }
  if (direction === 'left') {
    return {
      row: spansSelectionWidth(merge, selection)
        ? Math.max(selection.rowStart, merge.rowStart)
        : address.row,
      column: Math.max(selection.columnStart, merge.columnStart),
    }
  }
  if (direction === 'down') {
    return {
      row: Math.min(selection.rowEnd, merge.rowEnd),
      column: spansSelectionHeight(merge, selection)
        ? Math.min(selection.columnEnd, merge.columnEnd)
        : address.column,
    }
  }
  return {
    row: Math.max(selection.rowStart, merge.rowStart),
    column: spansSelectionHeight(merge, selection)
      ? Math.max(selection.columnStart, merge.columnStart)
      : address.column,
  }
}

function spansSelectionWidth(merge: CellRange, selection: CellRange): boolean {
  return merge.columnStart <= selection.columnStart && merge.columnEnd >= selection.columnEnd
}

function spansSelectionHeight(merge: CellRange, selection: CellRange): boolean {
  return merge.rowStart <= selection.rowStart && merge.rowEnd >= selection.rowEnd
}

function containsAddress(range: CellRange, address: CellAddress): boolean {
  return address.row >= range.rowStart && address.row <= range.rowEnd
    && address.column >= range.columnStart && address.column <= range.columnEnd
}

function containsRange(outer: CellRange, inner: CellRange): boolean {
  return inner.rowStart >= outer.rowStart && inner.rowEnd <= outer.rowEnd
    && inner.columnStart >= outer.columnStart && inner.columnEnd <= outer.columnEnd
}

function sameAddress(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column
}

function sameRange(left: CellRange | undefined, right: CellRange | undefined): boolean {
  return left === right || Boolean(left && right
    && left.rowStart === right.rowStart && left.rowEnd === right.rowEnd
    && left.columnStart === right.columnStart && left.columnEnd === right.columnEnd)
}
