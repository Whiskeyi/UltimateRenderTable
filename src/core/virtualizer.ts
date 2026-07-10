import type { Axis } from './axis'

export interface Overscan {
  /** Extra item count before the visible range. */
  before: number
  /** Extra item count after the visible range. */
  after: number
}

export interface VirtualRange {
  /** Inclusive rendered range after overscan; -1 when empty. */
  readonly start: number
  readonly end: number
  /** Inclusive range intersecting the viewport; -1 when empty. */
  readonly visibleStart: number
  readonly visibleEnd: number
  readonly count: number
  /** Pixel offset and size of the rendered range. */
  readonly offset: number
  readonly size: number
  /** Spacer sizes around the rendered range. */
  readonly paddingStart: number
  readonly paddingEnd: number
}

export interface VirtualWindowOptions {
  rowAxis: Axis
  columnAxis: Axis
  scrollTop: number
  scrollLeft: number
  viewportHeight: number
  viewportWidth: number
  rowOverscan?: number | Partial<Overscan>
  columnOverscan?: number | Partial<Overscan>
}

export interface VirtualWindow {
  readonly rows: VirtualRange
  readonly columns: VirtualRange
}

/**
 * Computes the visible and overscanned item range for one axis.
 *
 * `viewportOffset` and `viewportSize` are pixels. `overscan` is an item count
 * (symmetric number, or separate before/after counts). All returned start/end
 * indexes are inclusive.
 */
export function getVirtualRange(
  axis: Axis,
  viewportOffset: number,
  viewportSize: number,
  overscan: number | Partial<Overscan> = 1,
): VirtualRange {
  assertViewportSize(viewportSize)
  const normalizedOverscan = normalizeOverscan(overscan)
  const totalSize = axis.totalSize

  if (axis.count === 0 || totalSize <= 0 || viewportSize === 0) {
    return emptyRange(totalSize)
  }

  // A stale scroll position can survive a data/size change. Clamp it to a
  // valid scroll range so the final viewport still renders useful content.
  const safeOffset = Number.isNaN(viewportOffset) ? 0 : viewportOffset
  const maxOffset = Math.max(0, totalSize - viewportSize)
  const viewportStart = Math.min(Math.max(0, safeOffset), maxOffset)
  const viewportEnd = Math.min(totalSize, viewportStart + viewportSize)
  const visibleStart = axis.indexAtOffset(viewportStart)
  let visibleEnd = axis.indexAtOffset(viewportEnd)

  // The viewport is half-open. If its end is an exact item boundary, that
  // next item does not intersect it.
  if (visibleEnd > visibleStart && axis.getOffset(visibleEnd) >= viewportEnd) {
    visibleEnd -= 1
  }

  const start = Math.max(0, visibleStart - normalizedOverscan.before)
  const end = Math.min(axis.count - 1, visibleEnd + normalizedOverscan.after)
  const offset = axis.getOffset(start)
  const renderedEnd = axis.getOffset(end + 1)

  return {
    start,
    end,
    visibleStart,
    visibleEnd,
    count: end - start + 1,
    offset,
    size: renderedEnd - offset,
    paddingStart: offset,
    paddingEnd: totalSize - renderedEnd,
  }
}

export function getVisibleRange2D(options: VirtualWindowOptions): VirtualWindow {
  return {
    rows: getVirtualRange(
      options.rowAxis,
      options.scrollTop,
      options.viewportHeight,
      options.rowOverscan,
    ),
    columns: getVirtualRange(
      options.columnAxis,
      options.scrollLeft,
      options.viewportWidth,
      options.columnOverscan,
    ),
  }
}

function emptyRange(totalSize: number): VirtualRange {
  return {
    start: -1,
    end: -1,
    visibleStart: -1,
    visibleEnd: -1,
    count: 0,
    offset: 0,
    size: 0,
    paddingStart: 0,
    paddingEnd: totalSize,
  }
}

function normalizeOverscan(overscan: number | Partial<Overscan>): Overscan {
  if (typeof overscan === 'number') {
    const value = assertOverscanCount(overscan, 'overscan')
    return { before: value, after: value }
  }
  return {
    before: assertOverscanCount(overscan.before ?? 0, 'overscan.before'),
    after: assertOverscanCount(overscan.after ?? 0, 'overscan.after'),
  }
}

function assertOverscanCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer; received ${value}`)
  }
  return value
}

function assertViewportSize(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`viewportSize must be a finite number at least 0; received ${value}`)
  }
}
