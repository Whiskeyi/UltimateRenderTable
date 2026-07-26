import {
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { Axis } from './axis.js'
import {
  getVirtualRange,
  retainVirtualRange,
  type VirtualScrollDirection,
} from './virtualizer.js'
import type {
  UltiGridViewportProps,
  ViewportSnapshot,
} from './viewportTypes.js'

export interface IndexWindow {
  start: number
  end: number
}

export interface WindowState {
  rows: IndexWindow
  columns: IndexWindow
}

interface ViewportDimensions {
  topHeight: number
  bottomHeight: number
  leftWidth: number
  rightWidth: number
  centerWidth: number
  centerHeight: number
}

interface FrozenBands {
  top: number
  bottom: number
  left: number
  right: number
}

interface ViewportWindowControllerOptions {
  rowAxis: Axis
  columnAxis: Axis
  dimensions: ViewportDimensions
  fixed: FrozenBands
  rowCount: number
  columnCount: number
  rowOverscan: number
  columnOverscan: number
  onViewportChange: UltiGridViewportProps['onViewportChange']
}

interface ViewportWindowController {
  windowState: WindowState
  scrollPositionRef: MutableRefObject<{ top: number; left: number }>
  renderedRowCount: number
  renderedColumnCount: number
  syncViewportWindow: (top: number, left: number) => void
}

const EMPTY_INDEX_WINDOW: IndexWindow = {
  start: -1,
  end: -1,
}

export function useViewportWindowController({
  rowAxis,
  columnAxis,
  dimensions,
  fixed,
  rowCount,
  columnCount,
  rowOverscan,
  columnOverscan,
  onViewportChange,
}: ViewportWindowControllerOptions): ViewportWindowController {
  const [windowState, setWindowState] = useState<WindowState>(() => ({
    rows: EMPTY_INDEX_WINDOW,
    columns: EMPTY_INDEX_WINDOW,
  }))
  const renderWindowRef = useRef<WindowState>(windowState)
  const renderOverscanRef = useRef({ rows: rowOverscan, columns: columnOverscan })
  const scrollPositionRef = useRef({ top: 0, left: 0 })

  const computeVisibleWindow = useCallback((scrollTop: number, scrollLeft: number): WindowState => {
    const rows = visibleBand(
      rowAxis,
      scrollTop + dimensions.topHeight,
      dimensions.centerHeight,
      fixed.top,
      rowCount - fixed.bottom - 1,
    )
    const columns = visibleBand(
      columnAxis,
      scrollLeft + dimensions.leftWidth,
      dimensions.centerWidth,
      fixed.left,
      columnCount - fixed.right - 1,
    )
    return { rows, columns }
  }, [
    columnAxis,
    columnCount,
    dimensions,
    fixed,
    rowAxis,
    rowCount,
  ])

  const emitViewport = useCallback((
    visibleWindow: WindowState,
    renderedWindow: WindowState,
    top: number,
    left: number,
  ) => {
    if (!onViewportChange) return
    const visibleRows = countWindow(visibleWindow.rows) + fixed.top + fixed.bottom
    const visibleColumns = countWindow(visibleWindow.columns) + fixed.left + fixed.right
    const nextRenderedRows = countWindow(renderedWindow.rows) + fixed.top + fixed.bottom
    const nextRenderedColumns = countWindow(renderedWindow.columns) + fixed.left + fixed.right
    const snapshotRows = resolveViewportSnapshotWindow(
      visibleWindow.rows,
      rowCount,
      fixed.top,
      fixed.bottom,
    )
    const snapshotColumns = resolveViewportSnapshotWindow(
      visibleWindow.columns,
      columnCount,
      fixed.left,
      fixed.right,
    )
    const snapshot: ViewportSnapshot = {
      rowStart: snapshotRows.start,
      rowEnd: snapshotRows.end,
      columnStart: snapshotColumns.start,
      columnEnd: snapshotColumns.end,
      visibleCellCount: visibleRows * visibleColumns,
      renderedCellCount: nextRenderedRows * nextRenderedColumns,
      scrollTop: top,
      scrollLeft: left,
    }
    onViewportChange(snapshot)
  }, [columnCount, fixed, onViewportChange, rowCount])

  const syncViewportWindow = useCallback((top: number, left: number) => {
    const previousScroll = scrollPositionRef.current
    const rowDirection = scrollDirection(top, previousScroll.top)
    const columnDirection = scrollDirection(left, previousScroll.left)
    scrollPositionRef.current = { top, left }

    const visibleWindow = computeVisibleWindow(top, left)
    const previousWindow = renderWindowRef.current
    const previousOverscan = renderOverscanRef.current
    const nextWindow = {
      rows: retainVirtualRange(
        visibleWindow.rows,
        previousWindow.rows,
        rowOverscan,
        rowDirection,
        fixed.top,
        rowCount - fixed.bottom - 1,
        previousOverscan.rows,
      ),
      columns: retainVirtualRange(
        visibleWindow.columns,
        previousWindow.columns,
        columnOverscan,
        columnDirection,
        fixed.left,
        columnCount - fixed.right - 1,
        previousOverscan.columns,
      ),
    }
    if (previousOverscan.rows !== rowOverscan || previousOverscan.columns !== columnOverscan) {
      renderOverscanRef.current = { rows: rowOverscan, columns: columnOverscan }
    }
    if (!windowsEqual(previousWindow, nextWindow)) {
      renderWindowRef.current = nextWindow
      setWindowState(nextWindow)
    }
    emitViewport(visibleWindow, nextWindow, top, left)
  }, [
    columnCount,
    columnOverscan,
    computeVisibleWindow,
    emitViewport,
    fixed,
    rowCount,
    rowOverscan,
  ])

  return {
    windowState,
    scrollPositionRef,
    renderedRowCount: countWindow(windowState.rows) + fixed.top + fixed.bottom,
    renderedColumnCount: countWindow(windowState.columns) + fixed.left + fixed.right,
    syncViewportWindow,
  }
}

export function resolveViewportSnapshotWindow(
  visibleWindow: IndexWindow,
  count: number,
  fixedStart: number,
  fixedEnd: number,
): IndexWindow {
  if (visibleWindow.start >= 0 || count <= 0 || fixedStart + fixedEnd !== count) {
    return visibleWindow
  }
  return { start: 0, end: count - 1 }
}

function visibleBand(
  axis: Axis,
  offset: number,
  viewportSize: number,
  minimum: number,
  maximum: number,
): IndexWindow {
  if (axis.count === 0 || viewportSize <= 0 || minimum > maximum) return EMPTY_INDEX_WINDOW
  const range = getVirtualRange(axis, offset, viewportSize, 0)
  const start = Math.max(minimum, range.visibleStart)
  const end = Math.min(maximum, range.visibleEnd)
  if (start > end) return EMPTY_INDEX_WINDOW
  return { start, end }
}

function windowsEqual(left: WindowState, right: WindowState): boolean {
  return indexWindowsEqual(left.rows, right.rows) && indexWindowsEqual(left.columns, right.columns)
}

function indexWindowsEqual(left: IndexWindow, right: IndexWindow): boolean {
  return left.start === right.start && left.end === right.end
}

function countWindow(range: IndexWindow): number {
  return range.start < 0 ? 0 : range.end - range.start + 1
}

function scrollDirection(current: number, previous: number): VirtualScrollDirection {
  return current === previous ? 0 : current > previous ? 1 : -1
}
