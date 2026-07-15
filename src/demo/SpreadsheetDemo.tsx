import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  DollarSign,
  FunctionSquare,
  Italic,
  PaintBucket,
  Percent,
  RotateCcw,
  Underline,
  WrapText,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import type { CellRange, ViewportSnapshot } from '@ultigrid/core'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightCellVisualStyle,
  type InsightColumnDefinition,
  type UltiGridInsightApi,
  type UltiGridInsightLocaleText,
} from '@ultigrid/insight'
import { translate, type Locale } from '../i18n'

interface SheetRow {
  id: number
  index: number
}

type CellValue = string | number
type HorizontalAlign = 'left' | 'center' | 'right'
type NumberFormat = 'general' | 'number' | 'currency' | 'percent'

interface CellFormat {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fill?: string
  align?: HorizontalAlign
  wrap?: boolean
  numberFormat?: NumberFormat
}

interface SpreadsheetDemoProps {
  locale: Locale
  apiRef: { current: UltiGridInsightApi | null }
  localeText: UltiGridInsightLocaleText
  onViewportChange: (snapshot: ViewportSnapshot) => void
}

const ROW_COUNT = 200
const COLUMN_COUNT = 26
const DEFAULT_SELECTION: CellRange = {
  rowStart: 2,
  rowEnd: 2,
  columnStart: 4,
  columnEnd: 4,
}
const SHEET_ROWS: readonly SheetRow[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index,
  index,
}))
const COLUMN_WIDTHS = new Map<number, number>([
  [0, 118], [1, 156], [2, 118], [3, 116], [4, 116], [5, 118], [6, 102], [7, 112],
])

