import {
  rangeToTSV,
  rangesIntersect,
} from '@ultigrid/core'
import type {
  CellAddress,
  CellRange,
} from '@ultigrid/insight'
import type { Locale } from '../i18n'
import { getEffectiveFormat } from './spreadsheetFormatting'
import {
  cellKey,
  createSpreadsheetEvaluator,
  formatSpreadsheetValue,
  parseCellInput,
  selectionLabel,
  translateFormulaReferences,
  type FormulaName,
  type SpreadsheetCellValue,
} from './spreadsheetModel'
import type {
  CellFormat,
  WorksheetSnapshot,
} from './spreadsheetWorkbook'

export interface SheetBounds {
  rowCount: number
  columnCount: number
}

export interface CopyPayload {
  text: string
  values: SpreadsheetCellValue[][]
  formats: (CellFormat | undefined)[][]
  source: CellAddress
  sourceRange: CellRange
}

export interface PasteRequest {
  values: readonly (readonly SpreadsheetCellValue[])[]
  formats?: readonly (readonly (CellFormat | undefined)[])[]
  target: CellAddress
  copySource?: CellAddress
  cutSourceRange?: CellRange
  bounds: SheetBounds
  maxCells: number
}

export type PasteResult =
  | {
      ok: true
      snapshot: WorksheetSnapshot
      targetRange: CellRange
      cellCount: number
    }
  | {
      ok: false
      reason: 'empty' | 'too-large' | 'out-of-bounds' | 'merge-conflict'
      rows: number
      columns: number
    }

export type MergeToggleResult =
  | {
      status: 'changed'
      mode: 'merged' | 'unmerged'
      snapshot: WorksheetSnapshot
      nextSelection?: CellRange
      nextActiveCell?: CellAddress
    }
  | {
      status: 'confirmation-required'
      discardedValues: number
    }
  | {
      status: 'rejected'
      reason: 'single-cell' | 'merge-conflict'
    }

export interface FunctionInsertionPlan {
  target: CellAddress
  formula: string
}

export function applyCellInput(
  sheet: WorksheetSnapshot,
  address: CellAddress,
  draft: string,
): WorksheetSnapshot {
  const key = cellKey(address.row, address.column)
  const value = parseCellInput(draft)
  if (Object.is(sheet.values.get(key) ?? '', value)) return sheet
  const values = new Map(sheet.values)
  if (value === '') values.delete(key)
  else values.set(key, value)
  return { ...sheet, values }
}

export function applyFormatPatch(
  sheet: WorksheetSnapshot,
  range: CellRange,
  patch: Partial<CellFormat>,
): WorksheetSnapshot {
  const formats = new Map(sheet.formats)
  let changed = false
  forEachRangeCell(range, (row, column) => {
    const key = cellKey(row, column)
    const current = formats.get(key) ?? {}
    const next = { ...current, ...patch }
    if (!formatsEqual(current, next)) {
      formats.set(key, next)
      changed = true
    }
  })
  return changed ? { ...sheet, formats } : sheet
}

export function clearWorksheetRange(
  sheet: WorksheetSnapshot,
  range: CellRange,
  mode: 'contents' | 'formats' | 'all',
): WorksheetSnapshot {
  const clearContents = mode !== 'formats'
  const clearFormats = mode !== 'contents'
  const values = clearContents ? new Map(sheet.values) : sheet.values
  const formats = clearFormats ? new Map(sheet.formats) : sheet.formats
  let changed = false
  forEachRangeCell(range, (row, column) => {
    const key = cellKey(row, column)
    if (clearContents && values.delete(key)) changed = true
    if (clearFormats && formats.delete(key)) changed = true
  })
  return changed ? { ...sheet, values, formats } : sheet
}

export function createCopyPayload(
  sheet: WorksheetSnapshot,
  range: CellRange,
  locale: Locale,
  bounds: SheetBounds,
): CopyPayload {
  const evaluator = createSpreadsheetEvaluator(sheet.values, {
    rowCount: bounds.rowCount,
    columnCount: bounds.columnCount,
    maxFormulaCells: bounds.rowCount * bounds.columnCount,
  })
  return {
    text: rangeToTSV(range, ({ row, column }) => {
      const value = evaluator.getValue(row, column)
      const format = getEffectiveFormat(
        row,
        column,
        sheet.formats.get(cellKey(row, column)),
      )
      return formatSpreadsheetValue(value, format.numberFormat, locale)
    }),
    values: rangeToMatrix(
      range,
      (row, column) => sheet.values.get(cellKey(row, column)) ?? '',
    ),
    formats: rangeToMatrix(
      range,
      (row, column) => sheet.formats.get(cellKey(row, column)),
    ),
    source: { row: range.rowStart, column: range.columnStart },
    sourceRange: { ...range },
  }
}

