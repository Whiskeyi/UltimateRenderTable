export interface CellPosition {
  readonly row: number
  readonly column: number
}

export interface CellSelection {
  readonly anchor: CellPosition
  readonly focus: CellPosition
}

export interface CellRange {
  /** Inclusive bounds. */
  readonly rowStart: number
  readonly rowEnd: number
  readonly columnStart: number
  readonly columnEnd: number
}

export interface GridSize {
  readonly rowCount: number
  readonly columnCount: number
}

export type NavigationDirection = 'up' | 'down' | 'left' | 'right'

export interface MoveSelectionOptions {
  /** Keep the anchor and move only focus (Shift+Arrow behavior). */
  readonly extend?: boolean
  /** Optional merged-cell resolver used to jump across whole merged regions. */
  readonly resolveMergedRange?: (position: CellPosition) => CellRange | undefined
}

export interface TSVOptions {
  /** Defaults to tab. Must be one character. */
  readonly delimiter?: string
  /** Defaults to CRLF for spreadsheet clipboard compatibility. */
  readonly newline?: string
  /** Optional safety ceiling for very large selections. */
  readonly maxCells?: number
  readonly formatValue?: (value: unknown, position: CellPosition) => string
}

export function createSelection(position: CellPosition): CellSelection {
  assertPosition(position)
  const stablePosition = { row: position.row, column: position.column }
  return { anchor: stablePosition, focus: stablePosition }
}

export function normalizeSelection(selection: CellSelection): CellRange {
  assertPosition(selection.anchor)
  assertPosition(selection.focus)
  return {
    rowStart: Math.min(selection.anchor.row, selection.focus.row),
    rowEnd: Math.max(selection.anchor.row, selection.focus.row),
    columnStart: Math.min(selection.anchor.column, selection.focus.column),
    columnEnd: Math.max(selection.anchor.column, selection.focus.column),
  }
}

export function normalizeRange(range: CellRange): CellRange {
  assertCoordinate(range.rowStart, 'rowStart')
  assertCoordinate(range.rowEnd, 'rowEnd')
  assertCoordinate(range.columnStart, 'columnStart')
  assertCoordinate(range.columnEnd, 'columnEnd')
  return {
    rowStart: Math.min(range.rowStart, range.rowEnd),
    rowEnd: Math.max(range.rowStart, range.rowEnd),
    columnStart: Math.min(range.columnStart, range.columnEnd),
    columnEnd: Math.max(range.columnStart, range.columnEnd),
  }
}

export function clampPosition(position: CellPosition, grid: GridSize): CellPosition {
  assertGridSize(grid)
  if (!Number.isFinite(position.row) || !Number.isFinite(position.column)) {
    throw new RangeError('cell position coordinates must be finite numbers')
  }
  if (grid.rowCount === 0 || grid.columnCount === 0) {
    throw new RangeError('cannot clamp a cell position in an empty grid')
  }
  return {
    row: Math.min(Math.max(0, Math.trunc(position.row)), grid.rowCount - 1),
    column: Math.min(Math.max(0, Math.trunc(position.column)), grid.columnCount - 1),
  }
}

/** Arrow-key navigation, including optional Shift extension and merged cells. */
export function moveSelection(
  selection: CellSelection,
  direction: NavigationDirection,
  grid: GridSize,
  options: MoveSelectionOptions = {},
): CellSelection {
  assertGridSize(grid)
  assertPosition(selection.anchor)
  assertPosition(selection.focus)
  if (grid.rowCount === 0 || grid.columnCount === 0) return selection

  const focus = clampPosition(selection.focus, grid)
  const currentMerge = normalizeResolvedRange(options.resolveMergedRange?.(focus), grid)
  let next: CellPosition

  switch (direction) {
    case 'up':
      next = { row: (currentMerge?.rowStart ?? focus.row) - 1, column: focus.column }
      break
    case 'down':
      next = { row: (currentMerge?.rowEnd ?? focus.row) + 1, column: focus.column }
      break
    case 'left':
      next = { row: focus.row, column: (currentMerge?.columnStart ?? focus.column) - 1 }
      break
    case 'right':
      next = { row: focus.row, column: (currentMerge?.columnEnd ?? focus.column) + 1 }
      break
  }

  next = clampPosition(next, grid)
  const destinationMerge = normalizeResolvedRange(options.resolveMergedRange?.(next), grid)
  if (destinationMerge) {
    next = { row: destinationMerge.rowStart, column: destinationMerge.columnStart }
  }

  return options.extend
    ? { anchor: clampPosition(selection.anchor, grid), focus: next }
    : createSelection(next)
}

export function isCellInRange(position: CellPosition, range: CellRange): boolean {
  const normalized = normalizeRange(range)
  return position.row >= normalized.rowStart
    && position.row <= normalized.rowEnd
    && position.column >= normalized.columnStart
    && position.column <= normalized.columnEnd
}

export function rangesIntersect(a: CellRange, b: CellRange): boolean {
  const left = normalizeRange(a)
  const right = normalizeRange(b)
  return left.rowStart <= right.rowEnd
    && left.rowEnd >= right.rowStart
    && left.columnStart <= right.columnEnd
    && left.columnEnd >= right.columnStart
}

