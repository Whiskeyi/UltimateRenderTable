import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  UltiGridViewport,
  type ApiRef,
  type AutoSizeOptions,
  type CellAddress,
  type CellRange,
  type ColumnResizeChange as CoreColumnResizeChange,
  type ColumnResizeInput,
  type ColumnResizeOptions,
  type ColumnResizePhase,
  type FitColumnsMode,
  type FrozenEdges,
  type MergedCellRange,
  type MobileInteractionOptions,
  type OverscanOptions,
  type UltiGridViewportApi,
  type ViewportCellAlign,
  type ViewportSnapshot,
} from '@ultigrid/core'
import { InsightCell } from './InsightCell.js'
import {
  compileConditionalFormatting,
  type CompiledConditionalFormatter,
  type ConditionalFormatRule,
} from './conditionalFormatting.js'
import { downloadBlob, exportTableToExcel } from './excelExport.js'
import { exportTableToImage } from './imageExport.js'
import {
  buildInsightViewportColumnWidths,
  resolveInsightColumnWidth,
} from './columnLayout.js'
import {
  dataAddressToViewport,
  viewportSnapshotToData,
} from './coordinates.js'
import { useInsightSelectionAdapter } from './interactionAdapter.js'
import {
  buildAdjacentMerges,
  type AdjacentMergeOptions,
} from './adjacentMerge.js'
import type { InsightRowModel, RowMeta } from './rowModel.js'
import type {
  InsightCellIcon,
  InsightCellImage,
  InsightCellComponent,
  InsightCellRenderFunction,
  InsightCellVisualStyle,
  InsightCellContext,
  InsightCellValue,
  InsightRowId,
} from './types.js'

export interface InsightColumn<TRow, TValue = InsightCellValue> {
  id: string
  header?: ReactNode
  headerText?: string
  /** Applied automatically for materialized columns; lazy sources should use columnWidths/getColumnWidth. */
  width?: number
  /** Excludes this column from direct header resizing when false. */
  resizable?: boolean
  /** Per-column resize floor in CSS pixels. */
  minWidth?: number
  /** Per-column resize ceiling in CSS pixels. */
  maxWidth?: number
  getValue: (row: TRow, rowIndex: number) => TValue
  formatValue?: (value: TValue, row: TRow, rowIndex: number) => string
  visualStyle?: InsightCellVisualStyle | ((context: InsightCellContext<TRow, TValue>) => InsightCellVisualStyle)
  image?: InsightCellImage | ((context: InsightCellContext<TRow, TValue>) => InsightCellImage | undefined)
  icon?: InsightCellIcon | ((context: InsightCellContext<TRow, TValue>) => InsightCellIcon | undefined)
  component?: InsightCellComponent<TRow, TValue>
  renderContent?: InsightCellRenderFunction<TRow, TValue>
  conditionalRules?: readonly ConditionalFormatRule<TRow, TValue>[]
  className?: string
  exportValue?: (value: TValue, row: TRow, rowIndex: number) => InsightCellValue
}

/** A heterogeneous column slot; each column may keep its own TValue through defineInsightColumn. */
export type InsightColumnDefinition<TRow> = InsightColumn<TRow, any>

export type InsightColumnWidthConstraint<TRow> = number | ((
  column: InsightColumnDefinition<TRow>,
  columnIndex: number,
) => number)

export interface InsightColumnResizeOptions<TRow> {
  isColumnResizable?: (column: InsightColumnDefinition<TRow>, columnIndex: number) => boolean
  minWidth?: InsightColumnWidthConstraint<TRow>
  maxWidth?: InsightColumnWidthConstraint<TRow>
  keyboardStep?: number
  /** Touch requires a stationary long press before resizing. Defaults to 280ms; use 0 for immediate activation. */
  touchActivationDelay?: number
  getHandleAriaLabel?: (column: InsightColumnDefinition<TRow>, columnIndex: number) => string
}

export interface InsightColumnResizeChange {
  /** Zero-based data-column coordinate; row-number chrome is excluded. */
  columnIndex: number
  columnId: string
  width: number
  previousWidth: number
  phase: ColumnResizePhase
  input: ColumnResizeInput
}

/** Touch interaction configuration exposed by the application-grid package. */
export type InsightMobileInteractionOptions = MobileInteractionOptions

export interface LazyRowSource<TRow> {
  rowCount: number
  getRow: (index: number) => TRow
  getRowId?: (row: TRow, index: number) => InsightRowId
  getRowMeta?: (index: number, target?: RowMeta) => RowMeta | undefined
}

export interface UltiGridInsightApi {
  scrollToCell(address: CellAddress, align?: ViewportCellAlign): void
  copySelection(): Promise<string>
  getSelection(): CellRange | null
  exportExcel(fileName?: string, range?: InsightExportRange): Promise<void>
  exportImage(fileName?: string): Promise<void>
  exportCsv(fileName?: string, range?: InsightExportRange): void
}

export interface InsightExportRange {
  /** Inclusive, zero-based data coordinates; headers and row numbers are excluded. */
  rowStart?: number
  rowEnd?: number
  columnStart?: number
  columnEnd?: number
}

/** Visible window in zero-based data coordinates; table chrome is excluded. */
export interface InsightViewportSnapshot extends ViewportSnapshot {}