export function applyPaste(
  sheet: WorksheetSnapshot,
  request: PasteRequest,
): PasteResult {
  const rows = request.values.length
  const columns = request.values.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  )
  const cellCount = rows * columns
  const rejected = (
    reason: Extract<PasteResult, { ok: false }>['reason'],
  ): PasteResult => ({ ok: false, reason, rows, columns })

  if (rows === 0 || columns === 0) return rejected('empty')
  if (cellCount > request.maxCells) return rejected('too-large')
  const rowEnd = request.target.row + rows - 1
  const columnEnd = request.target.column + columns - 1
  if (
    request.target.row < 0
    || request.target.column < 0
    || rowEnd >= request.bounds.rowCount
    || columnEnd >= request.bounds.columnCount
  ) return rejected('out-of-bounds')

  const targetRange: CellRange = {
    rowStart: request.target.row,
    rowEnd,
    columnStart: request.target.column,
    columnEnd,
  }
  const cutMerges = request.cutSourceRange
    ? sheet.mergedCells.filter((merge) => rangesIntersect(merge, request.cutSourceRange!))
    : []
  if (
    request.cutSourceRange
    && cutMerges.some((merge) => !rangeContainsRange(request.cutSourceRange!, merge))
  ) return rejected('merge-conflict')

  const retainedMerges = request.cutSourceRange
    ? sheet.mergedCells.filter((merge) => !cutMerges.includes(merge))
    : sheet.mergedCells
  const movedMerges = request.cutSourceRange
    ? cutMerges.map((merge) => ({
        rowStart: request.target.row + merge.rowStart - request.cutSourceRange!.rowStart,
        rowEnd: request.target.row + merge.rowEnd - request.cutSourceRange!.rowStart,
        columnStart: request.target.column
          + merge.columnStart
          - request.cutSourceRange!.columnStart,
        columnEnd: request.target.column
          + merge.columnEnd
          - request.cutSourceRange!.columnStart,
      }))
    : []
  const intersectingMerge = retainedMerges.find((merge) => rangesIntersect(merge, targetRange))
  if (
    intersectingMerge
    && !(
      rows === 1
      && columns === 1
      && request.target.row === intersectingMerge.rowStart
      && request.target.column === intersectingMerge.columnStart
    )
  ) return rejected('merge-conflict')

  const values = new Map(sheet.values)
  const formats = new Map(sheet.formats)
  if (request.cutSourceRange) {
    forEachRangeCell(request.cutSourceRange, (row, column) => {
      const key = cellKey(row, column)
      values.delete(key)
      formats.delete(key)
    })
  }
  for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
    const sourceRow = request.values[rowOffset] ?? []
    for (let columnOffset = 0; columnOffset < columns; columnOffset += 1) {
      const targetRow = request.target.row + rowOffset
      const targetColumn = request.target.column + columnOffset
      const key = cellKey(targetRow, targetColumn)
      const sourceValue = sourceRow[columnOffset] ?? ''
      const value = request.copySource
        ? translateFormulaReferences(
            sourceValue,
            request.target.row - request.copySource.row,
            request.target.column - request.copySource.column,
            request.bounds.rowCount,
            request.bounds.columnCount,
          )
        : sourceValue
      if (value === '') values.delete(key)
      else values.set(key, value)
      if (request.formats) {
        const format = request.formats[rowOffset]?.[columnOffset]
        if (format) formats.set(key, { ...format })
        else formats.delete(key)
      }
    }
  }

  return {
    ok: true,
    snapshot: {
      ...sheet,
      values,
      formats,
      mergedCells: request.cutSourceRange
        ? [...retainedMerges, ...movedMerges]
        : sheet.mergedCells,
    },
    targetRange,
    cellCount,
  }
}

