import { Axis } from './axis.js'
import type {
  ColumnResizeInput,
  ColumnResizeOptions,
  ColumnWidthConstraint,
  FitColumnsMode,
} from './viewportTypes.js'

export interface ResolvedColumnResizeOptions {
  enabled: boolean
  headerRows: ReadonlySet<number>
  isColumnResizable: (viewportColumn: number) => boolean
  minWidth: ColumnWidthConstraint
  maxWidth: ColumnWidthConstraint
  keyboardStep: number
  touchActivationDelay: number
  getHandleAriaLabel: (viewportColumn: number) => string
}

export interface ColumnWidthBounds {
  min: number
  max: number
}

export interface ColumnSizeSnapshot {
  viewportColumn: number
  customWidth: number | undefined
}

export interface ColumnLayoutResetInputs {
  columnCount: number
  defaultColumnWidth: number
  fitColumns: FitColumnsMode
  columnLayoutVersion: string | number | undefined
}

interface ColumnWidthLayers {
  configured: ReadonlyMap<number, number>
  stretchBaseline: ReadonlyMap<number, number>
  measured: ReadonlyMap<number, number>
  manuallyResized: ReadonlyMap<number, number>
}

export function resolveColumnResizeOptions(
  value: boolean | ColumnResizeOptions | undefined,
): ResolvedColumnResizeOptions {
  const options = typeof value === 'object' ? value : undefined
  const headerRows = options?.headerRows ?? [0]
  return {
    enabled: value === true || typeof value === 'object',
    headerRows: new Set(headerRows.filter((row) => Number.isInteger(row) && row >= 0)),
    isColumnResizable: options?.isColumnResizable ?? (() => true),
    minWidth: options?.minWidth ?? 48,
    maxWidth: options?.maxWidth ?? 800,
    keyboardStep: clampFinite(options?.keyboardStep, 8, 1, 100),
    touchActivationDelay: clampFinite(options?.touchActivationDelay, 280, 0, 2_000),
    getHandleAriaLabel: options?.getHandleAriaLabel
      ?? ((column) => `Resize column ${column + 1}`),
  }
}

export function resolveColumnWidthBounds(
  options: ResolvedColumnResizeOptions,
  viewportColumn: number,
): ColumnWidthBounds {
  const min = clampFinite(resolveConstraint(options.minWidth, viewportColumn), 48, 16, 4_096)
  const max = clampFinite(resolveConstraint(options.maxWidth, viewportColumn), 800, min, 16_384)
  return { min, max: Math.max(min, max) }
}

export function clampColumnWidth(width: number, bounds: ColumnWidthBounds): number {
  if (!Number.isFinite(width)) return bounds.min
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)))
}

export function getPointerColumnWidth(
  startWidth: number,
  startX: number,
  currentX: number,
  direction: 1 | -1,
  bounds: ColumnWidthBounds,
): number {
  if (currentX === startX) return startWidth
  return clampColumnWidth(startWidth + (currentX - startX) * direction, bounds)
}

export function getKeyboardColumnWidth(
  key: string,
  currentWidth: number,
  bounds: ColumnWidthBounds,
  step: number,
  modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
): number | null {
  if (key === 'Home') return bounds.min
  if (key === 'End') return bounds.max
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const effectiveStep = modifiers.altKey ? 1 : modifiers.shiftKey ? step * 4 : step
  const direction = key === 'ArrowRight' ? 1 : -1
  return clampColumnWidth(currentWidth + direction * effectiveStep, bounds)
}

export function normalizeColumnResizeInput(pointerType: string): Exclude<ColumnResizeInput, 'keyboard'> {
  if (pointerType === 'touch' || pointerType === 'pen') return pointerType
  return 'mouse'
}

export function hasTouchResizeMoved(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tolerance = 10,
): boolean {
  const deltaX = currentX - startX
  const deltaY = currentY - startY
  return deltaX * deltaX + deltaY * deltaY > tolerance * tolerance
}

/** Captures one sparse Axis entry without enumerating other custom columns. */
export function captureColumnSize(
  axis: Axis,
  viewportColumn: number,
): ColumnSizeSnapshot {
  return { viewportColumn, customWidth: axis.getCustomSize(viewportColumn) }
}

export function restoreColumnSizes(
  axis: Axis,
  snapshots: readonly ColumnSizeSnapshot[],
): void {
  for (const snapshot of snapshots) {
    if (snapshot.customWidth === undefined) axis.resetSize(snapshot.viewportColumn)
    else axis.setSize(snapshot.viewportColumn, snapshot.customWidth)
  }
}

/** Manual widths win; measurements may still refine columns that only carry a stretch baseline. */
export function mergeColumnWidthLayers(
  count: number,
  layers: ColumnWidthLayers,
): Map<number, number> {
  const result = new Map<number, number>()
  for (const source of [
    layers.configured,
    layers.stretchBaseline,
    layers.measured,
    layers.manuallyResized,
  ]) {
    for (const [index, width] of source) {
      if (index >= 0 && index < count) result.set(index, width)
    }
  }
  return result
}

export function didColumnLayoutContractChange(
  previous: ColumnLayoutResetInputs,
  next: ColumnLayoutResetInputs,
): boolean {
  return previous.columnCount !== next.columnCount
    || previous.defaultColumnWidth !== next.defaultColumnWidth
    || previous.fitColumns !== next.fitColumns
    || previous.columnLayoutVersion !== next.columnLayoutVersion
}

function resolveConstraint(constraint: ColumnWidthConstraint, viewportColumn: number): number {
  return typeof constraint === 'function' ? constraint(viewportColumn) : constraint
}

function clampFinite(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}