export function rangeCellCount(range: CellRange): number {
  const normalized = normalizeRange(range)
  return (normalized.rowEnd - normalized.rowStart + 1)
    * (normalized.columnEnd - normalized.columnStart + 1)
}

export function forEachCellInRange(
  range: CellRange,
  callback: (position: CellPosition) => void,
): void {
  const normalized = normalizeRange(range)
  for (let row = normalized.rowStart; row <= normalized.rowEnd; row += 1) {
    for (let column = normalized.columnStart; column <= normalized.columnEnd; column += 1) {
      callback({ row, column })
    }
  }
}

/** Serializes an inclusive range to spreadsheet-compatible quoted TSV. */
export function rangeToTSV(
  range: CellRange,
  getValue: (position: CellPosition) => unknown,
  options: TSVOptions = {},
): string {
  const normalized = normalizeRange(range)
  const delimiter = validateDelimiter(options.delimiter ?? '\t')
  const newline = options.newline ?? '\r\n'
  const cellCount = rangeCellCount(normalized)
  if (options.maxCells !== undefined) {
    if (!Number.isSafeInteger(options.maxCells) || options.maxCells < 0) {
      throw new RangeError('maxCells must be a non-negative safe integer')
    }
    if (cellCount > options.maxCells) {
      throw new RangeError(`selection contains ${cellCount} cells, exceeding maxCells ${options.maxCells}`)
    }
  }

  const formatValue = options.formatValue ?? defaultFormatValue
  const rows = new Array<string>(normalized.rowEnd - normalized.rowStart + 1)
  let rowOutputIndex = 0

  for (let row = normalized.rowStart; row <= normalized.rowEnd; row += 1) {
    const cells = new Array<string>(normalized.columnEnd - normalized.columnStart + 1)
    let columnOutputIndex = 0
    for (let column = normalized.columnStart; column <= normalized.columnEnd; column += 1) {
      const position = { row, column }
      const formatted = formatValue(getValue(position), position)
      cells[columnOutputIndex] = quoteDelimitedValue(String(formatted), delimiter)
      columnOutputIndex += 1
    }
    rows[rowOutputIndex] = cells.join(delimiter)
    rowOutputIndex += 1
  }
  return rows.join(newline)
}

export function selectionToTSV(
  selection: CellSelection,
  getValue: (position: CellPosition) => unknown,
  options?: TSVOptions,
): string {
  return rangeToTSV(normalizeSelection(selection), getValue, options)
}

/** Parses tabular clipboard text, including quoted tabs/newlines/double-quotes. */
export function parseTSV(input: string, delimiter = '\t'): string[][] {
  validateDelimiter(delimiter)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let fieldStarted = false
  let index = 0

  while (index < input.length) {
    const character = input[index]!
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"'
          index += 2
          continue
        }
        quoted = false
      } else {
        cell += character
      }
      index += 1
      continue
    }

    if (character === '"' && cell.length === 0) {
      quoted = true
      fieldStarted = true
      index += 1
    } else if (character === delimiter) {
      row.push(cell)
      cell = ''
      fieldStarted = false
      index += 1
    } else if (character === '\r' || character === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      fieldStarted = false
      if (character === '\r' && input[index + 1] === '\n') index += 1
      index += 1
    } else {
      cell += character
      fieldStarted = true
      index += 1
    }
  }

  // Do not invent an extra row after a trailing newline, but preserve empty
  // input and trailing delimiters as a real cell.
  if (row.length > 0
    || cell.length > 0
    || fieldStarted
    || input.length === 0
    || input.endsWith(delimiter)) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function normalizeResolvedRange(
  range: CellRange | undefined,
  grid: GridSize,
): CellRange | undefined {
  if (!range) return undefined
  const normalized = normalizeRange(range)
  if (grid.rowCount === 0 || grid.columnCount === 0) return undefined
  return {
    rowStart: Math.min(normalized.rowStart, grid.rowCount - 1),
    rowEnd: Math.min(normalized.rowEnd, grid.rowCount - 1),
    columnStart: Math.min(normalized.columnStart, grid.columnCount - 1),
    columnEnd: Math.min(normalized.columnEnd, grid.columnCount - 1),
  }
}

function defaultFormatValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function quoteDelimitedValue(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !value.includes('"') && !value.includes('\r') && !value.includes('\n')) {
    return value
  }
  return `"${value.replaceAll('"', '""')}"`
}

function validateDelimiter(delimiter: string): string {
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw new RangeError('delimiter must be one character other than quote or newline')
  }
  return delimiter
}

function assertGridSize(grid: GridSize): void {
  assertCount(grid.rowCount, 'rowCount')
  assertCount(grid.columnCount, 'columnCount')
}

function assertPosition(position: CellPosition): void {
  assertCoordinate(position.row, 'row')
  assertCoordinate(position.column, 'column')
}

function assertCoordinate(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer; received ${value}`)
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer; received ${value}`)
  }
}