export interface UltiGridInsightLocaleText {
  expandRow: string
  collapseRow: string
  nodeLoadError: string
  tableNotMounted: string
  excelColumnLimit: string
  excelRowLimit: string
  exportCellLimitInvalid: string
  exportRangeTooLarge: (count: string, limit: string) => string
  copySelection: string
  copySuccess: string
  copyError: string
  selectionHandle: string
  selectionActions: string
  resizeColumn: (column: string) => string
}

export type InsightRowsProps<TRow> =
  | {
      rows: readonly TRow[]
      rowSource?: never
      rowModel?: never
      getRowId?: (row: TRow, index: number) => InsightRowId
    }
  | {
      rows?: never
      rowSource: LazyRowSource<TRow>
      rowModel?: never
      getRowId?: (row: TRow, index: number) => InsightRowId
    }
  | {
      rows?: never
      rowSource?: never
      rowModel: InsightRowModel<TRow>
      getRowId?: never
    }

export type InsightColumnsProps<TRow> =
  | {
      columns: readonly InsightColumnDefinition<TRow>[]
      columnCount?: never
      getColumn?: never
      getColumnWidth?: never
    }
  | {
      columns?: never
      columnCount: number
      getColumn: (index: number) => InsightColumnDefinition<TRow>
      /** Optional lazy width resolver. For very wide tables, prefer columnWidths Map. */
      getColumnWidth?: (index: number) => number | undefined
    }

export interface UltiGridInsightBaseProps<TRow> {
  mergedCells?: readonly MergedCellRange[]
  /** Generates vertical data-column merges; explicit mergedCells remain authoritative. */
  mergeAdjacent?: false | AdjacentMergeOptions<TRow>
  conditionalRules?: readonly ConditionalFormatRule<TRow>[]
  defaultRowHeight?: number
  defaultColumnWidth?: number
  rowHeights?: ReadonlyMap<number, number>
  columnWidths?: ReadonlyMap<number, number>
  frozen?: FrozenEdges
  overscan?: OverscanOptions
  fitColumns?: FitColumnsMode
  autoSize?: boolean | AutoSizeOptions
  /** Increment after mutating data or column styles behind stable source/getter references. */
  contentVersion?: string | number
  /** Re-reads a stable lazy-column schema and resets measured/manual widths. */
  columnLayoutVersion?: string | number
  showHeader?: boolean
  showRowNumbers?: boolean
  stripedRows?: boolean
  showGridLines?: boolean
  treeColumnId?: string
  onToggleRow?: (rowId: InsightRowId, expanded: boolean) => void | Promise<void>
  onToggleError?: (error: unknown, rowId: InsightRowId) => void
  /** Controlled selection in zero-based data coordinates; headers and row numbers are excluded. */
  selection?: CellRange | null
  onSelectionChange?: (range: CellRange | null) => void
  onViewportChange?: (snapshot: InsightViewportSnapshot) => void
  /** Touch-first pan, tap selection, range handle, and safe-area copy affordances. */
  mobileInteraction?: boolean | InsightMobileInteractionOptions
  /** Direct header resizing in data-column coordinates. Enabled when a header is shown. */
  columnResize?: boolean | InsightColumnResizeOptions<TRow>
  onColumnResize?: (change: InsightColumnResizeChange) => void
  iconResolver?: (icon: InsightCellIcon) => ReactNode
  /** Client-side materialization guard. Use a backend stream for larger exports. */
  exportCellLimit?: number
  apiRef?: ApiRef<UltiGridInsightApi>
  /** Accent shared with the Core viewport selection and focus states. */
  themeColor?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  emptyContent?: ReactNode
  localeText?: Partial<UltiGridInsightLocaleText>
}

export type UltiGridInsightProps<TRow> = UltiGridInsightBaseProps<TRow>
  & InsightRowsProps<TRow>
  & InsightColumnsProps<TRow>

export function defineInsightColumn<TRow, TValue = InsightCellValue>(
  column: InsightColumn<TRow, TValue>,
): InsightColumn<TRow, TValue> {
  return column
}

interface DataMeta<TRow> {
  kind: 'data'
  row: TRow
  rowId: InsightRowId
  rowIndex: number
  column: InsightColumn<TRow>
  columnIndex: number
  rowMeta?: RowMeta
  plain: boolean
  plainWrap: boolean
}

type PlainSurfaceStyle = CSSProperties & {
  '--ultigrid-insight-cell-align-x': string
  '--ultigrid-insight-cell-align-y': string
  '--ultigrid-insight-cell-padding-block': string
  '--ultigrid-insight-cell-padding-inline': string
}

interface HeaderMeta<TRow> {
  kind: 'header'
  column?: InsightColumn<TRow>
  columnIndex: number
  rowNumber: boolean
}

interface RowNumberMeta {
  kind: 'rowNumber'
  rowIndex: number
}

type InsightMeta<TRow> = DataMeta<TRow> | HeaderMeta<TRow> | RowNumberMeta

const BUILTIN_ICONS: Record<string, LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  check: CircleCheck,
  warning: CircleAlert,
  neutral: CircleMinus,
}

