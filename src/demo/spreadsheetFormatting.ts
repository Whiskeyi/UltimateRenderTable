import type {
  CellAddress,
  CellRange,
  InsightCellVisualStyle,
} from '@ultigrid/insight'
import {
  cellKey,
  type SpreadsheetCellValue,
  type SpreadsheetNumberFormat,
} from './spreadsheetModel'
import type { CellFormat, HorizontalAlign } from './spreadsheetWorkbook'

export interface ResolvedCellFormat {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  fill: string
  align: HorizontalAlign
  wrap: boolean
  numberFormat: SpreadsheetNumberFormat
}

const FORMAT_KEYS: readonly (keyof ResolvedCellFormat)[] = [
  'fontFamily',
  'fontSize',
  'bold',
  'italic',
  'underline',
  'color',
  'fill',
  'align',
  'wrap',
  'numberFormat',
]

export function getEffectiveFormat(
  row: number,
  column: number,
  format?: CellFormat,
): ResolvedCellFormat {
  return {
    fontFamily: format?.fontFamily ?? 'Aptos',
    fontSize: format?.fontSize ?? 12,
    bold: format?.bold ?? false,
    italic: format?.italic ?? false,
    underline: format?.underline ?? false,
    color: format?.color ?? (row > 14 ? '#5f6368' : '#202124'),
    fill: format?.fill ?? '#ffffff',
    align: format?.align ?? (column >= 3 && column <= 6 ? 'right' : 'left'),
    wrap: format?.wrap ?? false,
    numberFormat: format?.numberFormat ?? defaultNumberFormat(row, column),
  }
}

export function summarizeFormats(
  range: CellRange,
  activeCell: CellAddress,
  formats: ReadonlyMap<string, CellFormat>,
): {
  format: ResolvedCellFormat
  mixed: ReadonlySet<keyof ResolvedCellFormat>
} {
  const base = rangeContainsAddress(range, activeCell)
    ? activeCell
    : { row: range.rowStart, column: range.columnStart }
  const format = getEffectiveFormat(
    base.row,
    base.column,
    formats.get(cellKey(base.row, base.column)),
  )
  const mixed = new Set<keyof ResolvedCellFormat>()
  forEachRangeCell(range, (row, column) => {
    const candidate = getEffectiveFormat(row, column, formats.get(cellKey(row, column)))
    for (const key of FORMAT_KEYS) {
      if (candidate[key] !== format[key]) mixed.add(key)
    }
  })
  return { format, mixed }
}

export function resolveCellStyle(
  row: number,
  column: number,
  value: SpreadsheetCellValue,
  format: ResolvedCellFormat,
  scale: number,
): InsightCellVisualStyle {
  const style: InsightCellVisualStyle = {
    color: format.color,
    backgroundColor: format.fill,
    fontFamily: `${format.fontFamily}, Inter, ui-sans-serif, system-ui, sans-serif`,
    fontSize: Math.max(8, format.fontSize * scale),
    fontWeight: format.bold ? 700 : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
    textDecoration: format.underline ? 'underline' : undefined,
    horizontalAlign: format.align,
    wrap: format.wrap,
    paddingInline: 8,
  }
  if (row >= 2 && row <= 13 && column === 6 && typeof value === 'number') {
    style.color = value < 0 ? '#b42318' : '#18794e'
    style.fontWeight = 650
  }
  return style
}

export function statusTone(value: string): 'track' | 'ahead' | 'watch' {
  const normalized = value.toLowerCase()
  if (normalized.includes('ahead') || normalized.includes('超预期')) return 'ahead'
  if (
    normalized.includes('watch')
    || normalized.includes('关注')
    || normalized.includes('风险')
  ) return 'watch'
  return 'track'
}

function defaultNumberFormat(row: number, column: number): SpreadsheetNumberFormat {
  if (row >= 2 && column >= 3 && column <= 4) return 'currency'
  if (row >= 2 && column >= 5 && column <= 6) return 'percent'
  return 'general'
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

function rangeContainsAddress(range: CellRange, address: CellAddress): boolean {
  return address.row >= range.rowStart && address.row <= range.rowEnd
    && address.column >= range.columnStart && address.column <= range.columnEnd
}
