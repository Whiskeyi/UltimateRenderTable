import type { CellAddress, CellRange, ViewportSnapshot } from '@ultigrid/core'

export function dataAddressToViewport(
  address: CellAddress,
  headerRows: number,
  rowNumberColumns: number,
): CellAddress {
  return {
    row: address.row + headerRows,
    column: address.column + rowNumberColumns,
  }
}

export function dataRangeToViewport(
  range: CellRange,
  headerRows: number,
  rowNumberColumns: number,
): CellRange {
  return {
    rowStart: range.rowStart + headerRows,
    rowEnd: range.rowEnd + headerRows,
    columnStart: range.columnStart + rowNumberColumns,
    columnEnd: range.columnEnd + rowNumberColumns,
  }
}

export function viewportRangeToData(
  range: CellRange | null,
  headerRows: number,
  rowNumberColumns: number,
  rowCount: number,
  columnCount: number,
): CellRange | null {
  if (!range || rowCount <= 0 || columnCount <= 0) return null
  const rowStart = Math.min(range.rowStart, range.rowEnd)
  const rowEnd = Math.max(range.rowStart, range.rowEnd)
  const columnStart = Math.min(range.columnStart, range.columnEnd)
  const columnEnd = Math.max(range.columnStart, range.columnEnd)
  if (rowEnd < headerRows || columnEnd < rowNumberColumns) return null

  return {
    rowStart: Math.min(rowCount - 1, Math.max(0, rowStart - headerRows)),
    rowEnd: Math.min(rowCount - 1, Math.max(0, rowEnd - headerRows)),
    columnStart: Math.min(columnCount - 1, Math.max(0, columnStart - rowNumberColumns)),
    columnEnd: Math.min(columnCount - 1, Math.max(0, columnEnd - rowNumberColumns)),
  }
}

export function viewportSnapshotToData(
  snapshot: ViewportSnapshot,
  headerRows: number,
  rowNumberColumns: number,
  rowCount: number,
  columnCount: number,
): ViewportSnapshot {
  const range = viewportRangeToData(snapshot, headerRows, rowNumberColumns, rowCount, columnCount)
  if (!range) {
    return {
      ...snapshot,
      rowStart: -1,
      rowEnd: -1,
      columnStart: -1,
      columnEnd: -1,
      visibleCellCount: 0,
    }
  }
  return {
    ...snapshot,
    ...range,
    visibleCellCount:
      (range.rowEnd - range.rowStart + 1) * (range.columnEnd - range.columnStart + 1),
  }
}
