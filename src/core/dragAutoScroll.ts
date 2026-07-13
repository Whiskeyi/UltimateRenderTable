import { Axis } from './axis.js'
import type { CellAddress } from './viewportTypes.js'

interface Point {
  x: number
  y: number
}

interface Bounds {
  left: number
  right: number
  top: number
  bottom: number
}

interface AutoScrollOptions {
  /** Starts scrolling while the pointer is this many pixels inside an edge. */
  edgeThreshold?: number
  /** Restricts touch-driven auto-scroll after the gesture chooses an axis. */
  axis?: 'horizontal' | 'vertical'
}

interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

interface DragAddressMetrics {
  scrollTop: number
  scrollLeft: number
  topHeight: number
  bottomHeight: number
  bottomStartOffset: number
  leftWidth: number
  rightWidth: number
  rightStartOffset: number
}

const MAX_AUTO_SCROLL_SPEED = 32
const AUTO_SCROLL_ACCELERATION = 0.35
const MIN_AUTO_SCROLL_SPEED = 1
const CELL_EDGE_EPSILON = 0.5

export function getDragAutoScrollVelocity(
  pointer: Point,
  bounds: Bounds,
  options: AutoScrollOptions = {},
): Point {
  const threshold = Math.max(0, options.edgeThreshold ?? 0)
  const x = edgeVelocity(pointer.x, bounds.left, bounds.right, threshold)
  const y = edgeVelocity(pointer.y, bounds.top, bounds.bottom, threshold)
  return {
    x: options.axis === 'vertical' ? 0 : x,
    y: options.axis === 'horizontal' ? 0 : y,
  }
}

export function resolveDragAddress(
  pointer: Point,
  viewport: ViewportRect,
  metrics: DragAddressMetrics,
  rowAxis: Axis,
  columnAxis: Axis,
): CellAddress | null {
  if (rowAxis.count === 0 || columnAxis.count === 0) return null

  return {
    row: resolveAxisIndex(
      pointer.y,
      viewport.top,
      viewport.height,
      metrics.scrollTop,
      metrics.topHeight,
      metrics.bottomHeight,
      metrics.bottomStartOffset,
      rowAxis,
    ),
    column: resolveAxisIndex(
      pointer.x,
      viewport.left,
      viewport.width,
      metrics.scrollLeft,
      metrics.leftWidth,
      metrics.rightWidth,
      metrics.rightStartOffset,
      columnAxis,
    ),
  }
}

function edgeVelocity(
  coordinate: number,
  start: number,
  end: number,
  threshold: number,
): number {
  const leadingEdge = start + Math.min(threshold, Math.max(0, end - start) / 2)
  const trailingEdge = end - Math.min(threshold, Math.max(0, end - start) / 2)
  const distance = coordinate < leadingEdge
    ? coordinate - leadingEdge
    : coordinate > trailingEdge
      ? coordinate - trailingEdge
      : 0
  if (distance === 0) return 0
  const speed = Math.min(
    MAX_AUTO_SCROLL_SPEED,
    Math.max(MIN_AUTO_SCROLL_SPEED, Math.abs(distance) * AUTO_SCROLL_ACCELERATION),
  )
  return Math.sign(distance) * speed
}

function resolveAxisIndex(
  coordinate: number,
  viewportStart: number,
  viewportSize: number,
  scrollOffset: number,
  leadingFixedSize: number,
  trailingFixedSize: number,
  trailingStartOffset: number,
  axis: Axis,
): number {
  const viewportEnd = viewportStart + viewportSize
  const scrollableStart = leadingFixedSize
  const scrollableEnd = viewportSize - trailingFixedSize
  const hasScrollableBand = scrollableEnd > scrollableStart
  let local = clamp(coordinate - viewportStart, 0, Math.max(0, viewportSize - CELL_EDGE_EPSILON))

  if (hasScrollableBand && coordinate < viewportStart) {
    local = scrollableStart
  } else if (hasScrollableBand && coordinate > viewportEnd) {
    local = Math.max(scrollableStart, scrollableEnd - CELL_EDGE_EPSILON)
  }

  let axisOffset: number
  if (local < leadingFixedSize) {
    axisOffset = local
  } else if (trailingFixedSize > 0 && local >= viewportSize - trailingFixedSize) {
    axisOffset = trailingStartOffset + local - (viewportSize - trailingFixedSize)
  } else {
    axisOffset = scrollOffset + local
  }
  return axis.indexAtOffset(axisOffset)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
