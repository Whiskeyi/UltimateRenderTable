import type { Cell, CellObject, SheetData } from 'write-excel-file/universal'

const EXCEL_CELL_TEXT_LIMIT = 32_767

export type ExcelCellValue = string | number | boolean | Date | null | undefined

export interface ExcelExportColumn<TRow> {
  id: string
  header: string
  getValue: (row: TRow, rowIndex: number) => ExcelCellValue
  /** Optional serialized value, useful for domain formatting and custom cells. */
  getExportValue?: (
    value: ExcelCellValue,
    row: TRow,
    rowIndex: number,
  ) => ExcelCellValue
  width?: number
  hidden?: boolean
}

export interface ExcelRowAccessor<TRow> {
  getRowCount(): number
  getRow(index: number): TRow | undefined
  getRowDepth?(index: number): number
}

export interface ExcelMergeRange {
  rowStart: number
  rowEnd: number
  columnStart: number
  columnEnd: number
  /** Data coordinates are shifted by one row when headers are included. */
  coordinates?: 'data' | 'sheet'
}

export interface ExcelExportOptions<TRow> {
  rows: readonly TRow[] | ExcelRowAccessor<TRow>
  columns: readonly ExcelExportColumn<TRow>[]
  fileName?: string
  sheetName?: string
  includeHeader?: boolean
  merges?: readonly ExcelMergeRange[]
  /** Prefixes this column with two spaces per tree level. */
  treeColumnId?: string
  getRowDepth?: (row: TRow, rowIndex: number) => number
  download?: boolean
  /** Cancels materialization between row batches. Workbook serialization is not interruptible. */
  signal?: AbortSignal
  /** Reports cooperative materialization and serialization progress. */
  onProgress?: (progress: ExcelExportProgress) => void
  /** Number of rows processed before yielding to the browser. Defaults to 500. */
  yieldEveryRows?: number
}

export interface ExcelExportProgress {
  phase: 'materializing' | 'serializing' | 'complete'
  completedRows: number
  totalRows: number
}

export interface ExcelExportArtifact {
  blob: Blob
  workbook: unknown
  rowCount: number
  columnCount: number
}

/**
 * Creates an XLSX artifact without touching the DOM. The heavy xlsx module is
 * dynamically imported only when export is requested.
 */
export async function createExcelExport<TRow>(
  options: ExcelExportOptions<TRow>,
): Promise<ExcelExportArtifact> {
  const yieldEveryRows = normalizeYieldEveryRows(options.yieldEveryRows)
  throwIfExportAborted(options.signal)
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const columns = options.columns.filter((column) => !column.hidden)
  const includeHeader = options.includeHeader !== false
  const rowCount = columns.length === 0 ? 0 : getRowCount(options.rows)
  const matrix: SheetData = []
  throwIfExportAborted(options.signal)
  reportProgress(options, 'materializing', 0, rowCount)

  if (includeHeader) {
    matrix.push(columns.map((column) => ({
      value: normalizeExcelText(column.header),
      fontWeight: 'bold',
      backgroundColor: '#F4F7F5',
      textColor: '#36423B',
      height: 28,
    })))
  }

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = getRow(options.rows, rowIndex)
    if (row === undefined) {
      matrix.push(new Array<Cell>(columns.length).fill(null))
    } else {
      const targetRow = new Array<Cell>(columns.length)
      const depth = getDepth(options, row, rowIndex)

      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex]
        if (!column) continue
        const rawValue = column.getValue(row, rowIndex)
        let exportValue = column.getExportValue
          ? column.getExportValue(rawValue, row, rowIndex)
          : rawValue
        if (column.id === options.treeColumnId && depth > 0 && exportValue != null) {
          exportValue = `${'  '.repeat(depth)}${String(exportValue)}`
        }
        targetRow[columnIndex] = normalizeExcelValue(exportValue)
      }
      matrix.push(targetRow)
    }

    const completedRows = rowIndex + 1
    if (completedRows < rowCount && completedRows % yieldEveryRows === 0) {
      reportProgress(options, 'materializing', completedRows, rowCount)
      await yieldToBrowser()
      throwIfExportAborted(options.signal)
    }
  }

  applyMergeSpans(matrix, options.merges, includeHeader)
  throwIfExportAborted(options.signal)
  reportProgress(options, 'serializing', rowCount, rowCount)

  const workbook = writeExcelFile(matrix, {
    sheet: normalizeSheetName(options.sheetName),
    columns: columns.map((column) => column.width === undefined ? {} : { width: column.width }),
    dateFormat: 'yyyy-mm-dd hh:mm:ss',
    stickyRowsCount: includeHeader ? 1 : 0,
    showGridLines: true,
  })
  const blob = await workbook.toBlob()
  throwIfExportAborted(options.signal)
  reportProgress(options, 'complete', rowCount, rowCount)

  return { blob, workbook, rowCount, columnCount: columns.length }
}