const EMPTY_MERGED_CELLS = Object.freeze([]) as readonly MergedCellRange[]
const EMPTY_CONDITIONAL_RULES = Object.freeze([]) as readonly ConditionalFormatRule<unknown, unknown>[]
const DEFAULT_EXPORT_CELL_LIMIT = 1_000_000
const DEFAULT_LOCALE_TEXT: UltiGridInsightLocaleText = {
  expandRow: 'Expand row',
  collapseRow: 'Collapse row',
  nodeLoadError: 'Node failed to load',
  tableNotMounted: 'The grid is not mounted',
  excelColumnLimit: 'An Excel worksheet supports at most 16,384 columns. Reduce the export range.',
  excelRowLimit: 'The export exceeds Excel’s 1,048,576-row worksheet limit after adding the header.',
  exportCellLimitInvalid: 'exportCellLimit must be a positive safe integer',
  exportRangeTooLarge: (count, limit) => (
    `The export contains ${count} cells, above the client limit of ${limit}. Use a smaller range or a streaming backend.`
  ),
  copySelection: 'Copy',
  copySuccess: 'Copied',
  copyError: 'Copy failed',
  selectionHandle: 'Drag to extend selection',
  selectionActions: 'Selection actions',
  resizeColumn: (column) => `Resize column ${column}`,
}

