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
  /** Distributes spare horizontal space across columns while content is narrower than the viewport. */
  fitColumns?: FitColumnsMode
  selection?: CellRange | null
  defaultSelection?: CellRange | null
  onSelectionChange?: (range: CellRange | null) => void
  onCellClick?: (address: CellAddress, cell: TableCell<TValue, TMeta>) => void
  onViewportChange?: (snapshot: ViewportSnapshot) => void
  onCopy?: (range: CellRange, tsv: string) => void
  /** Safety ceiling for clipboard materialization. Defaults to 100,000 cells. */
  copyCellLimit?: number
  /** Accent used by selection, focus, and other interactive grid states. */
  themeColor?: string
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
