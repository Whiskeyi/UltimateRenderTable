import { memo, type CSSProperties, type ReactNode } from 'react'
import type {
  InsightCellComponentProps,
  InsightCellIcon,
  InsightCellImage,
  InsightCellProps,
  InsightCellValue,
} from './types'

type CellCssProperties = CSSProperties & {
  '--ultigrid-insight-cell-align-x'?: string
  '--ultigrid-insight-cell-align-y'?: string
  '--ultigrid-insight-cell-padding-block'?: string
  '--ultigrid-insight-cell-padding-inline'?: string
}

function InsightCellImpl<TRow = unknown, TValue = InsightCellValue>({
  row,
  rowId,
  rowIndex,
  columnId,
  columnIndex,
  value,
  embedded = false,
  displayValue = defaultDisplayValue(value),
  visualStyle,
  conditionalFormat,
  image,
  icon,
  iconResolver,
  component: CustomComponent,
  renderContent,
  selected = false,
  active = false,
  disabled = false,
  className,
  style,
  title,
  ariaLabel,
  onClick,
  onDoubleClick,
}: InsightCellProps<TRow, TValue>) {
  const horizontalAlign = visualStyle?.horizontalAlign ?? 'left'
  const verticalAlign = visualStyle?.verticalAlign ?? 'middle'
  const resolvedIcon = conditionalFormat?.icon ?? icon
  const resolvedImagePosition = image?.position ?? 'leading'
  const hasDataBar =
    Boolean(conditionalFormat?.dataBarColor) && (conditionalFormat?.dataBarRatio ?? 0) > 0

  const rootStyle: CellCssProperties = {
    ...style,
    backgroundColor:
      conditionalFormat?.backgroundColor ?? visualStyle?.backgroundColor ?? style?.backgroundColor,
    color: conditionalFormat?.color ?? visualStyle?.color ?? style?.color,
    fontFamily: conditionalFormat?.fontFamily ?? visualStyle?.fontFamily ?? style?.fontFamily,
    fontSize: conditionalFormat?.fontSize ?? visualStyle?.fontSize ?? style?.fontSize,
    fontStyle: conditionalFormat?.fontStyle ?? visualStyle?.fontStyle ?? style?.fontStyle,
    fontWeight: conditionalFormat?.fontWeight ?? visualStyle?.fontWeight ?? style?.fontWeight,
    letterSpacing:
      conditionalFormat?.letterSpacing ?? visualStyle?.letterSpacing ?? style?.letterSpacing,
    lineHeight: conditionalFormat?.lineHeight ?? visualStyle?.lineHeight ?? style?.lineHeight,
    textDecoration:
      conditionalFormat?.textDecoration ?? visualStyle?.textDecoration ?? style?.textDecoration,
    '--ultigrid-insight-cell-align-x': horizontalToFlex(horizontalAlign),
    '--ultigrid-insight-cell-align-y': verticalToFlex(verticalAlign),
    '--ultigrid-insight-cell-padding-inline': toCssLength(visualStyle?.paddingInline, '10px'),
    '--ultigrid-insight-cell-padding-block': toCssLength(visualStyle?.paddingBlock, '6px'),
  }

  const rendererContext: InsightCellComponentProps<TRow, TValue> = {
    row,
    rowId,
    rowIndex,
    columnId,
    columnIndex,
    value,
    displayValue,
    selected,
    active,
  }

  let content: ReactNode
  if (CustomComponent) {
    content = <CustomComponent {...rendererContext} />
  } else if (renderContent) {
    content = renderContent(rendererContext)
  } else {
    content = displayValue
  }

  const rootClassName = [
    'ultigrid-insight-cell',
    embedded ? 'ultigrid-insight-cell--embedded' : '',
    visualStyle?.wrap ? 'ultigrid-insight-cell--wrap' : 'ultigrid-insight-cell--truncate',
    selected ? 'ultigrid-insight-cell--selected' : '',
    active ? 'ultigrid-insight-cell--active' : '',
    disabled ? 'ultigrid-insight-cell--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      role={embedded ? 'presentation' : 'gridcell'}
      aria-colindex={embedded ? undefined : columnIndex + 1}
      aria-rowindex={embedded ? undefined : rowIndex + 1}
      aria-selected={embedded ? undefined : selected || undefined}
      aria-disabled={embedded ? undefined : disabled || undefined}
      aria-label={embedded ? undefined : ariaLabel}
      data-row-id={rowId}
      data-column-id={columnId}
      className={rootClassName}
      style={rootStyle}
      title={title ?? (visualStyle?.wrap ? undefined : displayValue)}
      onClick={disabled ? undefined : onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
    >
      {(hasDataBar || (image && resolvedImagePosition === 'background')) && (
        <div className="ultigrid-insight-cell__visual-layer" aria-hidden="true">
          {hasDataBar && (
            <span
              className="ultigrid-insight-cell__data-bar"
              data-negative={conditionalFormat?.dataBarNegative || undefined}
              style={{
                backgroundColor: conditionalFormat?.dataBarColor,
                left: `${(conditionalFormat?.dataBarOffset ?? 0) * 100}%`,
                width: `${(conditionalFormat?.dataBarRatio ?? 0) * 100}%`,
              }}
            />
          )}
          {image && resolvedImagePosition === 'background' && (
            <CellImage image={image} background />
          )}
        </div>
      )}

      <div className="ultigrid-insight-cell__content-layer">
        {image && resolvedImagePosition === 'leading' && <CellImage image={image} />}
        {resolvedIcon?.position !== 'trailing' && resolvedIcon && (
          <CellIcon icon={resolvedIcon} resolver={iconResolver} />
        )}

        <div className="ultigrid-insight-cell__value" data-custom={Boolean(CustomComponent || renderContent)}>
          {content}
        </div>

        {resolvedIcon?.position === 'trailing' && (
          <CellIcon icon={resolvedIcon} resolver={iconResolver} />
        )}
        {image && resolvedImagePosition === 'trailing' && <CellImage image={image} />}
      </div>
    </div>
  )
}

interface CellImageProps {
  image: InsightCellImage
  background?: boolean
}

function CellImage({ image, background = false }: CellImageProps) {
  return (
    <span
      className={background ? 'ultigrid-insight-cell__background-image' : 'ultigrid-insight-cell__media'}
      style={{
        width: background ? undefined : image.width,
        height: background ? undefined : image.height,
        opacity: image.opacity,
      }}
    >
      <img
        src={image.src}
        alt={background ? '' : (image.alt ?? '')}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ objectFit: image.fit ?? 'cover' }}
      />
    </span>
  )
}