export function UltiGridInsight<TRow>(props: UltiGridInsightProps<TRow>) {
  const {
    rows,
    rowSource,
    rowModel,
    getRowId,
    columns,
    columnCount: requestedColumnCount,
    getColumn: getLazyColumn,
    getColumnWidth: getLazyColumnWidth,
    mergedCells = EMPTY_MERGED_CELLS,
    mergeAdjacent,
    conditionalRules,
    defaultRowHeight = 34,
    defaultColumnWidth = 136,
    rowHeights,
    columnWidths,
    frozen,
    overscan,
    fitColumns = 'stretch',
    autoSize,
    contentVersion,
    columnLayoutVersion,
    showHeader = true,
    showRowNumbers = true,
    stripedRows = false,
    showGridLines = true,
    treeColumnId,
    onToggleRow,
    onToggleError,
    selection,
    onSelectionChange,
    onViewportChange,
    mobileInteraction,
    columnResize = true,
    onColumnResize,
    iconResolver = defaultIconResolver,
    exportCellLimit = DEFAULT_EXPORT_CELL_LIMIT,
    apiRef,
    themeColor,
    className,
    style,
    ariaLabel = 'UltiGrid Insight',
    emptyContent,
    localeText,
  } = props

  const messages = useMemo(
    () => ({ ...DEFAULT_LOCALE_TEXT, ...localeText }),
    [localeText],
  )
  const effectiveMobileInteraction = useMemo<boolean | MobileInteractionOptions>(() => {
    if (mobileInteraction === false) return false
    const labels = {
      copySelection: messages.copySelection,
      copySuccess: messages.copySuccess,
      copyError: messages.copyError,
      selectionHandle: messages.selectionHandle,
      selectionActions: messages.selectionActions,
    }
    if (mobileInteraction === true) return { mode: 'always', labels }
    return {
      ...(mobileInteraction ?? {}),
      mode: mobileInteraction?.mode ?? 'auto',
      labels: { ...labels, ...mobileInteraction?.labels },
    }
  }, [messages, mobileInteraction])

  const shellRef = useRef<HTMLDivElement>(null)
  const viewportApiRef = useRef<UltiGridViewportApi | null>(null)
  const [modelVersion, setModelVersion] = useState(rowModel?.version ?? 0)
  const activeConditionalRules = (conditionalRules ?? EMPTY_CONDITIONAL_RULES) as readonly ConditionalFormatRule<TRow, InsightCellValue>[]
  const columnCache = useMemo(
    () => new Map<number, InsightColumn<TRow>>(),
    [columns, getLazyColumn, columnLayoutVersion],
  )
  const formatterCache = useMemo(
    () => new WeakMap<InsightColumn<TRow>, CompiledConditionalFormatter<TRow, InsightCellValue>>(),
    [columns, getLazyColumn, activeConditionalRules],
  )
  const plainSurfaceStyleCache = useMemo(
    () => new WeakMap<InsightColumn<TRow>, PlainSurfaceStyle>(),
    [columns, getLazyColumn, contentVersion],
  )
  const rowCache = useMemo(() => new Map<number, TRow>(), [rowModel, rowSource, rows, modelVersion])
  const rowMetaCache = useMemo(
    () => new Map<number, RowMeta>(),
    [rowModel, rowSource, modelVersion],
  )

  useEffect(() => {
    if (!rowModel) return
    setModelVersion(rowModel.version)
    return rowModel.subscribe((change) => setModelVersion(change.version))
  }, [rowModel])

  const dataRowCount = rowModel?.getRowCount() ?? rowSource?.rowCount ?? rows?.length ?? 0
  const dataColumnCount = requestedColumnCount ?? columns?.length ?? 0
  const headerOffset = showHeader ? 1 : 0
  const rowNumberOffset = showRowNumbers ? 1 : 0
  const totalRows = dataRowCount + headerOffset
  const totalColumns = dataColumnCount + rowNumberOffset
  const viewportSelectionBounds = useMemo<CellRange | null>(() => (
    dataRowCount > 0 && dataColumnCount > 0
      ? {
          rowStart: headerOffset,
          rowEnd: totalRows - 1,
          columnStart: rowNumberOffset,
          columnEnd: totalColumns - 1,
        }
      : null
  ), [
    dataRowCount,
    dataColumnCount,
    headerOffset,
    rowNumberOffset,
    totalRows,
    totalColumns,
  ])
  const {
    dataSelection,
    viewportSelection,
    handleViewportSelectionChange,
  } = useInsightSelectionAdapter({
    selection,
    onSelectionChange,
    headerOffset,
    rowNumberOffset,
    rowCount: dataRowCount,
    columnCount: dataColumnCount,
  })
  const handleViewportChange = useMemo(
    () => onViewportChange
      ? (snapshot: ViewportSnapshot) => onViewportChange(viewportSnapshotToData(
          snapshot,
          headerOffset,
          rowNumberOffset,
          dataRowCount,
          dataColumnCount,
        ))
      : undefined,
    [onViewportChange, headerOffset, rowNumberOffset, dataRowCount, dataColumnCount],
  )

  const getRow = useCallback((index: number): TRow | undefined => {
    const cached = rowCache.get(index)
    if (cached !== undefined) return cached
    const row = rowModel
      ? rowModel.getRow(index)
      : rowSource
        ? index >= 0 && index < rowSource.rowCount ? rowSource.getRow(index) : undefined
        : rows?.[index]
    if (row !== undefined) {
      rowCache.set(index, row)
      trimOldest(rowCache, 512)
    }
    return row
  }, [rowModel, rowSource, rows, rowCache])

  const resolveRowId = useCallback((row: TRow, index: number): InsightRowId =>
    rowModel?.getRowId(index)
      ?? rowSource?.getRowId?.(row, index)
      ?? getRowId?.(row, index)
      ?? index,
  [rowModel, rowSource, getRowId, modelVersion])

  const getColumn = useCallback((index: number) => {
    const existing = columnCache.get(index)
    if (existing) return existing
    const column = columns?.[index] ?? getLazyColumn?.(index)
    if (!column) throw new RangeError(`No application column exists at index ${index}`)
    columnCache.set(index, column)
    trimOldest(columnCache, 2_048)
    return column
  }, [columns, getLazyColumn, columnCache])

  const effectiveColumnResize = useMemo<boolean | ColumnResizeOptions>(() => {
    if (!showHeader || columnResize === false) return false
    const options = columnResize === true ? undefined : columnResize
    const dataColumn = (viewportColumn: number) => viewportColumn - rowNumberOffset
    const resolveConstraint = (
      value: InsightColumnWidthConstraint<TRow> | undefined,
      viewportColumn: number,
      fallback: number | undefined,
    ) => {
      const index = dataColumn(viewportColumn)
      if (index < 0 || index >= dataColumnCount) return fallback ?? defaultColumnWidth
      const column = getColumn(index)
      return typeof value === 'function' ? value(column, index) : value ?? fallback ?? defaultColumnWidth
    }
    return {
      headerRows: [0],
      isColumnResizable: (viewportColumn) => {
        const index = dataColumn(viewportColumn)
        if (index < 0 || index >= dataColumnCount) return false
        const column = getColumn(index)
        return column.resizable !== false && (options?.isColumnResizable?.(column, index) ?? true)
      },
      minWidth: (viewportColumn) => {
        const index = dataColumn(viewportColumn)
        const column = index >= 0 && index < dataColumnCount ? getColumn(index) : undefined
        return column?.minWidth
          ?? resolveConstraint(options?.minWidth, viewportColumn, 48)
      },
      maxWidth: (viewportColumn) => {
        const index = dataColumn(viewportColumn)
        const column = index >= 0 && index < dataColumnCount ? getColumn(index) : undefined
        return column?.maxWidth
          ?? resolveConstraint(options?.maxWidth, viewportColumn, 800)
      },
      keyboardStep: options?.keyboardStep,
      touchActivationDelay: options?.touchActivationDelay,
      getHandleAriaLabel: (viewportColumn) => {
        const index = dataColumn(viewportColumn)
        if (index < 0 || index >= dataColumnCount) return messages.resizeColumn(String(viewportColumn + 1))
        const column = getColumn(index)
        return options?.getHandleAriaLabel?.(column, index)
          ?? messages.resizeColumn(column.headerText ?? String(index + 1))
      },
    }
  }, [
    columnResize,
    dataColumnCount,
    defaultColumnWidth,
    getColumn,
    messages,
    rowNumberOffset,
    showHeader,
  ])

  const handleColumnResize = useCallback((change: CoreColumnResizeChange) => {
    const columnIndex = change.viewportColumn - rowNumberOffset
    if (columnIndex < 0 || columnIndex >= dataColumnCount) return
    if (!onColumnResize) return
    onColumnResize({
      columnIndex,
      columnId: getColumn(columnIndex).id,
      width: change.width,
      previousWidth: change.previousWidth,
      phase: change.phase,
      input: change.input,
    })
  }, [dataColumnCount, getColumn, onColumnResize, rowNumberOffset])

  const globalFormatter = useMemo(
    () => compileConditionalFormatting(activeConditionalRules),
    [activeConditionalRules],
  )

  const getAdjacentMergeRow = useCallback((index: number): TRow | undefined => {
    if (index < 0 || index >= dataRowCount) return undefined
    return rowModel?.getRow(index) ?? rowSource?.getRow(index) ?? rows?.[index]
  }, [dataRowCount, rowModel, rowSource, rows, modelVersion])
  const getAdjacentMergeRowMeta = useCallback((index: number, target?: RowMeta) => (
    rowModel?.getRowMeta(index, target) ?? rowSource?.getRowMeta?.(index, target)
  ), [rowModel, rowSource, modelVersion])
  const generatedMergedCells = useMemo(() => {
    if (!mergeAdjacent) return EMPTY_MERGED_CELLS
    return buildAdjacentMerges({
      rowCount: dataRowCount,
      columnCount: dataColumnCount,
      getRow: getAdjacentMergeRow,
      getColumnValue: (columnIndex, row, rowIndex) => (
        getColumn(columnIndex).getValue(row, rowIndex)
      ),
      getRowMeta: rowModel || rowSource?.getRowMeta ? getAdjacentMergeRowMeta : undefined,
    }, mergeAdjacent, mergedCells)
  }, [
    mergeAdjacent,
    mergedCells,
    dataRowCount,
    dataColumnCount,
    getAdjacentMergeRow,
    getAdjacentMergeRowMeta,
    getColumn,
    rowModel,
    rowSource,
    contentVersion,
  ])
  const effectiveMergedCells = useMemo(
    () => generatedMergedCells.length > 0
      ? [...mergedCells, ...generatedMergedCells]
      : mergedCells,
    [mergedCells, generatedMergedCells],
  )
  const mergedWithChrome = useMemo(() => effectiveMergedCells.map((merge) => ({
    ...merge,
    rowStart: merge.rowStart + headerOffset,
    rowEnd: merge.rowEnd + headerOffset,
    columnStart: merge.columnStart + rowNumberOffset,
    columnEnd: merge.columnEnd + rowNumberOffset,
  })), [effectiveMergedCells, headerOffset, rowNumberOffset])

  const effectiveColumnWidths = useMemo(() => {
    return buildInsightViewportColumnWidths(columns, columnWidths, rowNumberOffset)
  }, [
    showRowNumbers,
    columnWidths,
    columns,
    columnLayoutVersion,
    getLazyColumn,
    rowNumberOffset,
  ])
  const gridColumnWidthGetter = useCallback((gridColumn: number) => {
    if (!getLazyColumnWidth) return undefined
    const dataColumn = gridColumn - rowNumberOffset
    return dataColumn >= 0 ? getLazyColumnWidth(dataColumn) : undefined
  }, [columnLayoutVersion, getLazyColumnWidth, rowNumberOffset])

  const effectiveRowHeights = useMemo(() => {
    if (!showHeader && !rowHeights) return undefined
    const result = new Map<number, number>()
    if (showHeader) result.set(0, Math.max(36, defaultRowHeight))
    if (rowHeights) {
      for (const [index, height] of rowHeights) result.set(index + headerOffset, height)
    }
    return result
  }, [showHeader, rowHeights, headerOffset, defaultRowHeight])

  const resolveRowMeta = useCallback((rowIndex: number) => {
    const cached = rowMetaCache.get(rowIndex)
    if (cached) return cached
    const meta = rowModel?.getRowMeta(rowIndex) ?? rowSource?.getRowMeta?.(rowIndex)
    if (meta) {
      rowMetaCache.set(rowIndex, meta)
      trimOldest(rowMetaCache, 512)
    }
    return meta
  }, [rowModel, rowSource, rowMetaCache])

  const getViewportCell = useCallback((gridRow: number, gridColumn: number) => {
    if (showHeader && gridRow === 0) {
      const dataColumnIndex = gridColumn - rowNumberOffset
      const column = dataColumnIndex >= 0 ? getColumn(dataColumnIndex) : undefined
      const meta: HeaderMeta<TRow> = {
        kind: 'header',
        column,
        columnIndex: dataColumnIndex,
        rowNumber: showRowNumbers && gridColumn === 0,
      }
      return {
        value: column?.headerText ?? (typeof column?.header === 'string' ? column.header : ''),
        text: column?.headerText ?? (typeof column?.header === 'string' ? column.header : ''),
        className: 'ultigrid-insight-surface ultigrid-insight-surface--header',
        meta,
      }
    }

    const rowIndex = gridRow - headerOffset
    const row = getRow(rowIndex)
    if (row === undefined) return { value: '', text: '' }
    if (showRowNumbers && gridColumn === 0) {
      const meta: RowNumberMeta = { kind: 'rowNumber', rowIndex }
      return {
        value: rowIndex + 1,
        text: String(rowIndex + 1),
        className: 'ultigrid-insight-surface ultigrid-insight-surface--row-number',
        meta,
      }
    }

    const columnIndex = gridColumn - rowNumberOffset
    const column = getColumn(columnIndex)
    const rowMeta = column.id === treeColumnId ? resolveRowMeta(rowIndex) : undefined
    const value = column.getValue(row, rowIndex)
    const text = column.formatValue
      ? column.formatValue(value, row, rowIndex)
      : defaultDisplayValue(value)
    const rowId = resolveRowId(row, rowIndex)
    const staticVisualStyle = typeof column.visualStyle === 'function'
      ? undefined
      : column.visualStyle
    const plain = activeConditionalRules.length === 0 &&
      (column.conditionalRules?.length ?? 0) === 0 &&
      column.id !== treeColumnId &&
      !column.image &&
      !column.icon &&
      !column.component &&
      !column.renderContent &&
      typeof column.visualStyle !== 'function'
    const plainVisualStyle = plain ? staticVisualStyle : undefined
    let cachedPlainStyle = plain ? plainSurfaceStyleCache.get(column) : undefined
    if (plain && !cachedPlainStyle) {
      cachedPlainStyle = plainSurfaceStyle(plainVisualStyle)
      plainSurfaceStyleCache.set(column, cachedPlainStyle)
    }
    const meta: DataMeta<TRow> = {
      kind: 'data',
      row,
      rowId,
      rowIndex,
      column,
      columnIndex,
      rowMeta,
      plain,
      plainWrap: Boolean(plainVisualStyle?.wrap),
    }
    return {
      value,
      text,
      ariaLevel: rowMeta ? rowMeta.depth + 1 : undefined,
      ariaExpanded: rowMeta?.expandable ? rowMeta.expanded : undefined,
      className: [
        'ultigrid-insight-surface',
        plain ? 'ultigrid-insight-surface--plain' : '',
        plainVisualStyle?.wrap ? 'ultigrid-insight-surface--plain-wrap' : '',
        stripedRows && rowIndex % 2 === 1 ? 'ultigrid-insight-surface--striped' : '',
        column.className ?? '',
      ].filter(Boolean).join(' '),
      style: cachedPlainStyle,
      meta,
    }
  }, [
    showHeader,
    showRowNumbers,
    rowNumberOffset,
    headerOffset,
    getColumn,
    getRow,
    resolveRowMeta,
    resolveRowId,
    stripedRows,
    treeColumnId,
    activeConditionalRules,
    plainSurfaceStyleCache,
  ])

  const renderInsightCell = useCallback((context: Parameters<NonNullable<React.ComponentProps<typeof UltiGridViewport>['renderCell']>>[0]) => {
    const meta = context.cell.meta as InsightMeta<TRow> | undefined
    if (!meta) return context.cell.text ?? ''
    if (meta.kind === 'header') {
      return (
        <div className="ultigrid-insight-header-cell">
          {meta.rowNumber ? <span className="ultigrid-insight-corner-mark" /> : meta.column?.header}
        </div>
      )
    }
    if (meta.kind === 'rowNumber') {
      return <span className="ultigrid-insight-row-number">{meta.rowIndex + 1}</span>
    }
    if (meta.plain) {
      return (
        <span
          role="presentation"
          className={[
            'ultigrid-insight-cell',
            'ultigrid-insight-cell--embedded',
            'ultigrid-insight-cell--plain',
            'ultigrid-insight-plain-value',
            meta.plainWrap ? 'ultigrid-insight-cell--wrap' : 'ultigrid-insight-cell--truncate',
            context.selected ? 'ultigrid-insight-cell--selected' : '',
            context.active ? 'ultigrid-insight-cell--active' : '',
          ].filter(Boolean).join(' ')}
          data-row-id={meta.rowId}
          data-column-id={meta.column.id}
          title={context.cell.text}
        >
          {context.cell.text}
        </span>
      )
    }

    const value = context.cell.value as InsightCellValue
    const cellContext: InsightCellContext<TRow, InsightCellValue> = {
      row: meta.row,
      rowId: meta.rowId,
      rowIndex: meta.rowIndex,
      columnId: meta.column.id,
      columnIndex: meta.columnIndex,
      value,
    }
    const formatter = getFormatter(
      meta.column,
      activeConditionalRules,
      globalFormatter,
      formatterCache,
    )
    const conditionalFormat = formatter.ruleCount > 0 ? formatter.evaluate(cellContext) : undefined
    const visualStyle = typeof meta.column.visualStyle === 'function'
      ? meta.column.visualStyle(cellContext)
      : meta.column.visualStyle
    const image = typeof meta.column.image === 'function'
      ? meta.column.image(cellContext)
      : meta.column.image
    const icon = typeof meta.column.icon === 'function'
      ? meta.column.icon(cellContext)
      : meta.column.icon
    const isTreeCell = meta.column.id === treeColumnId && meta.rowMeta
    const treePrefix = isTreeCell ? (
      <TreePrefix
        meta={meta.rowMeta!}
        messages={messages}
        onToggle={onToggleRow
          ? () => {
              try {
                void Promise.resolve(onToggleRow(meta.rowId, !meta.rowMeta!.expanded))
                  .catch((error) => onToggleError?.(error, meta.rowId))
              } catch (error) {
                onToggleError?.(error, meta.rowId)
              }
            }
          : undefined}
      />
    ) : null
    const customRender = meta.column.renderContent
    const CustomComponent = meta.column.component

    return (
      <InsightCell
        {...cellContext}
        embedded
        displayValue={context.cell.text}
        visualStyle={visualStyle}
        conditionalFormat={conditionalFormat}
        image={image}
        icon={icon}
        iconResolver={iconResolver}
        component={treePrefix ? undefined : CustomComponent}
        selected={context.selected}
        active={context.active}
        renderContent={treePrefix
          ? (rendererContext) => (
              <div className="ultigrid-insight-tree-value">
                {treePrefix}
                <div>
                  {CustomComponent
                    ? <CustomComponent {...rendererContext} />
                    : customRender
                      ? customRender(rendererContext)
                      : rendererContext.displayValue}
                </div>
              </div>
            )
          : customRender}
      />
    )
  }, [
    activeConditionalRules,
    globalFormatter,
    formatterCache,
    iconResolver,
    treeColumnId,
    onToggleRow,
    onToggleError,
    messages,
  ])

  const exportExcel = useCallback(async (
    fileName = 'ultigrid',
    requestedRange?: InsightExportRange,
  ) => {
    const range = normalizeExportRange(requestedRange, dataRowCount, dataColumnCount)
    const exportRowCount = Math.max(0, range.rowEnd - range.rowStart + 1)
    const exportColumnCount = Math.max(0, range.columnEnd - range.columnStart + 1)
    if (exportColumnCount > 16_384) {
      throw new RangeError(messages.excelColumnLimit)
    }
    if (exportRowCount > 1_048_575) {
      throw new RangeError(messages.excelRowLimit)
    }
    assertExportCellCount(exportRowCount, exportColumnCount, exportCellLimit, messages)
    await exportTableToExcel({
      rows: {
        getRowCount: () => exportRowCount,
        getRow: (index) => getRow(index + range.rowStart),
        getRowDepth: (index) => resolveRowMeta(index + range.rowStart)?.depth ?? 0,
      },
      columns: Array.from({ length: exportColumnCount }, (_, localIndex) => {
        const index = localIndex + range.columnStart
        const column = getColumn(index)
        return {
          id: column.id,
          header: column.headerText ?? (typeof column.header === 'string' ? column.header : column.id),
          width: Math.max(4, Math.round((
            viewportApiRef.current?.getColumnWidth(index + rowNumberOffset)
              ?? resolveInsightColumnWidth(index, columnWidths, column.width, defaultColumnWidth)
          ) / 7)),
          getValue: (row: TRow, localRowIndex: number) => {
            const rowIndex = localRowIndex + range.rowStart
            const value = column.getValue(row, rowIndex)
            return column.exportValue ? column.exportValue(value, row, rowIndex) : value
          },
        }
      }),
      fileName,
      treeColumnId,
      merges: effectiveMergedCells.flatMap((merge) => {
        if (
          merge.rowEnd < range.rowStart || merge.rowStart > range.rowEnd ||
          merge.columnEnd < range.columnStart || merge.columnStart > range.columnEnd
        ) return []
        return [{
          rowStart: Math.max(merge.rowStart, range.rowStart) - range.rowStart,
          rowEnd: Math.min(merge.rowEnd, range.rowEnd) - range.rowStart,
          columnStart: Math.max(merge.columnStart, range.columnStart) - range.columnStart,
          columnEnd: Math.min(merge.columnEnd, range.columnEnd) - range.columnStart,
        }]
      }),
    })
  }, [
    dataColumnCount,
    dataRowCount,
    getColumn,
    getRow,
    resolveRowMeta,
    treeColumnId,
    effectiveMergedCells,
    exportCellLimit,
    columnWidths,
    defaultColumnWidth,
    rowNumberOffset,
    messages,
  ])

  const exportImage = useCallback(async (fileName = 'ultigrid') => {
    if (!shellRef.current) throw new Error(messages.tableNotMounted)
    await exportTableToImage(shellRef.current, {
      fileName,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: '#ffffff',
      skipFonts: true,
    })
  }, [messages])

  const exportCsv = useCallback((
    fileName = 'ultigrid.csv',
    requestedRange?: InsightExportRange,
  ) => {
    const range = normalizeExportRange(requestedRange, dataRowCount, dataColumnCount)
    const exportRows = Math.max(0, range.rowEnd - range.rowStart + 1)
    const exportColumns = Math.max(0, range.columnEnd - range.columnStart + 1)
    assertExportCellCount(exportRows, exportColumns, exportCellLimit, messages)
    const chunks: string[] = []
    chunks.push(Array.from({ length: exportColumns }, (_, localIndex) => {
      const index = localIndex + range.columnStart
      const column = getColumn(index)
      return csvValue(column.headerText ?? (typeof column.header === 'string' ? column.header : column.id))
    }).join(','))
    for (let localRowIndex = 0; localRowIndex < exportRows; localRowIndex += 1) {
      const rowIndex = localRowIndex + range.rowStart
      const row = getRow(rowIndex)
      if (row === undefined) continue
      chunks.push(Array.from({ length: exportColumns }, (_, localColumnIndex) => {
        const columnIndex = localColumnIndex + range.columnStart
        const column = getColumn(columnIndex)
        const value = column.getValue(row, rowIndex)
        return csvValue(column.exportValue ? column.exportValue(value, row, rowIndex) : value)
      }).join(','))
    }
    downloadBlob(new Blob([`\ufeff${chunks.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), fileName)
  }, [dataRowCount, dataColumnCount, getColumn, getRow, exportCellLimit, messages])

  useEffect(() => {
    if (!apiRef) return
    const api: UltiGridInsightApi = {
      scrollToCell(address, align) {
        viewportApiRef.current?.scrollToCell(
          dataAddressToViewport(address, headerOffset, rowNumberOffset),
          align,
        )
      },
      copySelection() {
        return viewportApiRef.current?.copySelection() ?? Promise.resolve('')
      },
      getSelection() {
        return dataSelection
      },
      exportExcel,
      exportImage,
      exportCsv,
    }
    apiRef.current = api
    return () => {
      if (apiRef.current === api) apiRef.current = null
    }
  }, [
    apiRef,
    headerOffset,
    rowNumberOffset,
    dataRowCount,
    dataColumnCount,
    exportExcel,
    exportImage,
    exportCsv,
    dataSelection,
  ])

  const rootClassName = [
    'ultigrid-insight',
    showGridLines ? '' : 'ultigrid-insight--no-grid',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={shellRef} className={rootClassName} style={style}>
      <UltiGridViewport
        rowCount={totalRows}
        columnCount={totalColumns}
        getCell={getViewportCell}
        renderCell={renderInsightCell}
        defaultRowHeight={defaultRowHeight}
        defaultColumnWidth={defaultColumnWidth}
        rowHeights={effectiveRowHeights}
        columnWidths={effectiveColumnWidths}
        getColumnWidth={getLazyColumnWidth ? gridColumnWidthGetter : undefined}
        mergedCells={mergedWithChrome}
        frozen={{
          top: (frozen?.top ?? 0) + headerOffset,
          bottom: frozen?.bottom,
          left: (frozen?.left ?? 0) + rowNumberOffset,
          right: frozen?.right,
        }}
        overscan={overscan}
        fitColumns={fitColumns}
        autoSize={autoSize}
        contentVersion={contentVersion ?? (rowModel ? modelVersion : undefined)}
        columnLayoutVersion={columnLayoutVersion}
        selectionBounds={viewportSelectionBounds}
        selection={viewportSelection}
        onSelectionChange={handleViewportSelectionChange}
        onViewportChange={handleViewportChange}
        mobileInteraction={effectiveMobileInteraction}
        columnResize={effectiveColumnResize}
        onColumnResize={onColumnResize ? handleColumnResize : undefined}
        apiRef={viewportApiRef}
        themeColor={themeColor}
        ariaLabel={ariaLabel}
        ariaRole={treeColumnId ? 'treegrid' : 'grid'}
        emptyContent={emptyContent}
      />
    </div>
  )
}

function TreePrefix({
  meta,
  onToggle,
  messages,
}: {
  meta: RowMeta
  onToggle?: () => void
  messages: UltiGridInsightLocaleText
}) {
  return (
    <span
      className="ultigrid-insight-tree-prefix"
      style={{ paddingLeft: meta.depth * 16 }}
      title={meta.error ? messages.nodeLoadError : undefined}
    >
      {meta.expandable ? (
        onToggle ? (
          <button
            type="button"
            aria-label={meta.expanded ? messages.collapseRow : messages.expandRow}
            aria-expanded={meta.expanded}
            aria-busy={meta.loading || undefined}
            disabled={meta.loading}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggle}
          >
            {meta.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="ultigrid-insight-tree-toggle" aria-hidden="true">
            {meta.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )
      ) : <span className="ultigrid-insight-tree-spacer" />}
    </span>
  )
}

function plainSurfaceStyle(visualStyle?: InsightCellVisualStyle): PlainSurfaceStyle {
  return {
    backgroundColor: visualStyle?.backgroundColor,
    color: visualStyle?.color,
    fontFamily: visualStyle?.fontFamily,
    fontSize: visualStyle?.fontSize,
    fontStyle: visualStyle?.fontStyle,
    fontWeight: visualStyle?.fontWeight,
    letterSpacing: visualStyle?.letterSpacing,
    lineHeight: visualStyle?.lineHeight,
    textDecoration: visualStyle?.textDecoration,
    '--ultigrid-insight-cell-align-x': visualStyle?.horizontalAlign === 'right'
      ? 'flex-end'
      : visualStyle?.horizontalAlign === 'center'
        ? 'center'
        : 'flex-start',
    '--ultigrid-insight-cell-align-y': visualStyle?.verticalAlign === 'top'
      ? 'flex-start'
      : visualStyle?.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center',
    '--ultigrid-insight-cell-padding-inline': cssLength(visualStyle?.paddingInline, '10px'),
    '--ultigrid-insight-cell-padding-block': cssLength(visualStyle?.paddingBlock, '6px'),
  }
}

function cssLength(value: number | string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  return typeof value === 'number' ? `${value}px` : value
}

function getFormatter<TRow>(
  column: InsightColumn<TRow>,
  globalRules: readonly ConditionalFormatRule<TRow, InsightCellValue>[],
  global: CompiledConditionalFormatter<TRow, InsightCellValue>,
  cache: WeakMap<InsightColumn<TRow>, CompiledConditionalFormatter<TRow, InsightCellValue>>,
) {
  if (!column.conditionalRules?.length) return global
  const existing = cache.get(column)
  if (existing) return existing
  const formatter = compileConditionalFormatting([
    ...globalRules,
    ...column.conditionalRules,
  ] as readonly ConditionalFormatRule<TRow, InsightCellValue>[])
  cache.set(column, formatter)
  return formatter
}

function defaultIconResolver(icon: InsightCellIcon) {
  const Icon = BUILTIN_ICONS[icon.name]
  return Icon ? <Icon size={icon.size ?? 14} strokeWidth={2} /> : <span>{icon.name}</span>
}

function defaultDisplayValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

function csvValue(value: unknown): string {
  const text = defaultDisplayValue(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function normalizeExportRange(
  range: InsightExportRange | undefined,
  rowCount: number,
  columnCount: number,
): Required<InsightExportRange> {
  const lastRow = Math.max(-1, rowCount - 1)
  const lastColumn = Math.max(-1, columnCount - 1)
  const rowStart = clampExportIndex(range?.rowStart ?? 0, 0, Math.max(0, lastRow))
  const columnStart = clampExportIndex(range?.columnStart ?? 0, 0, Math.max(0, lastColumn))
  const rowEnd = rowCount === 0
    ? -1
    : clampExportIndex(range?.rowEnd ?? lastRow, rowStart, lastRow)
  const columnEnd = columnCount === 0
    ? -1
    : clampExportIndex(range?.columnEnd ?? lastColumn, columnStart, lastColumn)
  return { rowStart, rowEnd, columnStart, columnEnd }
}

function clampExportIndex(value: number, minimum: number, maximum: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : minimum
  return Math.min(maximum, Math.max(minimum, integer))
}

function assertExportCellCount(
  rows: number,
  columns: number,
  limit: number,
  messages: UltiGridInsightLocaleText,
): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(messages.exportCellLimitInvalid)
  }
  const count = rows * columns
  if (count > limit) {
    throw new RangeError(
      messages.exportRangeTooLarge(
        count.toLocaleString('en-US'),
        limit.toLocaleString('en-US'),
      ),
    )
  }
}

function trimOldest<TKey, TValue>(cache: Map<TKey, TValue>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as TKey | undefined
    if (oldest === undefined) return
    cache.delete(oldest)
  }
}