export function toggleMergedRange(
  sheet: WorksheetSnapshot,
  range: CellRange,
  options: { allowDiscard?: boolean } = {},
): MergeToggleResult {
  const exactIndex = sheet.mergedCells.findIndex((merge) => rangesEqual(merge, range))
  if (exactIndex >= 0) {
    return {
      status: 'changed',
      mode: 'unmerged',
      snapshot: {
        ...sheet,
        mergedCells: sheet.mergedCells.filter((_, index) => index !== exactIndex),
      },
    }
  }
  if (isSingleCellRange(range)) {
    return { status: 'rejected', reason: 'single-cell' }
  }
  if (sheet.mergedCells.some((merge) => rangesIntersect(merge, range))) {
    return { status: 'rejected', reason: 'merge-conflict' }
  }

  let discardedValues = 0
  forEachRangeCell(range, (row, column) => {
    if (row === range.rowStart && column === range.columnStart) return
    if ((sheet.values.get(cellKey(row, column)) ?? '') !== '') discardedValues += 1
  })
  if (discardedValues > 0 && !options.allowDiscard) {
    return { status: 'confirmation-required', discardedValues }
  }

  const values = new Map(sheet.values)
  forEachRangeCell(range, (row, column) => {
    if (row !== range.rowStart || column !== range.columnStart) {
      values.delete(cellKey(row, column))
    }
  })
  const nextActiveCell = { row: range.rowStart, column: range.columnStart }
  return {
    status: 'changed',
    mode: 'merged',
    snapshot: {
      ...sheet,
      values,
      mergedCells: [...sheet.mergedCells, { ...range }],
    },
    nextSelection: singleCellRange(nextActiveCell),
    nextActiveCell,
  }
}

export function planFunctionInsertion(
  sheet: WorksheetSnapshot,
  selection: CellRange | null,
  activeCell: CellAddress,
  functionName: FormulaName,
  bounds: SheetBounds,
): FunctionInsertionPlan {
  const readRawValue = (row: number, column: number) => (
    sheet.values.get(cellKey(row, column)) ?? ''
  )
  const source = selection ?? singleCellRange(activeCell)
  let target = activeCell
  let formulaRange = source
  let hasFormulaRange = true
  if (!isSingleCellRange(source) && source.rowEnd < bounds.rowCount - 1) {
    target = { row: source.rowEnd + 1, column: source.columnStart }
  } else if (typeof readRawValue(activeCell.row, activeCell.column) === 'number') {
    let startRow = activeCell.row
    let endRow = activeCell.row
    while (
      startRow > 0
      && typeof readRawValue(startRow - 1, activeCell.column) === 'number'
    ) startRow -= 1
    while (
      endRow < bounds.rowCount - 1
      && typeof readRawValue(endRow + 1, activeCell.column) === 'number'
    ) endRow += 1
    formulaRange = {
      rowStart: startRow,
      rowEnd: endRow,
      columnStart: activeCell.column,
      columnEnd: activeCell.column,
    }
    if (endRow < bounds.rowCount - 1) {
      target = { row: endRow + 1, column: activeCell.column }
    }
  } else if (
    activeCell.row > 0
    && typeof readRawValue(activeCell.row - 1, activeCell.column) === 'number'
  ) {
    let startRow = activeCell.row - 1
    while (
      startRow > 0
      && typeof readRawValue(startRow - 1, activeCell.column) === 'number'
    ) startRow -= 1
    formulaRange = {
      rowStart: startRow,
      rowEnd: activeCell.row - 1,
      columnStart: activeCell.column,
      columnEnd: activeCell.column,
    }
  } else {
    hasFormulaRange = false
  }
  return {
    target,
    formula: `=${functionName}(${hasFormulaRange ? selectionLabel(formulaRange) : ''})`,
  }
}

function forEachRangeCell(
  range: CellRange,
  callback: (row: number, column: number) => void,
) {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let column = range.columnStart; column <= range.columnEnd; column += 1) {
      callback(row, column)
    }
  }
}

function rangeToMatrix<T>(
  range: CellRange,
  getValue: (row: number, column: number) => T,
): T[][] {
  return Array.from({ length: range.rowEnd - range.rowStart + 1 }, (_, rowOffset) => (
    Array.from({ length: range.columnEnd - range.columnStart + 1 }, (_, columnOffset) => (
      getValue(range.rowStart + rowOffset, range.columnStart + columnOffset)
    ))
  ))
}

function singleCellRange(address: CellAddress): CellRange {
  return {
    rowStart: address.row,
    rowEnd: address.row,
    columnStart: address.column,
    columnEnd: address.column,
  }
}

function isSingleCellRange(range: CellRange): boolean {
  return range.rowStart === range.rowEnd && range.columnStart === range.columnEnd
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd
    && left.columnStart === right.columnStart && left.columnEnd === right.columnEnd
}

function rangeContainsRange(outer: CellRange, inner: CellRange): boolean {
  return inner.rowStart >= outer.rowStart && inner.rowEnd <= outer.rowEnd
    && inner.columnStart >= outer.columnStart && inner.columnEnd <= outer.columnEnd
}

function formatsEqual(left: CellFormat, right: CellFormat): boolean {
  return Object.keys({ ...left, ...right }).every((key) => (
    left[key as keyof CellFormat] === right[key as keyof CellFormat]
  ))
}