interface CellIconProps {
  icon: InsightCellIcon
  resolver?: (icon: InsightCellIcon) => ReactNode
}

function CellIcon({ icon, resolver }: CellIconProps) {
  return (
    <span
      className="ultigrid-insight-cell__icon"
      role={icon.label ? 'img' : undefined}
      aria-label={icon.label}
      aria-hidden={icon.label ? undefined : true}
      title={icon.label}
      style={{ color: icon.color, width: icon.size, height: icon.size, fontSize: icon.size }}
    >
      {resolver ? resolver(icon) : icon.name}
    </span>
  )
}

function defaultDisplayValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

function horizontalToFlex(alignment: 'left' | 'center' | 'right'): string {
  if (alignment === 'right') return 'flex-end'
  if (alignment === 'center') return 'center'
  return 'flex-start'
}

function verticalToFlex(alignment: 'top' | 'middle' | 'bottom'): string {
  if (alignment === 'top') return 'flex-start'
  if (alignment === 'bottom') return 'flex-end'
  return 'center'
}

function toCssLength(value: number | string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  return typeof value === 'number' ? `${value}px` : value
}

/** React.memo keeps viewport scroll updates from repainting stable Insight cells. */
export const InsightCell = memo(InsightCellImpl) as typeof InsightCellImpl