export function SpreadsheetDemo({
  locale,
  apiRef,
  localeText,
  onViewportChange,
}: SpreadsheetDemoProps) {
  const [selection, setSelection] = useState<CellRange | null>(DEFAULT_SELECTION)
  const [values, setValues] = useState<Map<string, CellValue>>(() => createInitialValues(locale))
  const [formats, setFormats] = useState<Map<string, CellFormat>>(() => createInitialFormats())
  const [revision, setRevision] = useState(0)
  const [formulaDraft, setFormulaDraft] = useState('')
  const activeCell = selection
    ? { row: selection.rowStart, column: selection.columnStart }
    : { row: 0, column: 0 }
  const activeKey = cellKey(activeCell.row, activeCell.column)
  const activeFormat = formats.get(activeKey) ?? {}

  const getCellValue = useCallback((row: number, column: number): CellValue => (
    values.get(cellKey(row, column)) ?? ''
  ), [values])

  useEffect(() => {
    setFormulaDraft(String(getCellValue(activeCell.row, activeCell.column)))
  }, [activeCell.column, activeCell.row, getCellValue])

  useEffect(() => {
    setValues(createInitialValues(locale))
    setFormats(createInitialFormats())
    setRevision((current) => current + 1)
  }, [locale])

  const applyFormat = useCallback((patch: Partial<CellFormat>) => {
    if (!selection) return
    setFormats((current) => {
      const next = new Map(current)
      for (let row = selection.rowStart; row <= selection.rowEnd; row += 1) {
        for (let column = selection.columnStart; column <= selection.columnEnd; column += 1) {
          const key = cellKey(row, column)
          next.set(key, { ...next.get(key), ...patch })
        }
      }
      return next
    })
    setRevision((current) => current + 1)
  }, [selection])

  const clearFormat = useCallback(() => {
    if (!selection) return
    setFormats((current) => {
      const next = new Map(current)
      for (let row = selection.rowStart; row <= selection.rowEnd; row += 1) {
        for (let column = selection.columnStart; column <= selection.columnEnd; column += 1) {
          next.delete(cellKey(row, column))
        }
      }
      return next
    })
    setRevision((current) => current + 1)
  }, [selection])

  const commitFormula = useCallback(() => {
    const trimmed = formulaDraft.trim()
    const parsed = trimmed !== '' && !trimmed.startsWith('=') && Number.isFinite(Number(trimmed))
      ? Number(trimmed)
      : formulaDraft
    setValues((current) => {
      const next = new Map(current)
      next.set(activeKey, parsed)
      return next
    })
    setRevision((current) => current + 1)
  }, [activeKey, formulaDraft])

  const columns = useMemo<readonly InsightColumnDefinition<SheetRow>[]>(() => (
    Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => defineInsightColumn<SheetRow, CellValue>({
      id: `column-${columnIndex}`,
      header: <span className="spreadsheet-column-label">{columnName(columnIndex)}</span>,
      headerText: columnName(columnIndex),
      width: COLUMN_WIDTHS.get(columnIndex) ?? 96,
      minWidth: 54,
      getValue: (row) => getCellValue(row.index, columnIndex),
      formatValue: (value, row) => formatCellValue(
        value,
        formats.get(cellKey(row.index, columnIndex))?.numberFormat
          ?? defaultNumberFormat(row.index, columnIndex),
        locale,
      ),
      visualStyle: ({ row }) => resolveCellStyle(
        row.index,
        columnIndex,
        formats.get(cellKey(row.index, columnIndex)),
      ),
      renderContent: ({ rowIndex, displayValue, value }) => {
        if (rowIndex === 0 && columnIndex === 0) {
          return (
            <span className="spreadsheet-title-cell">
              <strong>{displayValue}</strong>
              <small>{translate(locale, 'spreadsheet.sheet.subtitle')}</small>
            </span>
          )
        }
        if (rowIndex >= 2 && rowIndex <= 13 && columnIndex === 5 && typeof value === 'number') {
          return (
            <span className="spreadsheet-progress-cell">
              <span><i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></span>
              <strong>{displayValue}</strong>
            </span>
          )
        }
        if (rowIndex >= 2 && rowIndex <= 13 && columnIndex === 7) {
          return <span className={`spreadsheet-status spreadsheet-status--${rowIndex % 3}`}>{displayValue}</span>
        }
        if (typeof value === 'string' && value.startsWith('=')) {
          return <span className="spreadsheet-formula-value">{displayValue}</span>
        }
        return displayValue
      },
    }))
  ), [formats, getCellValue, locale])

  return (
    <section className="spreadsheet-demo" aria-label={translate(locale, 'scenario.spreadsheet')}>
      <div className="spreadsheet-menu" role="tablist" aria-label={translate(locale, 'spreadsheet.toolbar.tabs')}>
        {(['file', 'home', 'insert', 'formulas', 'data', 'view'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === 'home'}
            className={tab === 'home' ? 'is-active' : undefined}
          >
            {translate(locale, `spreadsheet.tab.${tab}`)}
          </button>
        ))}
        <span className="spreadsheet-autosave"><i /> {translate(locale, 'spreadsheet.saved')}</span>
      </div>

      <div className="spreadsheet-ribbon" role="toolbar" aria-label={translate(locale, 'spreadsheet.toolbar.label')}>
        <div className="spreadsheet-ribbon-group spreadsheet-font-group">
          <label>
            <span className="sr-only">{translate(locale, 'spreadsheet.font')}</span>
            <select
              value={activeFormat.fontFamily ?? 'Aptos'}
              onChange={(event) => applyFormat({ fontFamily: event.target.value })}
            >
              <option>Aptos</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Menlo</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <label className="spreadsheet-size-select">
            <span className="sr-only">{translate(locale, 'spreadsheet.fontSize')}</span>
            <select
              value={activeFormat.fontSize ?? 12}
              onChange={(event) => applyFormat({ fontSize: Number(event.target.value) })}
            >
              {[10, 11, 12, 14, 16, 18, 24].map((size) => <option key={size}>{size}</option>)}
            </select>
            <ChevronDown size={12} />
          </label>
          <ToolbarButton
            label={translate(locale, 'spreadsheet.bold')}
            active={activeFormat.bold}
            onClick={() => applyFormat({ bold: !activeFormat.bold })}
          ><Bold size={15} /></ToolbarButton>
          <ToolbarButton
            label={translate(locale, 'spreadsheet.italic')}
            active={activeFormat.italic}
            onClick={() => applyFormat({ italic: !activeFormat.italic })}
          ><Italic size={15} /></ToolbarButton>
          <ToolbarButton
            label={translate(locale, 'spreadsheet.underline')}
            active={activeFormat.underline}
            onClick={() => applyFormat({ underline: !activeFormat.underline })}
          ><Underline size={15} /></ToolbarButton>
        </div>

        <div className="spreadsheet-ribbon-group">
          <ColorControl
            label={translate(locale, 'spreadsheet.textColor')}
            value={activeFormat.color ?? '#202124'}
            onChange={(color) => applyFormat({ color })}
          />
          <ColorControl
            fill
            label={translate(locale, 'spreadsheet.fillColor')}
            value={activeFormat.fill ?? '#ffffff'}
            onChange={(fill) => applyFormat({ fill })}
          />
        </div>

        <div className="spreadsheet-ribbon-group">
          <ToolbarButton label={translate(locale, 'spreadsheet.alignLeft')} active={activeFormat.align === 'left'} onClick={() => applyFormat({ align: 'left' })}><AlignLeft size={15} /></ToolbarButton>
          <ToolbarButton label={translate(locale, 'spreadsheet.alignCenter')} active={activeFormat.align === 'center'} onClick={() => applyFormat({ align: 'center' })}><AlignCenter size={15} /></ToolbarButton>
          <ToolbarButton label={translate(locale, 'spreadsheet.alignRight')} active={activeFormat.align === 'right'} onClick={() => applyFormat({ align: 'right' })}><AlignRight size={15} /></ToolbarButton>
          <ToolbarButton label={translate(locale, 'spreadsheet.wrap')} active={activeFormat.wrap} onClick={() => applyFormat({ wrap: !activeFormat.wrap })}><WrapText size={15} /></ToolbarButton>
        </div>

        <div className="spreadsheet-ribbon-group">
          <ToolbarButton label={translate(locale, 'spreadsheet.currency')} active={activeFormat.numberFormat === 'currency'} onClick={() => applyFormat({ numberFormat: 'currency' })}><DollarSign size={15} /></ToolbarButton>
          <ToolbarButton label={translate(locale, 'spreadsheet.percent')} active={activeFormat.numberFormat === 'percent'} onClick={() => applyFormat({ numberFormat: 'percent' })}><Percent size={15} /></ToolbarButton>
          <button type="button" className="spreadsheet-number-button" onClick={() => applyFormat({ numberFormat: 'number' })}>.00</button>
        </div>

        <div className="spreadsheet-ribbon-group">
          <ToolbarButton label={translate(locale, 'spreadsheet.clearFormat')} onClick={clearFormat}><RotateCcw size={15} /></ToolbarButton>
        </div>
      </div>

      <div className="spreadsheet-formula-bar">
        <output aria-label={translate(locale, 'spreadsheet.nameBox')}>{selectionLabel(selection)}</output>
        <span aria-hidden="true"><FunctionSquare size={15} /></span>
        <input
          value={formulaDraft}
          aria-label={translate(locale, 'spreadsheet.formulaBar')}
          onChange={(event) => setFormulaDraft(event.target.value)}
          onBlur={commitFormula}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitFormula()
            }
            if (event.key === 'Escape') setFormulaDraft(String(getCellValue(activeCell.row, activeCell.column)))
          }}
        />
      </div>

      <div className="spreadsheet-grid">
        <UltiGridInsight
          rows={SHEET_ROWS}
          columns={columns}
          mergedCells={[{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 7 }]}
          rowHeights={new Map([[0, 46], [1, 32], [14, 34]])}
          columnWidths={COLUMN_WIDTHS}
          defaultRowHeight={30}
          defaultColumnWidth={96}
          frozen={{ top: 2, left: 0 }}
          overscan={{ rows: 4, columns: 2 }}
          showHeader
          showRowNumbers
          showGridLines
          stripedRows={false}
          fitColumns="none"
          selection={selection}
          onSelectionChange={setSelection}
          onViewportChange={onViewportChange}
          columnResize
          contentVersion={revision}
          apiRef={apiRef}
          themeColor="#217346"
          localeText={localeText}
          ariaLabel={translate(locale, 'spreadsheet.gridLabel')}
        />
      </div>

      <footer className="spreadsheet-sheet-tabs">
        <button type="button" aria-label={translate(locale, 'spreadsheet.addSheet')}>＋</button>
        <button type="button" className="is-active">{translate(locale, 'spreadsheet.sheetName')}</button>
        <span />
        <small>{translate(locale, 'spreadsheet.status.summary')}</small>
      </footer>
    </section>
  )
}

function ToolbarButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={active ? 'is-active' : undefined}
      aria-pressed={active}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ColorControl({
  label,
  value,
  fill = false,
  onChange,
}: {
  label: string
  value: string
  fill?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="spreadsheet-color-control" title={label}>
      {fill ? <PaintBucket size={15} /> : <span className="spreadsheet-font-color">A</span>}
      <i style={{ backgroundColor: value }} />
      <input type="color" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function createInitialValues(locale: Locale): Map<string, CellValue> {
  const zh = locale === 'zh-CN'
  const values = new Map<string, CellValue>()
  const set = (row: number, column: number, value: CellValue) => values.set(cellKey(row, column), value)
  set(0, 0, zh ? '2026 销售计划与实际跟踪' : '2026 Sales Plan & Actual Tracker')
  const headers = zh
    ? ['区域', '产品线', '负责人', '销售目标', '实际收入', '完成率', '同比增长', '状态']
    : ['Region', 'Product', 'Owner', 'Target', 'Actual', 'Progress', 'YoY', 'Status']
  headers.forEach((header, column) => set(1, column, header))

  const regions = zh
    ? ['华东', '华南', '华北', '西南', '东北', '海外']
    : ['East', 'South', 'North', 'Southwest', 'Northeast', 'Overseas']
  const products = ['Cloud One', 'Atlas Pro', 'Nova BI', 'Pulse CRM']
  const owners = zh
    ? ['林一', '周宁', '秦月', '陈屿', '苏禾', '顾言']
    : ['Lynn', 'Noah', 'Quinn', 'Cody', 'Sofia', 'Gavin']
  const statuses = zh ? ['正常', '超预期', '关注'] : ['On track', 'Ahead', 'Watch']
  for (let index = 0; index < 12; index += 1) {
    const row = index + 2
    const target = 680_000 + index * 55_000
    const progress = 0.68 + ((index * 13) % 43) / 100
    set(row, 0, regions[index % regions.length]!)
    set(row, 1, products[index % products.length]!)
    set(row, 2, owners[index % owners.length]!)
    set(row, 3, target)
    set(row, 4, Math.round(target * progress))
    set(row, 5, progress)
    set(row, 6, -0.08 + ((index * 7) % 27) / 100)
    set(row, 7, statuses[index % statuses.length]!)
  }
  set(14, 0, zh ? '合计 / 平均' : 'Total / average')
  set(14, 3, 11_790_000)
  set(14, 4, 10_426_450)
  set(14, 5, 0.8843)
  set(14, 6, 0.127)
  set(16, 0, zh ? '提示：选择任意单元格后，可使用上方工具栏实时调整格式；公式栏支持直接修改值。' : 'Tip: select cells to format them from the ribbon; edit values directly in the formula bar.')
  return values
}

function createInitialFormats(): Map<string, CellFormat> {
  return new Map([
    [cellKey(0, 0), { fontSize: 16, bold: true, color: '#173b2a', fill: '#e7f4eb' }],
    ...Array.from({ length: 8 }, (_, column) => [
      cellKey(1, column),
      { bold: true, color: '#ffffff', fill: '#217346', align: column >= 3 ? 'right' as const : 'left' as const },
    ] as [string, CellFormat]),
    ...Array.from({ length: 8 }, (_, column) => [
      cellKey(14, column),
      { bold: true, fill: '#edf4ef', align: column >= 3 ? 'right' as const : 'left' as const },
    ] as [string, CellFormat]),
  ])
}

function resolveCellStyle(row: number, column: number, format?: CellFormat): InsightCellVisualStyle {
  const base: InsightCellVisualStyle = {
    color: '#202124',
    fontFamily: 'Aptos, Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: 12,
    horizontalAlign: column >= 3 && column <= 6 ? 'right' : 'left',
    paddingInline: 8,
  }
  if (row > 14) base.color = '#5f6368'
  if (!format) return base
  return {
    ...base,
    color: format.color ?? base.color,
    backgroundColor: format.fill,
    fontFamily: format.fontFamily ? `${format.fontFamily}, Inter, sans-serif` : base.fontFamily,
    fontSize: format.fontSize ?? base.fontSize,
    fontWeight: format.bold ? 700 : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
    textDecoration: format.underline ? 'underline' : undefined,
    horizontalAlign: format.align ?? base.horizontalAlign,
    wrap: format.wrap,
  }
}

function defaultNumberFormat(row: number, column: number): NumberFormat {
  if (row >= 2 && column >= 3 && column <= 4) return 'currency'
  if (row >= 2 && column >= 5 && column <= 6) return 'percent'
  return 'general'
}

function formatCellValue(value: CellValue, format: NumberFormat, locale: Locale): string {
  if (typeof value !== 'number') return String(value)
  if (format === 'currency') {
    return Intl.NumberFormat(locale, {
      style: 'currency',
      currency: locale === 'zh-CN' ? 'CNY' : 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'number') return Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  return Intl.NumberFormat(locale).format(value)
}

function selectionLabel(selection: CellRange | null): string {
  if (!selection) return 'A1'
  const start = `${columnName(selection.columnStart)}${selection.rowStart + 1}`
  const end = `${columnName(selection.columnEnd)}${selection.rowEnd + 1}`
  return start === end ? start : `${start}:${end}`
}

function columnName(index: number): string {
  let result = ''
  let cursor = index + 1
  while (cursor > 0) {
    cursor -= 1
    result = String.fromCharCode(65 + (cursor % 26)) + result
    cursor = Math.floor(cursor / 26)
  }
  return result
}

function cellKey(row: number, column: number): string {
  return `${row}:${column}`
}