export function normalizeExcelValue(value: ExcelCellValue): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  if (value instanceof Date && !Number.isFinite(value.getTime())) return String(value)
  if (typeof value === 'string') return normalizeExcelText(value)
  return value
}

function normalizeExcelText(value: string): string {
  if (value.length > EXCEL_CELL_TEXT_LIMIT) {
    throw new RangeError(
      `Excel cell text exceeds the ${EXCEL_CELL_TEXT_LIMIT.toLocaleString('en-US')}-character limit`,
    )
  }
  return value
}

function applyMergeSpans(
  matrix: SheetData,
  merges: readonly ExcelMergeRange[] | undefined,
  includeHeader: boolean,
): void {
  if (!merges) return
  for (const merge of merges) {
    const headerOffset = merge.coordinates === 'sheet' || !includeHeader ? 0 : 1
    const rowStart = merge.rowStart + headerOffset
    const rowEnd = merge.rowEnd + headerOffset
    const columnStart = merge.columnStart
    const columnEnd = merge.columnEnd
    if (
      rowStart < 0 || columnStart < 0 || rowEnd < rowStart || columnEnd < columnStart ||
      rowStart >= matrix.length || columnStart >= (matrix[rowStart]?.length ?? 0)
    ) continue

    const clippedRowEnd = Math.min(rowEnd, matrix.length - 1)
    const clippedColumnEnd = Math.min(columnEnd, (matrix[rowStart]?.length ?? 1) - 1)
    const anchor = matrix[rowStart]?.[columnStart]
    const anchorObject: CellObject = isCellObject(anchor)
      ? { ...anchor }
      : { value: anchor ?? '' }
    anchorObject.rowSpan = clippedRowEnd - rowStart + 1
    anchorObject.columnSpan = clippedColumnEnd - columnStart + 1
    matrix[rowStart]![columnStart] = anchorObject

    for (let row = rowStart; row <= clippedRowEnd; row += 1) {
      const targetRow = matrix[row]
      if (!targetRow) continue
      for (let column = columnStart; column <= clippedColumnEnd; column += 1) {
        if (row !== rowStart || column !== columnStart) targetRow[column] = null
      }
    }
  }
}

function isCellObject(cell: Cell): cell is CellObject {
  return typeof cell === 'object' && cell !== null && !(cell instanceof Date)
}

export async function exportTableToExcel<TRow>(
  options: ExcelExportOptions<TRow>,
): Promise<ExcelExportArtifact> {
  const artifact = await createExcelExport(options)
  if (options.download !== false) {
    downloadBlob(artifact.blob, ensureExtension(options.fileName ?? 'table-export', '.xlsx'))
  }
  return artifact
}

export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Downloading an export requires a browser environment')
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  try {
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    try {
      anchor.remove()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }
}

function getRowCount<TRow>(source: readonly TRow[] | ExcelRowAccessor<TRow>): number {
  return isRowAccessor(source) ? source.getRowCount() : source.length
}

function normalizeYieldEveryRows(value: number | undefined): number {
  if (value === undefined) return 500
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('yieldEveryRows must be a positive safe integer')
  }
  return value
}

function getRow<TRow>(
  source: readonly TRow[] | ExcelRowAccessor<TRow>,
  index: number,
): TRow | undefined {
  return isRowAccessor(source) ? source.getRow(index) : source[index]
}

function getDepth<TRow>(
  options: ExcelExportOptions<TRow>,
  row: TRow,
  rowIndex: number,
): number {
  if (options.getRowDepth) return Math.max(0, options.getRowDepth(row, rowIndex))
  if (isRowAccessor(options.rows) && options.rows.getRowDepth) {
    return Math.max(0, options.rows.getRowDepth(rowIndex))
  }
  return 0
}

function isRowAccessor<TRow>(
  source: readonly TRow[] | ExcelRowAccessor<TRow>,
): source is ExcelRowAccessor<TRow> {
  return typeof (source as ExcelRowAccessor<TRow>).getRowCount === 'function'
}

function normalizeSheetName(sheetName = 'Table'): string {
  const sanitized = sheetName.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31)
  return sanitized || 'Table'
}

function ensureExtension(fileName: string, extension: string): string {
  return fileName.toLocaleLowerCase().endsWith(extension) ? fileName : `${fileName}${extension}`
}

function reportProgress<TRow>(
  options: ExcelExportOptions<TRow>,
  phase: ExcelExportProgress['phase'],
  completedRows: number,
  totalRows: number,
): void {
  options.onProgress?.({ phase, completedRows, totalRows })
}

function throwIfExportAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  const error = new Error('Excel export was cancelled')
  error.name = 'AbortError'
  throw error
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
