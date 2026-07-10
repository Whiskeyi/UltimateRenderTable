import type { Cell, CellObject, SheetData } from 'write-excel-file/universal'

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
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const columns = options.columns.filter((column) => !column.hidden)
  const includeHeader = options.includeHeader !== false
  const rowCount = getRowCount(options.rows)
  const matrix: SheetData = []

  if (includeHeader) {
    matrix.push(columns.map((column) => ({
      value: column.header,
      fontWeight: 'bold',
      backgroundColor: '#F4F7F5',
      textColor: '#36423B',
      height: 28,
    })))
  }

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = getRow(options.rows, rowIndex)
    if (row === undefined) continue
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

  applyMergeSpans(matrix, options.merges, includeHeader)

  const workbook = writeExcelFile(matrix, {
    sheet: normalizeSheetName(options.sheetName),
    columns: columns.map((column) => column.width === undefined ? {} : { width: column.width }),
    dateFormat: 'yyyy-mm-dd hh:mm:ss',
    stickyRowsCount: includeHeader ? 1 : 0,
    showGridLines: true,
  })
  const blob = await workbook.toBlob()

  return { blob, workbook, rowCount, columnCount: columns.length }
}

function normalizeExcelValue(value: ExcelCellValue): Cell {
  return value === null || value === undefined ? null : value
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
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getRowCount<TRow>(source: readonly TRow[] | ExcelRowAccessor<TRow>): number {
  return isRowAccessor(source) ? source.getRowCount() : source.length
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
