import type {
  CSSProperties,
  ComponentType,
  MouseEventHandler,
  ReactNode,
} from 'react'

/** Stable row identifiers are deliberately limited to Map-friendly primitives. */
export type InsightRowId = string | number

export type InsightCellValue = string | number | boolean | Date | null | undefined

export type HorizontalAlignment = 'left' | 'center' | 'right'

export type VerticalAlignment = 'top' | 'middle' | 'bottom'

export interface InsightCellContext<TRow = unknown, TValue = InsightCellValue> {
  row: TRow
  rowId: InsightRowId
  rowIndex: number
  columnId: string
  columnIndex: number
  value: TValue
}

export interface InsightCellTextStyle {
  color?: string
  fontFamily?: string
  fontSize?: number | string
  fontStyle?: 'normal' | 'italic' | 'oblique'
  fontWeight?: CSSProperties['fontWeight']
  letterSpacing?: number | string
  lineHeight?: number | string
  textDecoration?: CSSProperties['textDecoration']
}

export interface InsightCellImage {
  src: string
  alt?: string
  width?: number | string
  height?: number | string
  fit?: CSSProperties['objectFit']
  position?: 'leading' | 'trailing' | 'background'
  opacity?: number
}

export interface InsightCellIcon {
  /** Domain name consumed by InsightCell's iconResolver. */
  name: string
  color?: string
  size?: number
  position?: 'leading' | 'trailing'
  label?: string
}

export interface InsightCellComponentProps<TRow = unknown, TValue = InsightCellValue>
  extends InsightCellContext<TRow, TValue> {
  displayValue: string
  selected: boolean
  active: boolean
}

export type InsightCellComponent<TRow = unknown, TValue = InsightCellValue> = ComponentType<
  InsightCellComponentProps<TRow, TValue>
>

export type InsightCellRenderFunction<TRow = unknown, TValue = InsightCellValue> = (
  context: InsightCellComponentProps<TRow, TValue>,
) => ReactNode

/**
 * Flat, renderer-ready formatting. Conditional formatting writes into the same
 * shape, so InsightCell does not need to understand rule semantics.
 */
export interface InsightCellVisualStyle extends InsightCellTextStyle {
  backgroundColor?: string
  horizontalAlign?: HorizontalAlignment
  verticalAlign?: VerticalAlignment
  wrap?: boolean
  paddingInline?: number | string
  paddingBlock?: number | string
}

export interface InsightCellProps<TRow = unknown, TValue = InsightCellValue>
  extends InsightCellContext<TRow, TValue> {
  /** Core UltiGridViewport already owns the gridcell role when embedded. */
  embedded?: boolean
  displayValue?: string
  visualStyle?: InsightCellVisualStyle
  conditionalFormat?: import('./conditionalFormatting.js').ConditionalFormatResult
  image?: InsightCellImage
  icon?: InsightCellIcon
  iconResolver?: (icon: InsightCellIcon) => ReactNode
  component?: InsightCellComponent<TRow, TValue>
  renderContent?: InsightCellRenderFunction<TRow, TValue>
  selected?: boolean
  active?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  title?: string
  ariaLabel?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  onDoubleClick?: MouseEventHandler<HTMLDivElement>
}
