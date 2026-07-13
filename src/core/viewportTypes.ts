import type { CSSProperties, ReactNode } from 'react'

export type CellPrimitive = string | number | boolean | null | undefined

export interface CellAddress {
  row: number
  column: number
}

export interface CellRange {
  rowStart: number
  rowEnd: number
  columnStart: number
  columnEnd: number
}

export interface MergedCellRange extends CellRange {
  /** Optional stable id. A compact coordinate id is generated when omitted. */
  id?: string
}

export interface FrozenEdges {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export type ViewportCellAlign = 'auto' | 'start' | 'center' | 'end'

export type FitColumnsMode = 'none' | 'stretch'

export interface ApiRef<TApi> {
  current: TApi | null
}

export interface TableCell<TValue = CellPrimitive, TMeta = unknown> {
  value: TValue
  /** Text used by the default renderer and clipboard export. */
  text?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  ariaLevel?: number
  ariaExpanded?: boolean
  /** Arbitrary domain metadata. The render layer never clones or walks it. */
  meta?: TMeta
}

export type CellSource<TValue, TMeta = unknown> = TValue | TableCell<TValue, TMeta>

export interface CellRenderContext<TValue = CellPrimitive, TMeta = unknown> {
  row: number
  column: number
  cell: TableCell<TValue, TMeta>
  selected: boolean
  active: boolean
  merged: boolean
  range: CellRange | null
}

export type CellRenderer<TValue = CellPrimitive, TMeta = unknown> = (
  context: CellRenderContext<TValue, TMeta>,
) => ReactNode

export interface AutoSizeOptions {
  columns?: boolean
  rows?: boolean
  minColumnWidth?: number
  maxColumnWidth?: number
  minRowHeight?: number
  maxRowHeight?: number
  /** Only enlarges measurements by default, preventing scroll position oscillation. */
  allowShrink?: boolean
}

export interface OverscanOptions {
  rows?: number
  columns?: number
}

export type MobileInteractionMode = 'auto' | 'always' | 'off'

export interface MobileInteractionLabels {
  /** Visible label for the compact selection action. */
  copySelection: string
  /** Short success feedback announced after copying. */
  copySuccess: string
  /** Short failure feedback announced when clipboard access fails. */
  copyError: string
  /** Accessible label for the drag handle on the active selection. */
  selectionHandle: string
  /** Accessible label for the floating selection action group. */
  selectionActions: string
}

export interface MobileInteractionOptions {
  /** `auto` follows coarse-pointer/touch capability. Defaults to `auto`. */
  mode?: MobileInteractionMode
  /**
   * `dominant` locks one-finger scrolling to the first clear axis while
   * `native` leaves two-axis panning to the browser. Defaults to `dominant`.
   */
  scrollAxisLock?: 'dominant' | 'native'
  /** Movement in CSS pixels allowed before a touch stops being a tap. Defaults to 10. */
  tapSlop?: number
  /** Distance from an edge that starts drag-selection auto-scroll. Defaults to 36. */
  edgeAutoScrollThreshold?: number
  /** Shows a safe-area-aware copy action while a range is selected. Defaults to true. */
  showCopyAction?: boolean
  /** Override built-in English labels for product i18n. */
  labels?: Partial<MobileInteractionLabels>
}

export type ColumnWidthConstraint = number | ((viewportColumn: number) => number)
export type ColumnResizeInput = 'mouse' | 'touch' | 'pen' | 'keyboard'
export type ColumnResizePhase = 'start' | 'change' | 'end' | 'cancel'

export interface ColumnResizeOptions {
  /** Zero-based viewport rows that expose resize separators. Defaults to `[0]`. */
  headerRows?: readonly number[]
  /** Excludes host chrome or protected columns by zero-based viewport coordinate. */
  isColumnResizable?: (viewportColumn: number) => boolean
  /** Minimum width globally or per viewport column. Defaults to 48. */
  minWidth?: ColumnWidthConstraint
  /** Maximum width globally or per viewport column. Defaults to 800. */
  maxWidth?: ColumnWidthConstraint
  /** Arrow-key increment in CSS pixels. Defaults to 8. */
  keyboardStep?: number
  /** Long-press delay before touch resize starts. Defaults to 280 ms; `0` starts immediately. */
  touchActivationDelay?: number
  /** Localize the separator label. The argument is a zero-based viewport column. */
  getHandleAriaLabel?: (viewportColumn: number) => string
}

export interface ColumnResizeChange {
  /** Zero-based column in the Core viewport, including any host-added chrome columns. */
  viewportColumn: number
  width: number
  /** Width when the current pointer or keyboard operation started. */
  previousWidth: number
  phase: ColumnResizePhase
  input: ColumnResizeInput
}

export interface ViewportSnapshot {
  rowStart: number
  rowEnd: number
  columnStart: number
  columnEnd: number
  visibleCellCount: number
  renderedCellCount: number
  scrollTop: number
  scrollLeft: number
}

export interface UltiGridViewportApi {
  scrollToCell(address: CellAddress, align?: ViewportCellAlign): void
  copySelection(): Promise<string>
  getSelection(): CellRange | null
  /** Returns the current effective width for a zero-based viewport column. */
  getColumnWidth(viewportColumn: number): number | undefined
  focus(): void
}

export interface UltiGridViewportProps<TValue = CellPrimitive, TMeta = unknown> {
  rowCount: number
  columnCount: number
  getCell: (row: number, column: number) => CellSource<TValue, TMeta>
  getCellText?: (cell: TableCell<TValue, TMeta>, row: number, column: number) => string
  renderCell?: CellRenderer<TValue, TMeta>
  getRowHeight?: (row: number) => number | undefined
  getColumnWidth?: (column: number) => number | undefined
  /** Preferred for large sparse custom-size sets; read only when the axis is rebuilt. */
  rowHeights?: ReadonlyMap<number, number>
  /** Preferred for large sparse custom-size sets; read only when the axis is rebuilt. */
  columnWidths?: ReadonlyMap<number, number>
  defaultRowHeight?: number
  defaultColumnWidth?: number
  mergedCells?: readonly MergedCellRange[]
  frozen?: FrozenEdges
  overscan?: OverscanOptions
  autoSize?: boolean | AutoSizeOptions
  /**
   * Increment when data behind stable getters mutates in place. Invalidates
   * memoized cell renders and progressive measurement caches.
  */
  contentVersion?: string | number
  /** Re-reads stable width sources and clears measured/manual widths after a host layout change. */
  columnLayoutVersion?: string | number
  /** Distributes spare horizontal space across columns while content is narrower than the viewport. */
  fitColumns?: FitColumnsMode
  selection?: CellRange | null
  defaultSelection?: CellRange | null
  /** Restricts pointer, drag, and keyboard selection; `null` disables selection. */
  selectionBounds?: CellRange | null
  onSelectionChange?: (range: CellRange | null) => void
  onCellClick?: (address: CellAddress, cell: TableCell<TValue, TMeta>) => void
  onViewportChange?: (snapshot: ViewportSnapshot) => void
  onCopy?: (range: CellRange, tsv: string) => void
  /** Safety ceiling for clipboard materialization. Defaults to 100,000 cells. */
  copyCellLimit?: number
  /** Accent used by selection, focus, and other interactive grid states. */
  themeColor?: string
  /**
   * Touch-first selection and copy affordances. Omit for automatic coarse-pointer
   * detection, pass `true`/`false` to force on/off, or provide detailed options.
   */
  mobileInteraction?: boolean | MobileInteractionOptions
  /** Enables direct resize separators on configured viewport header rows. */
  columnResize?: boolean | ColumnResizeOptions
  /** Fires with an explicit zero-based viewport column during a resize lifecycle. */
  onColumnResize?: (change: ColumnResizeChange) => void
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  ariaRole?: 'grid' | 'treegrid'
  emptyContent?: ReactNode
  apiRef?: ApiRef<UltiGridViewportApi>
}

export function normalizeCell<TValue, TMeta = unknown>(
  source: CellSource<TValue, TMeta>,
): TableCell<TValue, TMeta> {
  if (
    typeof source === 'object' &&
    source !== null &&
    Object.prototype.hasOwnProperty.call(source, 'value')
  ) {
    return source as TableCell<TValue, TMeta>
  }

  return { value: source as TValue }
}

export function normalizeRange(range: CellRange): CellRange {
  return {
    rowStart: Math.min(range.rowStart, range.rowEnd),
    rowEnd: Math.max(range.rowStart, range.rowEnd),
    columnStart: Math.min(range.columnStart, range.columnEnd),
    columnEnd: Math.max(range.columnStart, range.columnEnd),
  }
}

export function isAddressInRange(address: CellAddress, range: CellRange | null): boolean {
  return Boolean(
    range &&
      address.row >= range.rowStart &&
      address.row <= range.rowEnd &&
      address.column >= range.columnStart &&
      address.column <= range.columnEnd,
  )
}

export function resolveSelectionBounds(
  bounds: CellRange | null | undefined,
  rowCount: number,
  columnCount: number,
): CellRange | null {
  if (bounds === null || rowCount <= 0 || columnCount <= 0) return null
  if (bounds === undefined) {
    return { rowStart: 0, rowEnd: rowCount - 1, columnStart: 0, columnEnd: columnCount - 1 }
  }
  const normalized = normalizeRange(bounds)
  const resolved = {
    rowStart: Math.max(0, normalized.rowStart),
    rowEnd: Math.min(rowCount - 1, normalized.rowEnd),
    columnStart: Math.max(0, normalized.columnStart),
    columnEnd: Math.min(columnCount - 1, normalized.columnEnd),
  }
  return resolved.rowStart <= resolved.rowEnd && resolved.columnStart <= resolved.columnEnd
    ? resolved
    : null
}

export function clampAddressToRange(
  address: CellAddress,
  bounds: CellRange,
): CellAddress {
  return {
    row: Math.min(bounds.rowEnd, Math.max(bounds.rowStart, Math.trunc(address.row))),
    column: Math.min(bounds.columnEnd, Math.max(bounds.columnStart, Math.trunc(address.column))),
  }
}

export function clampRangeToBounds(
  range: CellRange | null,
  bounds: CellRange | null,
): CellRange | null {
  if (!range || !bounds) return null
  const normalized = normalizeRange(range)
  return {
    rowStart: Math.min(bounds.rowEnd, Math.max(bounds.rowStart, normalized.rowStart)),
    rowEnd: Math.min(bounds.rowEnd, Math.max(bounds.rowStart, normalized.rowEnd)),
    columnStart: Math.min(bounds.columnEnd, Math.max(bounds.columnStart, normalized.columnStart)),
    columnEnd: Math.min(bounds.columnEnd, Math.max(bounds.columnStart, normalized.columnEnd)),
  }
}
