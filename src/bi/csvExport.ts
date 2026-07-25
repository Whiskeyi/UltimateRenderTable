export interface CsvExportOptions<TRow, TColumn> {
  rowStart: number
  rowCount: number
  columnStart: number
  columnCount: number
  getRow: (rowIndex: number) => TRow | undefined
  getColumn: (columnIndex: number) => TColumn
  getColumnHeader: (column: TColumn, columnIndex: number) => unknown
  getCellValue: (
    column: TColumn,
    row: TRow,
    rowIndex: number,
    columnIndex: number,
  ) => unknown
}

/** Materializes column definitions once so wide exports do not churn lazy schema caches. */
export function createCsvText<TRow, TColumn>(
  options: CsvExportOptions<TRow, TColumn>,
): string {
  if (options.columnCount === 0) return '\ufeff'

  const columns = Array.from({ length: options.columnCount }, (_, localIndex) => (
    options.getColumn(localIndex + options.columnStart)
  ))
  const lines = new Array<string>(options.rowCount + 1)
  lines[0] = columns.map((column, localIndex) => serializeCsvValue(
    options.getColumnHeader(column, localIndex + options.columnStart),
  )).join(',')
  const emptyRow = new Array<string>(columns.length).fill('').join(',')

  for (let localRowIndex = 0; localRowIndex < options.rowCount; localRowIndex += 1) {
    const rowIndex = localRowIndex + options.rowStart
    const row = options.getRow(rowIndex)
    lines[localRowIndex + 1] = row === undefined
      ? emptyRow
      : columns.map((column, localColumnIndex) => serializeCsvValue(
          options.getCellValue(
            column,
            row,
            rowIndex,
            localColumnIndex + options.columnStart,
          ),
        )).join(',')
  }

  return `\ufeff${lines.join('\r\n')}`
}

export function serializeCsvValue(value: unknown): string {
  const text = value == null
    ? ''
    : value instanceof Date
      ? value.toLocaleString()
      : String(value)
  const protectedText = typeof value === 'string'
    && /^[\u0000-\u0020\u007f-\u009f\ufeff]*[=+\-@]/.test(text)
    ? `'${text}`
    : text
  return /[",\r\n]/.test(protectedText)
    ? `"${protectedText.replace(/"/g, '""')}"`
    : protectedText
}

export function ensureCsvFileName(fileName: string): string {
  return fileName.toLocaleLowerCase().endsWith('.csv') ? fileName : `${fileName}.csv`
}
