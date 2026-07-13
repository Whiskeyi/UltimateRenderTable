import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  type ReactNode,
} from 'react'
import { Axis } from './axis.js'
import { writeClipboard } from './clipboard.js'
import {
  captureColumnSize,
  didColumnLayoutContractChange,
  getKeyboardColumnWidth,
  getPointerColumnWidth,
  hasTouchResizeMoved,
  mergeColumnWidthLayers,
  normalizeColumnResizeInput,
  restoreColumnSizes,
  resolveColumnResizeOptions,
  resolveColumnWidthBounds,
  type ColumnSizeSnapshot,
} from './columnResize.js'
import { getDragAutoScrollVelocity, resolveDragAddress } from './dragAutoScroll.js'
import { MergeIndex, type MergeRegion } from './mergeIndex.js'
import {
  createTouchTapGesture,
  detectTouchFirstInput,
  isCompletedTouchTap,
  resolveMobileInteractionOptions,
  resolveTouchScrollIntent,
  TOUCH_CAPABLE_POINTER_QUERY,
  updateTouchTapGesture,
  type ResolvedMobileInteractionOptions,
  type TouchScrollIntent,
  type TouchTapGesture,
} from './mobileInteraction.js'
import { rangeToTSV } from './selection.js'
import { reconcileSelectionModel, type SelectionModel } from './selectionBounds.js'
import {
  getVirtualRange,
  retainVirtualRange,
  type VirtualScrollDirection,
} from './virtualizer.js'
import {
  clampAddressToRange,
  clampRangeToBounds,
  isAddressInRange,
  normalizeCell,
  normalizeRange,
  resolveSelectionBounds,
  type CellAddress,
  type CellPrimitive,
  type CellRange,
  type ColumnResizeInput,
  type MergedCellRange,
  type UltiGridViewportApi,
  type UltiGridViewportProps,
  type TableCell,
  type ViewportSnapshot,
} from './viewportTypes.js'

interface ElementSize {
  width: number
  height: number
}

interface IndexWindow {
  start: number
  end: number
}

interface WindowState {
  rows: IndexWindow
  columns: IndexWindow
}

interface TouchTapTarget<TValue, TMeta> extends TouchTapGesture {
  address: CellAddress
  cell: TableCell<TValue, TMeta>
}

interface ColumnResizeSession {
  pointerId: number
  viewportColumn: number
  startX: number
  latestX: number
  startWidth: number
  currentWidth: number
  guideStartX: number
  currentGuideX: number
  startScrollLeft: number
  scrollColumns: boolean
  direction: 1 | -1
  axis: Axis
  axisRollback: readonly ColumnSizeSnapshot[]
  axisStretchBefore: boolean
  pendingStretchBaseline: Map<number, number> | null
  previousManualFitDisabled: boolean
  input: Exclude<ColumnResizeInput, 'keyboard'>
  captureTarget: HTMLDivElement
}

interface PendingColumnResize {
  pointerId: number
  viewportColumn: number
  direction: 1 | -1
  scrollColumns: boolean
  startX: number
  startY: number
  input: Exclude<ColumnResizeInput, 'keyboard'>
  captureTarget: HTMLDivElement
  timer: number | null
}

interface HorizontalTouchScrollSession {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastScrollLeft: number
  lastTime: number
  velocity: number
  locked: boolean
  captureTarget: HTMLDivElement | null
}

interface TouchDragScrollAxisSession {
  pointerId: number
  startX: number
  startY: number
  axis: TouchScrollIntent | null
}

type BandKind = 'start' | 'middle' | 'end'

interface AxisBand {
  kind: BandKind
  start: number
  end: number
  clipStart: number
  clipSize: number
  coordinateBase: number
}

interface Pane {
  id: string
  rows: AxisBand
  columns: AxisBand
  zIndex: number
}

interface PaneLayer {
  element: HTMLDivElement
  scrollRows: boolean
  scrollColumns: boolean
}

const EMPTY_INDEX_WINDOW: IndexWindow = {
  start: -1,
  end: -1,
}

const DEFAULT_COPY_LIMIT = 100_000
const EMPTY_MERGES = Object.freeze([]) as readonly MergedCellRange[]

interface CellSurfaceProps<TValue, TMeta> {
  row: number
  column: number
  rowEnd: number
  columnEnd: number
  left: number
  top: number
  width: number
  height: number
  merged: boolean
  renderCustomContent: boolean
  selected: boolean
  active: boolean
  range: CellRange | null
  contentVersion: string | number | undefined
  rowCount: number
  columnCount: number
  getCell: UltiGridViewportProps<TValue, TMeta>['getCell']
  renderCell: UltiGridViewportProps<TValue, TMeta>['renderCell']
  cellText: (cell: TableCell<TValue, TMeta>, row: number, column: number) => string
  beginSelection: (
    address: CellAddress,
    event: ReactPointerEvent<HTMLDivElement>,
    cell: TableCell<TValue, TMeta>,
  ) => void
  extendSelection: (address: CellAddress) => void
  showTouchHandle: boolean
  selectionHandleLabel: string
  beginTouchSelectionExtension: (
    address: CellAddress,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void
  resizeColumn: number | null
  resizeWidth: number
  resizeMinWidth: number
  resizeMaxWidth: number
  resizeHandleLabel: string
  resizeHandlePosition: number
  resizeFromStart: boolean
  resizeScrollsWithViewport: boolean
  beginColumnResize: (
    viewportColumn: number,
    direction: 1 | -1,
    scrollColumns: boolean,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void
  resizeColumnWithKeyboard: (
    viewportColumn: number,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void
}

function CellSurfaceImpl<TValue = CellPrimitive, TMeta = unknown>({
  row,
  column,
  rowEnd,
  columnEnd,
  left,
  top,
  width,
  height,
  merged,
  renderCustomContent,
  selected,
  active,
  range,
  getCell,
  renderCell,
  cellText,
  beginSelection,
  extendSelection,
  showTouchHandle,
  selectionHandleLabel,
  beginTouchSelectionExtension,
  resizeColumn,
  resizeWidth,
  resizeMinWidth,
  resizeMaxWidth,
  resizeHandleLabel,
  resizeHandlePosition,
  resizeFromStart,
  resizeScrollsWithViewport,
  beginColumnResize,
  resizeColumnWithKeyboard,
}: CellSurfaceProps<TValue, TMeta>) {
  const source = normalizeCell(getCell(row, column))
  const text = cellText(source, row, column)
  const content = !renderCustomContent
    ? null
    : renderCell
      ? renderCell({ row, column, cell: source, selected, active, merged, range })
      : text
  const address = { row, column }
  const cellStyle: CSSProperties = {
    ...source.style,
    left,
    top,
    width,
    height,
    transform: undefined,
  }

  return (
    <div
      role="gridcell"
      aria-rowindex={row + 1}
      aria-colindex={column + 1}
      aria-selected={selected}
      aria-label={source.ariaLabel}
      aria-level={source.ariaLevel}
      aria-expanded={source.ariaExpanded}
      aria-hidden={merged && !renderCustomContent ? true : undefined}
      className={[
        'ultigrid-cell',
        merged && 'ultigrid-cell--merged',
        merged && !renderCustomContent && 'ultigrid-cell--merge-fragment',
        selected && 'is-selected',
        active && 'is-active',
        showTouchHandle && 'has-touch-handle',
        resizeColumn !== null && 'has-column-resize',
        source.className,
      ].filter(Boolean).join(' ')}
      style={cellStyle}
      data-ultigrid-cell="true"
      data-merged={merged ? 'true' : 'false'}
      data-row={row}
      data-column={column}
      data-row-end={rowEnd}
      data-column-end={columnEnd}
      title={!renderCustomContent || renderCell ? undefined : text}
      onPointerDown={(event) => beginSelection(address, event, source)}
      onPointerEnter={() => extendSelection(address)}
    >
      <div className="ultigrid-cell__content">{content}</div>
      {showTouchHandle ? (
        <button
          type="button"
          className="ultigrid-selection-handle"
          aria-label={selectionHandleLabel}
          title={selectionHandleLabel}
          tabIndex={-1}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={(event) => beginTouchSelectionExtension(address, event)}
        />
      ) : null}
      {resizeColumn !== null ? (
        <div
          className="ultigrid-column-resize-handle"
          role="separator"
          aria-label={resizeHandleLabel}
          aria-orientation="vertical"
          aria-valuemin={resizeMinWidth}
          aria-valuemax={resizeMaxWidth}
          aria-valuenow={resizeWidth}
          tabIndex={0}
          data-viewport-column={resizeColumn}
          data-resize-edge={resizeFromStart ? 'start' : 'end'}
          style={{ left: resizeHandlePosition }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => resizeColumnWithKeyboard(resizeColumn, event)}
          onPointerDown={(event) => beginColumnResize(
            resizeColumn,
            resizeFromStart ? -1 : 1,
            resizeScrollsWithViewport,
            event,
          )}
        />
      ) : null}
    </div>
  )
}

const CellSurface = memo(CellSurfaceImpl) as typeof CellSurfaceImpl

export function UltiGridViewport<TValue = CellPrimitive, TMeta = unknown>(
  props: UltiGridViewportProps<TValue, TMeta>,
) {
  const {
    rowCount,
    columnCount,
    getCell,
    getCellText,
    renderCell,
    defaultRowHeight = 34,
    defaultColumnWidth = 136,
    rowHeights,
    columnWidths,
    getRowHeight,
    getColumnWidth,
    mergedCells = EMPTY_MERGES,
    frozen,
    overscan,
    autoSize,
    contentVersion,
    columnLayoutVersion,
    fitColumns = 'stretch',
    selection: controlledSelection,
    defaultSelection = null,
    selectionBounds,
    onSelectionChange,
    onCellClick,
    onViewportChange,
    onCopy,
    copyCellLimit = DEFAULT_COPY_LIMIT,
    themeColor,
    mobileInteraction,
    columnResize,
    onColumnResize,
    className,
    style,
    ariaLabel = 'Virtual data grid',
    ariaRole = 'grid',
    emptyContent = null,
    apiRef,
  } = props

  const selectableBounds = useMemo(
    () => resolveSelectionBounds(selectionBounds, rowCount, columnCount),
    [selectionBounds, rowCount, columnCount],
  )
  const boundedDefaultSelection = useMemo(
    () => clampRangeToBounds(defaultSelection, selectableBounds),
    [defaultSelection, selectableBounds],
  )

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const paneLayersRef = useRef(new Map<string, PaneLayer>())
  const paneLayerCallbacksRef = useRef(new Map<string, RefCallback<HTMLDivElement>>())
  const scrollRafRef = useRef<number | null>(null)
  const dragAutoScrollRafRef = useRef<number | null>(null)
  const columnResizeRafRef = useRef<number | null>(null)
  const dragAutoScrollCallbackRef = useRef<() => void>(() => undefined)
  const dragRef = useRef(false)
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const dragPointerTypeRef = useRef<string | null>(null)
  const touchDragScrollAxisRef = useRef<TouchDragScrollAxisSession | null>(null)
  const touchTapRef = useRef<TouchTapTarget<TValue, TMeta> | null>(null)
  const horizontalTouchScrollRef = useRef<HorizontalTouchScrollSession | null>(null)
  const horizontalScrollInertiaRafRef = useRef<number | null>(null)
  const columnResizeSessionRef = useRef<ColumnResizeSession | null>(null)
  const pendingColumnResizeRef = useRef<PendingColumnResize | null>(null)
  const lastScrollRef = useRef({ top: 0, left: 0 })
  const measuredRowsRef = useRef(new Map<number, number>())
  const measuredColumnsRef = useRef(new Map<number, number>())
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  const [axisRevision, setAxisRevision] = useState(0)
  const [resizedColumnWidths, setResizedColumnWidths] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  )
  const [stretchBaselineColumnWidths, setStretchBaselineColumnWidths] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  )
  const [columnMeasurementRevision, setColumnMeasurementRevision] = useState(0)
  const [columnResizeGuideX, setColumnResizeGuideX] = useState<number | null>(null)
  const [manualColumnFitDisabled, setManualColumnFitDisabled] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastInputWasTouch, setLastInputWasTouch] = useState(false)
  const copyFeedbackTimerRef = useRef<number | null>(null)
  const columnResizeResetInputsRef = useRef({
    columnCount,
    defaultColumnWidth,
    fitColumns,
    columnLayoutVersion,
  })
  const [internalSelection, setInternalSelection] = useState<CellRange | null>(() =>
    boundedDefaultSelection,
  )
  const selectionModelRef = useRef<SelectionModel | null>(boundedDefaultSelection ? {
    anchor: {
      row: boundedDefaultSelection.rowStart,
      column: boundedDefaultSelection.columnStart,
    },
    focus: {
      row: boundedDefaultSelection.rowEnd,
      column: boundedDefaultSelection.columnEnd,
    },
  } : null)
  const mobileOptions = useMemo(
    () => resolveMobileInteractionOptions(mobileInteraction),
    [mobileInteraction],
  )
  const mobileEnabled = useMobileInteractionEnabled(mobileOptions, lastInputWasTouch)
  const dominantTouchScrollEnabled = mobileOptions.mode !== 'off'
    && mobileOptions.scrollAxisLock === 'dominant'
  const columnResizeOptions = useMemo(
    () => resolveColumnResizeOptions(columnResize),
    [columnResize],
  )

  useEffect(() => {
    setResizedColumnWidths((current) => {
      let changed = false
      const next = new Map<number, number>()
      for (const [column, width] of current) {
        if (column < columnCount) next.set(column, width)
        else changed = true
      }
      return changed ? next : current
    })
    setStretchBaselineColumnWidths((current) => {
      let changed = false
      const next = new Map<number, number>()
      for (const [column, width] of current) {
        if (column < columnCount) next.set(column, width)
        else changed = true
      }
      return changed ? next : current
    })
  }, [columnCount])

  const rawSelection = controlledSelection === undefined
    ? internalSelection
    : controlledSelection
  const selection = useMemo(
    () => clampRangeToBounds(rawSelection, selectableBounds),
    [rawSelection, selectableBounds],
  )

  const rowOverrides = useMemo(
    () => collectOverrides(rowCount, rowHeights, getRowHeight),
    [rowCount, rowHeights, getRowHeight],
  )
  const columnOverrides = useMemo(
    () => collectOverrides(columnCount, columnWidths, getColumnWidth),
    [columnCount, columnWidths, getColumnWidth, columnLayoutVersion],
  )
  const resolvedColumnOverrides = useMemo(
    () => mergeColumnWidthLayers(columnCount, {
      configured: columnOverrides,
      stretchBaseline: stretchBaselineColumnWidths,
      measured: measuredColumnsRef.current,
      manuallyResized: resizedColumnWidths,
    }),
    [
      columnCount,
      columnMeasurementRevision,
      columnOverrides,
      resizedColumnWidths,
      stretchBaselineColumnWidths,
    ],
  )

  const rowAxis = useMemo(
    () => new Axis({
      count: rowCount,
      defaultSize: defaultRowHeight,
      overrides: mergeOverrides(rowOverrides, measuredRowsRef.current, rowCount),
    }),
    [rowCount, defaultRowHeight, rowOverrides],
  )
  const columnAxis = useMemo(
    () => new Axis({
      count: columnCount,
      defaultSize: defaultColumnWidth,
      overrides: resolvedColumnOverrides,
    }),
    [columnCount, defaultColumnWidth, resolvedColumnOverrides],
  )
  columnAxis.setContainerSize(size.width)
  columnAxis.setStretch(fitColumns === 'stretch' && !manualColumnFitDisabled)

  const mergeIndex = useMemo(() => {
    const regions: MergeRegion<CellRange>[] = []
    for (const source of mergedCells) {
      if (rowCount === 0 || columnCount === 0) break
      const normalized = normalizeRange(source)
      if (
        normalized.rowEnd < 0 || normalized.rowStart >= rowCount ||
        normalized.columnEnd < 0 || normalized.columnStart >= columnCount
      ) continue
      const region = {
        rowStart: clamp(normalized.rowStart, 0, rowCount - 1),
        rowEnd: clamp(normalized.rowEnd, 0, rowCount - 1),
        columnStart: clamp(normalized.columnStart, 0, columnCount - 1),
        columnEnd: clamp(normalized.columnEnd, 0, columnCount - 1),
      }
      if (region.rowStart > region.rowEnd || region.columnStart > region.columnEnd) continue
      regions.push({
        ...region,
        id: source.id ?? mergeId(region),
        data: region,
      })
    }
    return new MergeIndex(regions)
  }, [mergedCells, rowCount, columnCount])

  const requestedFixed = useMemo(
    () => normalizeFrozen(rowCount, columnCount, frozen),
    [rowCount, columnCount, frozen],
  )
  const fixed = useMemo(
    () => constrainFrozen(requestedFixed, rowAxis, columnAxis, size),
    [requestedFixed, rowAxis, columnAxis, size, axisRevision],
  )

  const dimensions = useMemo(() => {
    const topHeight = rowAxis.getOffset(fixed.top)
    const bottomStart = rowCount - fixed.bottom
    const bottomHeight = rowAxis.totalSize - rowAxis.getOffset(bottomStart)
    const leftWidth = columnAxis.getOffset(fixed.left)
    const rightStart = columnCount - fixed.right
    const rightWidth = columnAxis.totalSize - columnAxis.getOffset(rightStart)
    return {
      topHeight,
      bottomHeight,
      bottomStart,
      leftWidth,
      rightWidth,
      rightStart,
      centerWidth: Math.max(0, size.width - leftWidth - rightWidth),
      centerHeight: Math.max(0, size.height - topHeight - bottomHeight),
    }
    // axisRevision tracks imperative measurements on the mutable axes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowAxis, columnAxis, rowCount, columnCount, fixed, size, axisRevision])

  const rowOverscan = overscan?.rows ?? 3
  const columnOverscan = overscan?.columns ?? 2
  const [windowState, setWindowState] = useState<WindowState>(() => ({
    rows: EMPTY_INDEX_WINDOW,
    columns: EMPTY_INDEX_WINDOW,
  }))
  const renderWindowRef = useRef<WindowState>(windowState)
  const renderOverscanRef = useRef({ rows: rowOverscan, columns: columnOverscan })

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
    rowAxis,
    columnAxis,
    dimensions,
    fixed,
    rowCount,
    columnCount,
  ])

  const renderedRowCount = countWindow(windowState.rows) + fixed.top + fixed.bottom
  const renderedColumnCount = countWindow(windowState.columns) + fixed.left + fixed.right

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
    const snapshot: ViewportSnapshot = {
      rowStart: visibleWindow.rows.start,
      rowEnd: visibleWindow.rows.end,
      columnStart: visibleWindow.columns.start,
      columnEnd: visibleWindow.columns.end,
      visibleCellCount: visibleRows * visibleColumns,
      renderedCellCount: nextRenderedRows * nextRenderedColumns,
      scrollTop: top,
      scrollLeft: left,
    }
    onViewportChange(snapshot)
  }, [onViewportChange, fixed])

  const getPaneLayerRef = useCallback((
    paneId: string,
    rowKind: BandKind,
    columnKind: BandKind,
  ): RefCallback<HTMLDivElement> => {
    const existing = paneLayerCallbacksRef.current.get(paneId)
    if (existing) return existing
    const callback: RefCallback<HTMLDivElement> = (element) => {
      if (!element) {
        paneLayersRef.current.delete(paneId)
        return
      }
      const layer = {
        element,
        scrollRows: rowKind === 'middle',
        scrollColumns: columnKind === 'middle',
      }
      paneLayersRef.current.set(paneId, layer)
      applyPaneLayerTransform(layer, lastScrollRef.current.top, lastScrollRef.current.left)
    }
    paneLayerCallbacksRef.current.set(paneId, callback)
    return callback
  }, [])

  const syncPaneTransforms = useCallback((top: number, left: number) => {
    for (const layer of paneLayersRef.current.values()) {
      applyPaneLayerTransform(layer, top, left)
    }
  }, [])

  const syncScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller || !viewportRef.current) return
    const top = scroller.scrollTop
    const left = scroller.scrollLeft
    const previousScroll = lastScrollRef.current
    const rowDirection = scrollDirection(top, previousScroll.top)
    const columnDirection = scrollDirection(left, previousScroll.left)
    lastScrollRef.current = { top, left }
    syncPaneTransforms(top, left)
    const resizeSession = columnResizeSessionRef.current
    if (resizeSession?.scrollColumns) {
      const guideX = resizeSession.guideStartX
        + (resizeSession.currentWidth - resizeSession.startWidth) * resizeSession.direction
        - (left - resizeSession.startScrollLeft)
      if (guideX !== resizeSession.currentGuideX) {
        resizeSession.currentGuideX = guideX
        setColumnResizeGuideX(guideX)
      }
    }

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
    syncPaneTransforms,
  ])

  const cancelPendingColumnResize = useCallback(() => {
    const pendingResize = pendingColumnResizeRef.current
    if (!pendingResize) return
    if (pendingResize.timer !== null) window.clearTimeout(pendingResize.timer)
    pendingColumnResizeRef.current = null
  }, [])

  const handleScroll = useCallback(() => {
    cancelPendingColumnResize()
    // Any scroll is authoritative: even sub-slop movement must never turn into
    // a selection when the finger lifts.
    touchTapRef.current = null
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      syncScroll()
    })
  }, [cancelPendingColumnResize, syncScroll])

  const stopHorizontalScrollInertia = useCallback(() => {
    if (horizontalScrollInertiaRafRef.current !== null) {
      cancelAnimationFrame(horizontalScrollInertiaRafRef.current)
      horizontalScrollInertiaRafRef.current = null
    }
    scrollerRef.current?.removeAttribute('data-scroll-axis')
  }, [])

  const cancelHorizontalTouchScroll = useCallback(() => {
    const session = horizontalTouchScrollRef.current
    horizontalTouchScrollRef.current = null
    if (session?.captureTarget) {
      try {
        if (session.captureTarget.hasPointerCapture?.(session.pointerId)) {
          session.captureTarget.releasePointerCapture?.(session.pointerId)
        }
      } catch {
        // A detached scroller may reject capture cleanup.
      }
    }
    if (horizontalScrollInertiaRafRef.current === null) {
      scrollerRef.current?.removeAttribute('data-scroll-axis')
    }
  }, [])

  const cancelHorizontalTouchMotion = useCallback(() => {
    cancelHorizontalTouchScroll()
    stopHorizontalScrollInertia()
  }, [cancelHorizontalTouchScroll, stopHorizontalScrollInertia])

  const startHorizontalScrollInertia = useCallback((initialVelocity: number) => {
    stopHorizontalScrollInertia()
    const scroller = scrollerRef.current
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!scroller || reduceMotion || Math.abs(initialVelocity) < 0.02) return

    let velocity = clamp(initialVelocity, -3.5, 3.5)
    let previousTime = performance.now()
    scroller.dataset.scrollAxis = 'horizontal'
    const step = (now: number) => {
      const elapsed = Math.min(32, Math.max(1, now - previousTime))
      previousTime = now
      const previousLeft = scroller.scrollLeft
      scroller.scrollLeft += velocity * elapsed
      if (scroller.scrollLeft === previousLeft) {
        horizontalScrollInertiaRafRef.current = null
        scroller.removeAttribute('data-scroll-axis')
        return
      }
      velocity *= Math.pow(0.94, elapsed / (1000 / 60))
      if (Math.abs(velocity) < 0.02) {
        horizontalScrollInertiaRafRef.current = null
        scroller.removeAttribute('data-scroll-axis')
        return
      }
      horizontalScrollInertiaRafRef.current = requestAnimationFrame(step)
    }
    horizontalScrollInertiaRafRef.current = requestAnimationFrame(step)
  }, [stopHorizontalScrollInertia])

  const beginHorizontalTouchScroll = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target
    if (
      target instanceof Element
      && target.closest('.ultigrid-scroller') !== event.currentTarget
    ) return
    if (event.pointerType !== 'touch') {
      if (event.isPrimary && event.button === 0) {
        cancelHorizontalTouchMotion()
      }
      return
    }
    if (!event.isPrimary) {
      cancelHorizontalTouchMotion()
      return
    }
    if (!dominantTouchScrollEnabled || event.button !== 0) return
    cancelHorizontalTouchMotion()
    if (target instanceof Element && target.closest('.ultigrid-selection-handle')) return
    const scroller = scrollerRef.current
    if (!scroller || columnResizeSessionRef.current || dragRef.current) return
    horizontalTouchScrollRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastScrollLeft: scroller.scrollLeft,
      lastTime: event.timeStamp,
      velocity: 0,
      locked: false,
      captureTarget: null,
    }
  }, [
    cancelHorizontalTouchMotion,
    dominantTouchScrollEnabled,
  ])

  const updateHorizontalTouchScroll = useCallback((event: PointerEvent) => {
    const session = horizontalTouchScrollRef.current
    const scroller = scrollerRef.current
    if (!session || !scroller || session.pointerId !== event.pointerId) return
    if (!event.isPrimary || event.pointerType !== 'touch') {
      cancelHorizontalTouchScroll()
      return
    }

    if (!session.locked) {
      const intent = resolveTouchScrollIntent(
        session.startX,
        session.startY,
        event.clientX,
        event.clientY,
        mobileOptions.tapSlop,
      )
      if (intent === null) return
      cancelPendingColumnResize()
      if (intent === 'vertical') {
        cancelHorizontalTouchScroll()
        return
      }
      session.locked = true
      session.captureTarget = scroller
      scroller.dataset.scrollAxis = 'horizontal'
      try {
        scroller.setPointerCapture?.(event.pointerId)
      } catch {
        // Window listeners keep the gesture alive where capture is unavailable.
      }
    }

    if (event.cancelable) event.preventDefault()
    scroller.scrollLeft -= event.clientX - session.lastX
    session.lastX = event.clientX
    const elapsed = Math.max(1, event.timeStamp - session.lastTime)
    const instantVelocity = (scroller.scrollLeft - session.lastScrollLeft) / elapsed
    const reversedDirection = instantVelocity !== 0
      && session.velocity !== 0
      && Math.sign(instantVelocity) !== Math.sign(session.velocity)
    session.velocity = session.velocity === 0 || reversedDirection
      ? instantVelocity
      : session.velocity * 0.65 + instantVelocity * 0.35
    session.lastScrollLeft = scroller.scrollLeft
    session.lastTime = event.timeStamp
  }, [cancelHorizontalTouchScroll, cancelPendingColumnResize, mobileOptions.tapSlop])

  const finishHorizontalTouchScroll = useCallback((
    pointerId: number,
    timeStamp: number,
    momentum: boolean,
  ) => {
    const session = horizontalTouchScrollRef.current
    if (!session || session.pointerId !== pointerId) return
    const recentlyMoved = timeStamp - session.lastTime < 80
    const velocity = session.locked && recentlyMoved ? session.velocity : 0
    cancelHorizontalTouchScroll()
    if (momentum && velocity !== 0) startHorizontalScrollInertia(velocity)
  }, [cancelHorizontalTouchScroll, startHorizontalScrollInertia])

  useEffect(() => {
    if (dominantTouchScrollEnabled) return
    cancelHorizontalTouchScroll()
    stopHorizontalScrollInertia()
  }, [
    cancelHorizontalTouchScroll,
    dominantTouchScrollEnabled,
    stopHorizontalScrollInertia,
  ])

  useLayoutEffect(() => {
    const root = rootRef.current
    const scroller = scrollerRef.current
    if (!root || !scroller) return

    const updateSize = () => {
      const next = { width: scroller.clientWidth, height: scroller.clientHeight }
      setSize((previous) => previous.width === next.width && previous.height === next.height
        ? previous
        : next)
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    syncScroll()
  }, [syncScroll, axisRevision])

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
  }, [])

  const commitSelection = useCallback((next: SelectionModel | null) => {
    const stableModel = next && selectableBounds ? {
      anchor: clampAddressToRange(next.anchor, selectableBounds),
      focus: clampAddressToRange(next.focus, selectableBounds),
    } : null
    selectionModelRef.current = stableModel
    const normalized = stableModel ? normalizeRange({
      rowStart: stableModel.anchor.row,
      rowEnd: stableModel.focus.row,
      columnStart: stableModel.anchor.column,
      columnEnd: stableModel.focus.column,
    }) : null
    if (controlledSelection === undefined) setInternalSelection(normalized)
    onSelectionChange?.(normalized)
  }, [controlledSelection, onSelectionChange, selectableBounds])

  useEffect(() => {
    if (controlledSelection === undefined) return
    selectionModelRef.current = reconcileSelectionModel(
      selectionModelRef.current,
      selection,
      selectableBounds,
    )
  }, [controlledSelection, selection, selectableBounds])

  useEffect(() => {
    if (controlledSelection !== undefined || rangesEqual(internalSelection, selection)) return
    setInternalSelection(selection)
    selectionModelRef.current = reconcileSelectionModel(
      selectionModelRef.current,
      selection,
      selectableBounds,
    )
    onSelectionChange?.(selection)
  }, [
    controlledSelection,
    internalSelection,
    onSelectionChange,
    selectableBounds,
    selection,
  ])

  const scrollToCell = useCallback((address: CellAddress, align: 'auto' | 'start' | 'center' | 'end' = 'auto') => {
    const scroller = scrollerRef.current
    if (!scroller || rowCount === 0 || columnCount === 0) return
    cancelHorizontalTouchMotion()
    const row = clamp(address.row, 0, rowCount - 1)
    const column = clamp(address.column, 0, columnCount - 1)
    let nextTop = scroller.scrollTop
    let nextLeft = scroller.scrollLeft

    if (row >= fixed.top && row < rowCount - fixed.bottom) {
      nextTop = alignedScrollOffset(
        rowAxis.getOffset(row),
        rowAxis.getOffset(row + 1),
        scroller.scrollTop,
        dimensions.topHeight,
        size.height - dimensions.bottomHeight,
        align,
      )
    }
    if (column >= fixed.left && column < columnCount - fixed.right) {
      nextLeft = alignedScrollOffset(
        columnAxis.getOffset(column),
        columnAxis.getOffset(column + 1),
        scroller.scrollLeft,
        dimensions.leftWidth,
        size.width - dimensions.rightWidth,
        align,
      )
    }

    scroller.scrollTo({ top: nextTop, left: nextLeft, behavior: 'auto' })
  }, [
    rowCount,
    columnCount,
    fixed,
    rowAxis,
    columnAxis,
    dimensions,
    size,
    cancelHorizontalTouchMotion,
  ])

  const cellText = useCallback((cell: TableCell<TValue, TMeta>, row: number, column: number) => {
    if (getCellText) return getCellText(cell, row, column)
    if (cell.text !== undefined) return cell.text
    return cell.value === null || cell.value === undefined ? '' : String(cell.value)
  }, [getCellText])

  const copySelection = useCallback(async () => {
    if (!selection) return ''
    const tsv = rangeToTSV(
      selection,
      ({ row, column }) => {
        const cell = normalizeCell(getCell(row, column))
        return cellText(cell, row, column)
      },
      { maxCells: copyCellLimit },
    )
    await writeClipboard(tsv)
    onCopy?.(selection, tsv)
    return tsv
  }, [selection, getCell, cellText, copyCellLimit, onCopy])

  const copySelectionFromMobileAction = useCallback(async () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current)
      copyFeedbackTimerRef.current = null
    }
    try {
      await copySelection()
      setCopyFeedback('success')
    } catch {
      setCopyFeedback('error')
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('idle')
      copyFeedbackTimerRef.current = null
    }, 1_600)
  }, [copySelection])

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!apiRef) return
    const api: UltiGridViewportApi = {
      scrollToCell,
      copySelection,
      getSelection: () => selection,
      getColumnWidth: (viewportColumn) => (
        Number.isSafeInteger(viewportColumn)
        && viewportColumn >= 0
        && viewportColumn < columnCount
          ? columnAxis.getSize(viewportColumn)
          : undefined
      ),
      focus: () => rootRef.current?.focus(),
    }
    apiRef.current = api
    return () => {
      if (apiRef.current === api) apiRef.current = null
    }
  }, [apiRef, scrollToCell, copySelection, selection, columnAxis, columnCount])

  const storeResizedColumnWidth = useCallback((viewportColumn: number, width: number) => {
    setResizedColumnWidths((current) => {
      if (current.get(viewportColumn) === width) return current
      const next = new Map(current)
      next.set(viewportColumn, width)
      return next
    })
  }, [])

  const activateColumnResize = useCallback((pending: PendingColumnResize) => {
    if (
      columnResizeSessionRef.current
      || pending.viewportColumn < 0
      || pending.viewportColumn >= columnCount
    ) return
    cancelHorizontalTouchMotion()
    const { captureTarget, direction, input, pointerId, scrollColumns, startX, viewportColumn } = pending
    const width = columnAxis.getSize(viewportColumn)
    const axisStretchBefore = columnAxis.stretch
    let pendingStretchBaseline: Map<number, number> | null = null
    let axisRollback: ColumnSizeSnapshot[]
    if (columnAxis.totalSize > columnAxis.contentSize) {
      const effectiveWidths = new Map<number, number>()
      axisRollback = []
      for (let column = 0; column < columnCount; column += 1) {
        effectiveWidths.set(column, columnAxis.getSize(column))
        axisRollback.push(captureColumnSize(columnAxis, column))
      }
      columnAxis.setStretch(false)
      columnAxis.setSizes(effectiveWidths)
      pendingStretchBaseline = effectiveWidths
    } else {
      axisRollback = [captureColumnSize(columnAxis, viewportColumn)]
      columnAxis.setStretch(false)
    }
    setManualColumnFitDisabled(true)
    const root = rootRef.current
    const rootLeft = root ? root.getBoundingClientRect().left + root.clientLeft : 0
    const targetBounds = captureTarget.getBoundingClientRect()
    const guideStartX = targetBounds.left + targetBounds.width / 2 - rootLeft
    captureTarget.classList.add('is-resizing')
    try {
      captureTarget.setPointerCapture?.(pointerId)
    } catch {
      // Detached test targets and older engines may reject capture; window listeners remain as fallback.
    }
    const session: ColumnResizeSession = {
      pointerId,
      viewportColumn,
      startX,
      latestX: startX,
      startWidth: width,
      currentWidth: width,
      guideStartX,
      currentGuideX: guideStartX,
      startScrollLeft: scrollerRef.current?.scrollLeft ?? 0,
      scrollColumns,
      direction,
      axis: columnAxis,
      axisRollback,
      axisStretchBefore,
      pendingStretchBaseline,
      previousManualFitDisabled: manualColumnFitDisabled,
      input,
      captureTarget,
    }
    columnResizeSessionRef.current = session
    if (input === 'touch') {
      window.addEventListener('touchmove', preventActiveTouchResizeScroll, { passive: false })
    }
    setColumnResizeGuideX(guideStartX)
    onColumnResize?.({
      viewportColumn,
      width,
      previousWidth: width,
      phase: 'start',
      input,
    })
  }, [
    cancelHorizontalTouchMotion,
    columnAxis,
    columnCount,
    manualColumnFitDisabled,
    onColumnResize,
  ])

  const beginColumnResize = useCallback((
    viewportColumn: number,
    direction: 1 | -1,
    scrollColumns: boolean,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      !event.isPrimary
      || event.button !== 0
      || columnResizeSessionRef.current
      || pendingColumnResizeRef.current
    ) return
    const input = normalizeColumnResizeInput(event.pointerType)
    setLastInputWasTouch(input === 'touch')
    event.stopPropagation()
    touchTapRef.current = null
    const pending: PendingColumnResize = {
      pointerId: event.pointerId,
      viewportColumn,
      direction,
      scrollColumns,
      startX: event.clientX,
      startY: event.clientY,
      input,
      captureTarget: event.currentTarget,
      timer: null,
    }
    if (input !== 'touch') {
      event.preventDefault()
      activateColumnResize(pending)
      return
    }
    pendingColumnResizeRef.current = pending
    if (columnResizeOptions.touchActivationDelay === 0) {
      event.preventDefault()
      pendingColumnResizeRef.current = null
      activateColumnResize(pending)
      return
    }
    pending.timer = window.setTimeout(() => {
      if (pendingColumnResizeRef.current !== pending) return
      pendingColumnResizeRef.current = null
      pending.timer = null
      activateColumnResize(pending)
    }, columnResizeOptions.touchActivationDelay)
  }, [activateColumnResize, columnResizeOptions.touchActivationDelay])

  const resizeColumnWithKeyboard = useCallback((
    viewportColumn: number,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const currentWidth = columnAxis.getSize(viewportColumn)
    const bounds = resolveColumnWidthBounds(columnResizeOptions, viewportColumn)
    const width = getKeyboardColumnWidth(
      event.key,
      currentWidth,
      bounds,
      columnResizeOptions.keyboardStep,
      event,
    )
    if (width === null) return
    setLastInputWasTouch(false)
    event.preventDefault()
    event.stopPropagation()
    if (width === currentWidth) return
    if (!manualColumnFitDisabled && columnAxis.totalSize > columnAxis.contentSize) {
      const frozenWidths = new Map(resizedColumnWidths)
      for (let column = 0; column < columnCount; column += 1) {
        frozenWidths.set(column, columnAxis.getSize(column))
      }
      setStretchBaselineColumnWidths(frozenWidths)
    }
    storeResizedColumnWidth(viewportColumn, width)
    setManualColumnFitDisabled(true)
    onColumnResize?.({
      viewportColumn,
      width,
      previousWidth: currentWidth,
      phase: 'end',
      input: 'keyboard',
    })
  }, [
    columnAxis,
    columnCount,
    columnResizeOptions,
    manualColumnFitDisabled,
    onColumnResize,
    resizedColumnWidths,
    storeResizedColumnWidth,
  ])

  const cancelColumnResize = useCallback(() => {
    const session = columnResizeSessionRef.current
    if (!session) return
    columnResizeSessionRef.current = null
    if (columnResizeRafRef.current !== null) {
      cancelAnimationFrame(columnResizeRafRef.current)
      columnResizeRafRef.current = null
    }
    restoreColumnResizeAxis(session)
    releaseColumnResizePointer(session)
    setColumnResizeGuideX(null)
    setManualColumnFitDisabled(session.previousManualFitDisabled)
    setAxisRevision((revision) => revision + 1)
    onColumnResize?.({
      viewportColumn: session.viewportColumn,
      width: session.startWidth,
      previousWidth: session.startWidth,
      phase: 'cancel',
      input: session.input,
    })
  }, [onColumnResize])

  useEffect(() => {
    if (!columnResizeOptions.enabled) return
    const applyPointerResize = (session: ColumnResizeSession, clientX: number) => {
      const delta = clientX - session.startX
      const bounds = resolveColumnWidthBounds(columnResizeOptions, session.viewportColumn)
      const width = delta === 0
        ? session.startWidth
        : getPointerColumnWidth(
            session.startWidth,
            session.startX,
            clientX,
            session.direction,
            bounds,
          )
      if (width === session.currentWidth) return
      session.currentWidth = width
      session.axis.setSize(session.viewportColumn, width)
      const currentScrollLeft = scrollerRef.current?.scrollLeft ?? session.startScrollLeft
      const guideX = session.guideStartX
        + (width - session.startWidth) * session.direction
        - (session.scrollColumns ? currentScrollLeft - session.startScrollLeft : 0)
      session.currentGuideX = guideX
      setColumnResizeGuideX(guideX)
      setAxisRevision((revision) => revision + 1)
      onColumnResize?.({
        viewportColumn: session.viewportColumn,
        width,
        previousWidth: session.startWidth,
        phase: 'change',
        input: session.input,
      })
    }
    const flushPointerResize = () => {
      columnResizeRafRef.current = null
      const session = columnResizeSessionRef.current
      if (session) applyPointerResize(session, session.latestX)
    }
    const updatePointerResize = (event: PointerEvent) => {
      const pending = pendingColumnResizeRef.current
      if (pending?.pointerId === event.pointerId) {
        if (hasTouchResizeMoved(
          pending.startX,
          pending.startY,
          event.clientX,
          event.clientY,
          Math.min(10, mobileOptions.tapSlop),
        )) cancelPendingColumnResize()
        return
      }
      const session = columnResizeSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      if (session.input !== 'touch' && event.buttons === 0) {
        endPointerResize(event)
        return
      }
      if (event.cancelable) event.preventDefault()
      session.latestX = event.clientX
      if (columnResizeRafRef.current === null) {
        columnResizeRafRef.current = requestAnimationFrame(flushPointerResize)
      }
    }
    const endPointerResize = (event: PointerEvent) => {
      if (pendingColumnResizeRef.current?.pointerId === event.pointerId) {
        cancelPendingColumnResize()
        return
      }
      const session = columnResizeSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      if (columnResizeRafRef.current !== null) {
        cancelAnimationFrame(columnResizeRafRef.current)
        columnResizeRafRef.current = null
      }
      session.latestX = event.clientX
      applyPointerResize(session, event.clientX)
      columnResizeSessionRef.current = null
      releaseColumnResizePointer(session)
      setColumnResizeGuideX(null)
      if (session.currentWidth === session.startWidth) {
        restoreColumnResizeAxis(session)
        setManualColumnFitDisabled(session.previousManualFitDisabled)
        setAxisRevision((revision) => revision + 1)
      } else {
        if (session.pendingStretchBaseline) {
          setStretchBaselineColumnWidths(session.pendingStretchBaseline)
        }
        storeResizedColumnWidth(session.viewportColumn, session.currentWidth)
      }
      onColumnResize?.({
        viewportColumn: session.viewportColumn,
        width: session.currentWidth,
        previousWidth: session.startWidth,
        phase: 'end',
        input: session.input,
      })
    }
    const cancelPointerResize = (event: PointerEvent) => {
      if (pendingColumnResizeRef.current?.pointerId === event.pointerId) {
        cancelPendingColumnResize()
      }
      if (columnResizeSessionRef.current?.pointerId !== event.pointerId) return
      cancelColumnResize()
    }
    const cancelResizeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pendingColumnResizeRef.current) cancelPendingColumnResize()
      if (!columnResizeSessionRef.current) return
      event.preventDefault()
      cancelColumnResize()
    }
    const cancelResizeOnBlur = () => {
      cancelPendingColumnResize()
      cancelColumnResize()
    }
    window.addEventListener('pointermove', updatePointerResize)
    window.addEventListener('pointerup', endPointerResize)
    window.addEventListener('pointercancel', cancelPointerResize)
    window.addEventListener('keydown', cancelResizeWithEscape)
    window.addEventListener('blur', cancelResizeOnBlur)
    return () => {
      window.removeEventListener('pointermove', updatePointerResize)
      window.removeEventListener('pointerup', endPointerResize)
      window.removeEventListener('pointercancel', cancelPointerResize)
      window.removeEventListener('keydown', cancelResizeWithEscape)
      window.removeEventListener('blur', cancelResizeOnBlur)
    }
  }, [
    cancelColumnResize,
    cancelPendingColumnResize,
    columnResizeOptions,
    mobileOptions.tapSlop,
    onColumnResize,
    storeResizedColumnWidth,
  ])

  useLayoutEffect(() => {
    const previous = columnResizeResetInputsRef.current
    const next = {
      columnCount,
      defaultColumnWidth,
      fitColumns,
      columnLayoutVersion,
    }
    const changed = didColumnLayoutContractChange(previous, next)
    columnResizeResetInputsRef.current = next
    if (!changed) return
    const fitChanged = previous.fitColumns !== fitColumns
    const measurementContractChanged = previous.columnCount !== columnCount
      || previous.defaultColumnWidth !== defaultColumnWidth
      || previous.columnLayoutVersion !== columnLayoutVersion
    cancelPendingColumnResize()
    cancelColumnResize()
    setResizedColumnWidths((current) => current.size === 0 ? current : new Map())
    setStretchBaselineColumnWidths((current) => current.size === 0 ? current : new Map())
    setManualColumnFitDisabled(false)
    if (measurementContractChanged) {
      measuredColumnsRef.current.clear()
      setColumnMeasurementRevision((revision) => revision + 1)
    }
    if (fitChanged) setAxisRevision((revision) => revision + 1)
  }, [
    cancelColumnResize,
    cancelPendingColumnResize,
    columnCount,
    columnLayoutVersion,
    defaultColumnWidth,
    fitColumns,
  ])

  useLayoutEffect(() => {
    if (columnResizeOptions.enabled) return
    cancelPendingColumnResize()
    if (!columnResizeSessionRef.current) return
    cancelColumnResize()
  }, [cancelColumnResize, cancelPendingColumnResize, columnResizeOptions.enabled])

  useEffect(() => () => {
    const pending = pendingColumnResizeRef.current
    if (pending && pending.timer !== null) window.clearTimeout(pending.timer)
    pendingColumnResizeRef.current = null
    if (columnResizeRafRef.current !== null) cancelAnimationFrame(columnResizeRafRef.current)
    const session = columnResizeSessionRef.current
    if (session) releaseColumnResizePointer(session)
    columnResizeSessionRef.current = null
  }, [])

  const beginSelection = useCallback((
    address: CellAddress,
    event: ReactPointerEvent<HTMLDivElement>,
    cell: TableCell<TValue, TMeta>,
  ) => {
    if (event.pointerType === 'touch' && !event.isPrimary) {
      touchTapRef.current = null
      return
    }
    if (!event.isPrimary || event.button !== 0) return
    if (!isAddressInRange(address, selectableBounds)) return
    setLastInputWasTouch(event.pointerType === 'touch')
    if (event.pointerType === 'touch') {
      const gesture = createTouchTapGesture(event.pointerId, event.clientX, event.clientY)
      touchTapRef.current = { ...gesture, address, cell }
      return
    }
    event.preventDefault()
    touchTapRef.current = null
    touchDragScrollAxisRef.current = null
    rootRef.current?.focus({ preventScroll: true })
    dragRef.current = true
    dragPointerIdRef.current = event.pointerId
    dragPointerTypeRef.current = event.pointerType
    dragPointerRef.current = { x: event.clientX, y: event.clientY }
    if (event.shiftKey && selection) {
      commitSelection({
        anchor: selectionModelRef.current?.anchor
          ?? { row: selection.rowStart, column: selection.columnStart },
        focus: address,
      })
    } else {
      commitSelection({ anchor: address, focus: address })
    }
    onCellClick?.(address, cell)
  }, [selection, selectableBounds, commitSelection, onCellClick])

  const commitTouchTap = useCallback((target: TouchTapTarget<TValue, TMeta>) => {
    rootRef.current?.focus({ preventScroll: true })
    commitSelection({ anchor: target.address, focus: target.address })
    onCellClick?.(target.address, target.cell)
  }, [commitSelection, onCellClick])

  const beginTouchSelectionExtension = useCallback((
    address: CellAddress,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    touchTapRef.current = null
    rootRef.current?.focus({ preventScroll: true })
    dragRef.current = true
    dragPointerIdRef.current = event.pointerId
    dragPointerTypeRef.current = event.pointerType
    dragPointerRef.current = { x: event.clientX, y: event.clientY }
    touchDragScrollAxisRef.current = dominantTouchScrollEnabled && event.pointerType === 'touch'
      ? {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          axis: null,
        }
      : null
    if (!selectionModelRef.current) {
      commitSelection({ anchor: address, focus: address })
    }
  }, [commitSelection, dominantTouchScrollEnabled])

  const extendSelection = useCallback((address: CellAddress) => {
    if (!dragRef.current || !selectableBounds) return
    const boundedAddress = clampAddressToRange(address, selectableBounds)
    if (
      selectionModelRef.current?.focus.row === boundedAddress.row &&
      selectionModelRef.current.focus.column === boundedAddress.column
    ) return
    commitSelection({
      anchor: selectionModelRef.current?.anchor ?? boundedAddress,
      focus: boundedAddress,
    })
  }, [commitSelection, selectableBounds])

  const updateDragSelection = useCallback((pointer: { x: number; y: number }) => {
    const viewport = viewportRef.current
    const scroller = scrollerRef.current
    if (!viewport || !scroller) return
    const rect = viewport.getBoundingClientRect()
    const address = resolveDragAddress(
      pointer,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      {
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
        topHeight: dimensions.topHeight,
        bottomHeight: dimensions.bottomHeight,
        bottomStartOffset: rowAxis.getOffset(dimensions.bottomStart),
        leftWidth: dimensions.leftWidth,
        rightWidth: dimensions.rightWidth,
        rightStartOffset: columnAxis.getOffset(dimensions.rightStart),
      },
      rowAxis,
      columnAxis,
    )
    if (!address) return
    const merge = mergeIndex.getAt(address.row, address.column)
    extendSelection(merge
      ? { row: merge.rowStart, column: merge.columnStart }
      : address)
  }, [dimensions, rowAxis, columnAxis, mergeIndex, extendSelection])

  const runDragAutoScroll = useCallback(() => {
    dragAutoScrollRafRef.current = null
    const pointer = dragPointerRef.current
    const viewport = viewportRef.current
    const scroller = scrollerRef.current
    if (!dragRef.current || !pointer || !viewport || !scroller) return

    const touchAxisSession = dragPointerTypeRef.current === 'touch'
      ? touchDragScrollAxisRef.current
      : null
    if (touchAxisSession && touchAxisSession.axis === null) return

    const bounds = viewport.getBoundingClientRect()
    const velocity = getDragAutoScrollVelocity(pointer, bounds, {
      edgeThreshold: dragPointerTypeRef.current === 'touch'
        ? mobileOptions.edgeAutoScrollThreshold
        : 0,
      axis: touchAxisSession?.axis ?? undefined,
    })
    if (velocity.x === 0 && velocity.y === 0) return

    const previousTop = scroller.scrollTop
    const previousLeft = scroller.scrollLeft
    scroller.scrollTop += velocity.y
    scroller.scrollLeft += velocity.x
    const didScroll = scroller.scrollTop !== previousTop || scroller.scrollLeft !== previousLeft
    if (!didScroll) {
      updateDragSelection(pointer)
      return
    }

    updateDragSelection(pointer)
    dragAutoScrollRafRef.current = requestAnimationFrame(dragAutoScrollCallbackRef.current)
  }, [mobileOptions.edgeAutoScrollThreshold, updateDragSelection])

  useLayoutEffect(() => {
    dragAutoScrollCallbackRef.current = runDragAutoScroll
  }, [runDragAutoScroll])

  const stopDragging = useCallback(() => {
    dragRef.current = false
    dragPointerRef.current = null
    dragPointerIdRef.current = null
    dragPointerTypeRef.current = null
    touchDragScrollAxisRef.current = null
    if (dragAutoScrollRafRef.current !== null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current)
      dragAutoScrollRafRef.current = null
    }
  }, [])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      const touchTarget = touchTapRef.current
      if (touchTarget?.pointerId === event.pointerId) {
        touchTapRef.current = {
          ...touchTarget,
          ...updateTouchTapGesture(
            touchTarget,
            event.pointerId,
            event.clientX,
            event.clientY,
            mobileOptions.tapSlop,
          ),
        }
      }

      updateHorizontalTouchScroll(event)

      if (!dragRef.current || dragPointerIdRef.current !== event.pointerId) return
      if (event.pointerType !== 'touch' && event.buttons === 0) {
        stopDragging()
        return
      }
      const touchAxisSession = touchDragScrollAxisRef.current
      if (
        event.pointerType === 'touch'
        && touchAxisSession?.pointerId === event.pointerId
        && touchAxisSession.axis === null
      ) {
        touchAxisSession.axis = resolveTouchScrollIntent(
          touchAxisSession.startX,
          touchAxisSession.startY,
          event.clientX,
          event.clientY,
          mobileOptions.tapSlop,
        )
      }
      if (event.pointerType === 'touch' && event.cancelable) event.preventDefault()
      const pointer = { x: event.clientX, y: event.clientY }
      dragPointerRef.current = pointer
      updateDragSelection(pointer)
      if (dragAutoScrollRafRef.current === null) {
        dragAutoScrollRafRef.current = requestAnimationFrame(runDragAutoScroll)
      }
    }
    const finishPointer = (event: PointerEvent) => {
      const touchTarget = touchTapRef.current
      if (touchTarget?.pointerId === event.pointerId) {
        touchTapRef.current = null
        if (isCompletedTouchTap(touchTarget, event.pointerId)) commitTouchTap(touchTarget)
      }
      finishHorizontalTouchScroll(event.pointerId, event.timeStamp, true)
      if (dragPointerIdRef.current === event.pointerId) stopDragging()
    }
    const cancelPointer = (event: PointerEvent) => {
      if (touchTapRef.current?.pointerId === event.pointerId) touchTapRef.current = null
      finishHorizontalTouchScroll(event.pointerId, event.timeStamp, false)
      if (dragPointerIdRef.current === event.pointerId) stopDragging()
    }
    const cancelAllPointers = () => {
      touchTapRef.current = null
      cancelHorizontalTouchScroll()
      stopHorizontalScrollInertia()
      stopDragging()
    }
    window.addEventListener('pointermove', trackPointer)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', cancelPointer)
    window.addEventListener('blur', cancelAllPointers)
    return () => {
      window.removeEventListener('pointermove', trackPointer)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', cancelPointer)
      window.removeEventListener('blur', cancelAllPointers)
    }
  }, [
    cancelHorizontalTouchScroll,
    commitTouchTap,
    finishHorizontalTouchScroll,
    mobileOptions.tapSlop,
    runDragAutoScroll,
    stopHorizontalScrollInertia,
    stopDragging,
    updateHorizontalTouchScroll,
    updateDragSelection,
  ])

  useEffect(() => () => {
    touchTapRef.current = null
    cancelHorizontalTouchScroll()
    stopHorizontalScrollInertia()
    stopDragging()
  }, [cancelHorizontalTouchScroll, stopDragging, stopHorizontalScrollInertia])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    setLastInputWasTouch(false)
    cancelHorizontalTouchMotion()
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      if (selection) {
        event.preventDefault()
        void copySelection().catch(() => undefined)
      }
      return
    }

    const direction = keyboardDirection(event.key)
    if (!direction || !selectableBounds) return
    event.preventDefault()
    const current = selectionModelRef.current?.focus
      ?? (selection
      ? { row: selection.rowEnd, column: selection.columnEnd }
      : { row: selectableBounds.rowStart, column: selectableBounds.columnStart }
      )
    const merge = mergeIndex.getAt(current.row, current.column)
    const next = moveAddress(current, direction, merge, rowCount, columnCount)
    const targetMerge = mergeIndex.getAt(next.row, next.column)
    const target = clampAddressToRange(targetMerge
      ? { row: targetMerge.rowStart, column: targetMerge.columnStart }
      : next, selectableBounds)

    commitSelection(event.shiftKey && selection
      ? {
          anchor: selectionModelRef.current?.anchor
            ?? { row: selection.rowStart, column: selection.columnStart },
          focus: target,
        }
      : { anchor: target, focus: target })
    requestAnimationFrame(() => scrollToCell(target))
  }, [
    selection,
    rowCount,
    columnCount,
    mergeIndex,
    commitSelection,
    scrollToCell,
    copySelection,
    selectableBounds,
    cancelHorizontalTouchMotion,
  ])

  const autoSizeOptions = useMemo(() => normalizeAutoSize(autoSize), [autoSize])

  const previousContentVersionRef = useRef(contentVersion)
  useLayoutEffect(() => {
    const versionChanged = previousContentVersionRef.current !== contentVersion
    previousContentVersionRef.current = contentVersion
    let changed = false

    changed = pruneMeasurements(measuredRowsRef.current, rowCount) || changed
    changed = pruneMeasurements(measuredColumnsRef.current, columnCount) || changed

    if (versionChanged || !autoSizeOptions.rows) {
      for (const [row] of measuredRowsRef.current) {
        if (row < rowCount) {
          rowAxis.setSize(row, resolveConfiguredSize(row, rowHeights, getRowHeight, defaultRowHeight))
        }
      }
      if (measuredRowsRef.current.size > 0) changed = true
      measuredRowsRef.current.clear()
    }
    if (versionChanged || !autoSizeOptions.columns) {
      for (const [column] of measuredColumnsRef.current) {
        if (column < columnCount) {
          columnAxis.setSize(
            column,
            resizedColumnWidths.get(column)
              ?? stretchBaselineColumnWidths.get(column)
              ?? resolveConfiguredSize(column, columnWidths, getColumnWidth, defaultColumnWidth),
          )
        }
      }
      if (measuredColumnsRef.current.size > 0) changed = true
      measuredColumnsRef.current.clear()
    }
    if (changed) setAxisRevision((revision) => revision + 1)
  }, [
    contentVersion,
    rowCount,
    columnCount,
    autoSizeOptions.rows,
    autoSizeOptions.columns,
    rowAxis,
    columnAxis,
    rowHeights,
    columnWidths,
    getRowHeight,
    getColumnWidth,
    defaultRowHeight,
    defaultColumnWidth,
    resizedColumnWidths,
    stretchBaselineColumnWidths,
  ])

  useLayoutEffect(() => {
    if (columnResizeSessionRef.current) return
    if (!autoSizeOptions.columns && !autoSizeOptions.rows) return
    const viewport = viewportRef.current
    if (!viewport) return
    const nodes = viewport.querySelectorAll<HTMLElement>('[data-ultigrid-cell="true"][data-merged="false"]')
    const columnMaxima = new Map<number, number>()
    const rowMaxima = new Map<number, number>()

    for (const node of nodes) {
      const row = Number(node.dataset.row)
      const column = Number(node.dataset.column)
      const content = node.querySelector<HTMLElement>('.ultigrid-cell__content') ?? node
      if (autoSizeOptions.columns && !resizedColumnWidths.has(column)) {
        const current = measuredColumnsRef.current.get(column)
          ?? columnAxis.getCustomSize(column)
          ?? defaultColumnWidth
        const overflow = Math.max(0, content.scrollWidth - content.clientWidth)
        const width = clamp(
          Math.ceil(autoSizeOptions.allowShrink ? measureIntrinsicWidth(content) : current + overflow),
          autoSizeOptions.minColumnWidth,
          autoSizeOptions.maxColumnWidth,
        )
        columnMaxima.set(column, Math.max(columnMaxima.get(column) ?? 0, width))
      }
      if (autoSizeOptions.rows) {
        const current = measuredRowsRef.current.get(row)
          ?? rowAxis.getCustomSize(row)
          ?? defaultRowHeight
        const overflow = Math.max(0, content.scrollHeight - content.clientHeight)
        const height = clamp(
          Math.ceil(autoSizeOptions.allowShrink ? measureIntrinsicHeight(content) : current + overflow),
          autoSizeOptions.minRowHeight,
          autoSizeOptions.maxRowHeight,
        )
        rowMaxima.set(row, Math.max(rowMaxima.get(row) ?? 0, height))
      }
    }

    let changed = false
    for (const [column, width] of columnMaxima) {
      const previous = measuredColumnsRef.current.get(column) ?? columnAxis.getCustomSize(column) ?? defaultColumnWidth
      if (width > previous || (autoSizeOptions.allowShrink && width !== previous)) {
        measuredColumnsRef.current.set(column, width)
        columnAxis.setSize(column, width)
        changed = true
      }
    }
    for (const [row, height] of rowMaxima) {
      const previous = measuredRowsRef.current.get(row) ?? rowAxis.getCustomSize(row) ?? defaultRowHeight
      if (height > previous || (autoSizeOptions.allowShrink && height !== previous)) {
        measuredRowsRef.current.set(row, height)
        rowAxis.setSize(row, height)
        changed = true
      }
    }
    if (changed) setAxisRevision((revision) => revision + 1)
  }, [
    windowState,
    selection,
    renderCell,
    getCell,
    getCellText,
    contentVersion,
    autoSizeOptions,
    rowAxis,
    columnAxis,
    defaultRowHeight,
    defaultColumnWidth,
    resizedColumnWidths,
  ])

  const panes = useMemo(
    () => buildPanes(
      size,
      dimensions,
      fixed,
      rowCount,
      columnCount,
      windowState,
      rowAxis,
      columnAxis,
    ),
    [
      size,
      dimensions,
      fixed,
      rowCount,
      columnCount,
      windowState,
      rowAxis,
      columnAxis,
      axisRevision,
    ],
  )

  const mergeFragments = useMemo(() => {
    const byPane = new Map<string, MergeRegion<CellRange>[]>()
    const ownerByMerge = new Map<string, string>()
    for (const pane of panes) {
      const merges = mergeIndex.query({
        rowStart: pane.rows.start,
        rowEnd: pane.rows.end,
        columnStart: pane.columns.start,
        columnEnd: pane.columns.end,
      })
      byPane.set(pane.id, merges)
      for (const merge of merges) {
        const ownsAnchor = merge.rowStart >= pane.rows.start
          && merge.rowStart <= pane.rows.end
          && merge.columnStart >= pane.columns.start
          && merge.columnStart <= pane.columns.end
        if (ownsAnchor || !ownerByMerge.has(merge.id)) ownerByMerge.set(merge.id, pane.id)
      }
    }
    return { byPane, ownerByMerge }
  }, [panes, mergeIndex])

  const rowOffsetCache = new Map<number, number>()
  const columnOffsetCache = new Map<number, number>()
  const rowOffset = (index: number) => cachedAxisOffset(rowAxis, rowOffsetCache, index)
  const columnOffset = (index: number) => cachedAxisOffset(columnAxis, columnOffsetCache, index)

  const renderPane = (pane: Pane): ReactNode => {
    const merges = mergeFragments.byPane.get(pane.id) ?? []
    const coveredByRow = new Map<number, MergeRegion<CellRange>[]>()
    for (const merge of merges) {
      const from = Math.max(merge.rowStart, pane.rows.start)
      const to = Math.min(merge.rowEnd, pane.rows.end)
      for (let row = from; row <= to; row += 1) {
        const entries = coveredByRow.get(row)
        if (entries) entries.push(merge)
        else coveredByRow.set(row, [merge])
      }
    }

    const cells: ReactNode[] = []
    for (let row = pane.rows.start; row <= pane.rows.end; row += 1) {
      const covered = coveredByRow.get(row)
      for (let column = pane.columns.start; column <= pane.columns.end; column += 1) {
        if (covered?.some((merge) => column >= merge.columnStart && column <= merge.columnEnd)) {
          continue
        }
        cells.push(renderSurface(
          pane,
          { rowStart: row, rowEnd: row, columnStart: column, columnEnd: column },
          false,
          `${row}:${column}`,
        ))
      }
    }
    for (const merge of merges) {
        cells.push(renderSurface(
          pane,
          merge,
          true,
          `merge:${merge.id}`,
          mergeFragments.ownerByMerge.get(merge.id) === pane.id,
        ))
    }

    return (
      <div
        className={`ultigrid-pane ultigrid-pane--${pane.rows.kind}-${pane.columns.kind}`}
        key={pane.id}
        style={{
          left: pane.columns.clipStart,
          top: pane.rows.clipStart,
          width: pane.columns.clipSize,
          height: pane.rows.clipSize,
          zIndex: pane.zIndex,
        }}
      >
        <div
          ref={getPaneLayerRef(pane.id, pane.rows.kind, pane.columns.kind)}
          className="ultigrid-pane__cells"
        >
          {cells}
        </div>
      </div>
    )
  }

  const renderedSelectionFocus = controlledSelection !== undefined
    ? reconcileSelectionModel(selectionModelRef.current, selection, selectableBounds)?.focus
    : selectionModelRef.current?.focus

  const renderSurface = (
    pane: Pane,
    bounds: CellRange,
    merged: boolean,
    key: string,
    renderCustomContent = true,
  ) => {
    const row = bounds.rowStart
    const column = bounds.columnStart
    const selected = rangeIntersects(bounds, selection)
    const active = Boolean(selection && renderedSelectionFocus
      && isAddressInRange(renderedSelectionFocus, bounds))
    const columnStartOffset = columnOffset(bounds.columnStart)
    const rowStartOffset = rowOffset(bounds.rowStart)
    const width = columnOffset(bounds.columnEnd + 1) - columnStartOffset
    const height = rowOffset(bounds.rowEnd + 1) - rowStartOffset
    const paneOwnsTrailingCorner = bounds.rowEnd >= pane.rows.start
      && bounds.rowEnd <= pane.rows.end
      && bounds.columnEnd >= pane.columns.start
      && bounds.columnEnd <= pane.columns.end
    const resizeColumn = columnResizeOptions.enabled
      && columnResizeOptions.headerRows.has(row)
      && paneOwnsTrailingCorner
      && columnResizeOptions.isColumnResizable(bounds.columnEnd)
      ? bounds.columnEnd
      : null
    const resizeBounds = resizeColumn === null
      ? { min: 0, max: 0 }
      : resolveColumnWidthBounds(columnResizeOptions, resizeColumn)
    const resizeFromStart = pane.columns.kind === 'end'
    const resizeScrollsWithViewport = pane.columns.kind === 'middle'
    const resizeHandlePosition = resizeColumn === null
      ? 0
      : columnOffset(resizeFromStart ? resizeColumn : resizeColumn + 1) - columnStartOffset

    return (
      <CellSurface
        key={key}
        row={row}
        column={column}
        rowEnd={bounds.rowEnd}
        columnEnd={bounds.columnEnd}
        left={columnStartOffset - pane.columns.coordinateBase}
        top={rowStartOffset - pane.rows.coordinateBase}
        width={width}
        height={height}
        merged={merged}
        renderCustomContent={renderCustomContent}
        selected={selected}
        active={active}
        range={selection}
        contentVersion={contentVersion}
        rowCount={rowCount}
        columnCount={columnCount}
        getCell={getCell}
        renderCell={renderCell}
        cellText={cellText}
        beginSelection={beginSelection}
        extendSelection={extendSelection}
        showTouchHandle={mobileEnabled && active && paneOwnsTrailingCorner}
        selectionHandleLabel={mobileOptions.labels.selectionHandle}
        beginTouchSelectionExtension={beginTouchSelectionExtension}
        resizeColumn={resizeColumn}
        resizeWidth={resizeColumn === null ? 0 : columnAxis.getSize(resizeColumn)}
        resizeMinWidth={resizeBounds.min}
        resizeMaxWidth={resizeBounds.max}
        resizeHandleLabel={resizeColumn === null
          ? ''
          : columnResizeOptions.getHandleAriaLabel(resizeColumn)}
        resizeHandlePosition={resizeHandlePosition}
        resizeFromStart={resizeFromStart}
        resizeScrollsWithViewport={resizeScrollsWithViewport}
        beginColumnResize={beginColumnResize}
        resizeColumnWithKeyboard={resizeColumnWithKeyboard}
      />
    )
  }

  const rootClassName = [
    'ultigrid-root',
    mobileEnabled && 'ultigrid-root--mobile',
    dominantTouchScrollEnabled && 'ultigrid-root--axis-lock',
    className,
  ].filter(Boolean).join(' ')
  const rootStyle = useMemo(
    () => themeColor
      ? ({ ...style, '--ultigrid-theme-color': themeColor } as CSSProperties)
      : style,
    [style, themeColor],
  )
  const canvasWidth = Math.max(size.width, columnAxis.totalSize)
  const canvasHeight = Math.max(size.height, rowAxis.totalSize)
  const isEmpty = rowCount === 0 || columnCount === 0
  const mobileCopyLabel = copyFeedback === 'success'
    ? mobileOptions.labels.copySuccess
    : copyFeedback === 'error'
      ? mobileOptions.labels.copyError
      : mobileOptions.labels.copySelection

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      style={rootStyle}
      role={ariaRole}
      aria-label={ariaLabel}
      aria-rowcount={rowCount}
      aria-colcount={columnCount}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-mobile-interaction={mobileEnabled ? 'true' : 'false'}
      data-scroll-axis-lock={dominantTouchScrollEnabled ? 'dominant' : 'native'}
      data-rendered-rows={renderedRowCount}
      data-rendered-columns={renderedColumnCount}
    >
      <div
        ref={scrollerRef}
        className="ultigrid-scroller"
        onLostPointerCapture={(event) => {
          if (event.target !== event.currentTarget) return
          finishHorizontalTouchScroll(event.pointerId, event.timeStamp, false)
        }}
        onPointerDownCapture={beginHorizontalTouchScroll}
        onScroll={handleScroll}
        onWheel={cancelHorizontalTouchMotion}
      >
        <div className="ultigrid-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          <div
            ref={viewportRef}
            className="ultigrid-viewport"
            style={{ width: size.width, height: size.height } as CSSProperties}
          >
            {isEmpty ? <div className="ultigrid-empty">{emptyContent}</div> : panes.map(renderPane)}
          </div>
        </div>
      </div>
      {mobileEnabled && selection && mobileOptions.showCopyAction ? (
        <div
          className="ultigrid-mobile-actions"
          role="toolbar"
          aria-label={mobileOptions.labels.selectionActions}
          aria-live="polite"
        >
          <button
            type="button"
            className="ultigrid-mobile-actions__copy"
            data-feedback={copyFeedback}
            aria-label={mobileCopyLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void copySelectionFromMobileAction()}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="7" y="7" width="9" height="9" rx="2" />
              <path d="M5 13H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{mobileCopyLabel}</span>
          </button>
        </div>
      ) : null}
      {columnResizeGuideX !== null ? (
        <div
          className="ultigrid-column-resize-guide"
          style={{ left: columnResizeGuideX }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}

function collectOverrides(
  count: number,
  explicit: ReadonlyMap<number, number> | undefined,
  getter: ((index: number) => number | undefined) | undefined,
): Map<number, number> {
  const result = new Map<number, number>()
  if (explicit) {
    for (const [index, value] of explicit) {
      if (index >= 0 && index < count) result.set(index, value)
    }
  }
  if (getter) {
    for (let index = 0; index < count; index += 1) {
      if (result.has(index)) continue
      const value = getter(index)
      if (value !== undefined) result.set(index, value)
    }
  }
  return result
}

function mergeOverrides(
  configured: ReadonlyMap<number, number>,
  measured: ReadonlyMap<number, number>,
  count: number,
): Map<number, number> {
  const result = new Map(configured)
  for (const [index, value] of measured) {
    if (index >= 0 && index < count) result.set(index, value)
  }
  return result
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

function normalizeFrozen(
  rowCount: number,
  columnCount: number,
  frozen: UltiGridViewportProps['frozen'],
) {
  const top = clampInteger(frozen?.top ?? 0, 0, rowCount)
  const bottom = clampInteger(frozen?.bottom ?? 0, 0, rowCount - top)
  const left = clampInteger(frozen?.left ?? 0, 0, columnCount)
  const right = clampInteger(frozen?.right ?? 0, 0, columnCount - left)
  return { top, bottom, left, right }
}

function constrainFrozen(
  requested: { top: number; bottom: number; left: number; right: number },
  rowAxis: Axis,
  columnAxis: Axis,
  viewport: ElementSize,
) {
  const rows = fitFrozenAxis(rowAxis, requested.top, requested.bottom, viewport.height)
  const columns = fitFrozenAxis(columnAxis, requested.left, requested.right, viewport.width)
  return { top: rows.start, bottom: rows.end, left: columns.start, right: columns.end }
}

function fitFrozenAxis(
  axis: Axis,
  requestedStart: number,
  requestedEnd: number,
  viewportSize: number,
): { start: number; end: number } {
  if (axis.count === 0 || viewportSize <= 0) return { start: 0, end: 0 }
  const totalRequested = axis.getOffset(requestedStart)
    + axis.totalSize
    - axis.getOffset(axis.count - requestedEnd)
  if (totalRequested <= viewportSize) return { start: requestedStart, end: requestedEnd }

  let start = 0
  let used = 0
  while (start < requestedStart) {
    const itemSize = axis.getSize(start)
    if (start > 0 && used + itemSize > viewportSize) break
    start += 1
    used += itemSize
    if (used >= viewportSize) break
  }

  let end = 0
  let remaining = Math.max(0, viewportSize - used)
  while (end < requestedEnd && remaining > 0) {
    const itemSize = axis.getSize(axis.count - end - 1)
    if (itemSize > remaining) break
    end += 1
    remaining -= itemSize
  }
  return { start, end }
}

function buildPanes(
  size: ElementSize,
  dimensions: {
    topHeight: number
    bottomHeight: number
    bottomStart: number
    leftWidth: number
    rightWidth: number
    rightStart: number
    centerWidth: number
    centerHeight: number
  },
  fixed: { top: number; bottom: number; left: number; right: number },
  rowCount: number,
  columnCount: number,
  windowState: WindowState,
  rowAxis: Axis,
  columnAxis: Axis,
): Pane[] {
  const rows: AxisBand[] = []
  const columns: AxisBand[] = []
  const currentRows = intersectWindow(
    windowState.rows,
    fixed.top,
    rowCount - fixed.bottom - 1,
  )
  const currentColumns = intersectWindow(
    windowState.columns,
    fixed.left,
    columnCount - fixed.right - 1,
  )

  if (fixed.top > 0 && dimensions.topHeight > 0) {
    rows.push({
      kind: 'start',
      start: 0,
      end: fixed.top - 1,
      clipStart: 0,
      clipSize: dimensions.topHeight,
      coordinateBase: 0,
    })
  }
  if (currentRows.start >= 0 && dimensions.centerHeight > 0) {
    rows.push({
      kind: 'middle',
      start: currentRows.start,
      end: currentRows.end,
      clipStart: dimensions.topHeight,
      clipSize: dimensions.centerHeight,
      coordinateBase: dimensions.topHeight,
    })
  }
  if (fixed.bottom > 0 && dimensions.bottomHeight > 0) {
    rows.push({
      kind: 'end',
      start: dimensions.bottomStart,
      end: rowCount - 1,
      clipStart: size.height - dimensions.bottomHeight,
      clipSize: dimensions.bottomHeight,
      coordinateBase: rowAxis.getOffset(dimensions.bottomStart),
    })
  }

  if (fixed.left > 0 && dimensions.leftWidth > 0) {
    columns.push({
      kind: 'start',
      start: 0,
      end: fixed.left - 1,
      clipStart: 0,
      clipSize: dimensions.leftWidth,
      coordinateBase: 0,
    })
  }
  if (currentColumns.start >= 0 && dimensions.centerWidth > 0) {
    columns.push({
      kind: 'middle',
      start: currentColumns.start,
      end: currentColumns.end,
      clipStart: dimensions.leftWidth,
      clipSize: dimensions.centerWidth,
      coordinateBase: dimensions.leftWidth,
    })
  }
  if (fixed.right > 0 && dimensions.rightWidth > 0) {
    columns.push({
      kind: 'end',
      start: dimensions.rightStart,
      end: columnCount - 1,
      clipStart: size.width - dimensions.rightWidth,
      clipSize: dimensions.rightWidth,
      coordinateBase: columnAxis.getOffset(dimensions.rightStart),
    })
  }

  // With no frozen items the middle bands still need to exist.
  if (rows.length === 0 && currentRows.start >= 0 && size.height > 0) {
    rows.push({
      kind: 'middle',
      start: currentRows.start,
      end: currentRows.end,
      clipStart: 0,
      clipSize: size.height,
      coordinateBase: 0,
    })
  }
  if (columns.length === 0 && currentColumns.start >= 0 && size.width > 0) {
    columns.push({
      kind: 'middle',
      start: currentColumns.start,
      end: currentColumns.end,
      clipStart: 0,
      clipSize: size.width,
      coordinateBase: 0,
    })
  }

  const panes: Pane[] = []
  for (const rowBand of rows) {
    for (const columnBand of columns) {
      const frozenAxes = Number(rowBand.kind !== 'middle') + Number(columnBand.kind !== 'middle')
      panes.push({
        id: `${rowBand.kind}-${columnBand.kind}`,
        rows: rowBand,
        columns: columnBand,
        zIndex: 1 + frozenAxes * 2,
      })
    }
  }
  return panes
}

function applyPaneLayerTransform(layer: PaneLayer, top: number, left: number): void {
  const x = layer.scrollColumns ? -left : 0
  const y = layer.scrollRows ? -top : 0
  const transform = `translate3d(${x}px, ${y}px, 0)`
  if (layer.element.style.transform !== transform) layer.element.style.transform = transform
}

function alignedScrollOffset(
  start: number,
  end: number,
  current: number,
  viewportStartInset: number,
  viewportEnd: number,
  align: 'auto' | 'start' | 'center' | 'end',
): number {
  const visibleStart = current + viewportStartInset
  const visibleEnd = current + viewportEnd
  if (align === 'auto') {
    if (start < visibleStart) return Math.max(0, start - viewportStartInset)
    if (end > visibleEnd) return Math.max(0, end - viewportEnd)
    return current
  }
  if (align === 'start') return Math.max(0, start - viewportStartInset)
  if (align === 'end') return Math.max(0, end - viewportEnd)
  return Math.max(0, (start + end - viewportStartInset - viewportEnd) / 2)
}

function keyboardDirection(key: string): 'up' | 'down' | 'left' | 'right' | null {
  switch (key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case 'Tab': return 'right'
    case 'Enter': return 'down'
    default: return null
  }
}

function moveAddress(
  address: CellAddress,
  direction: 'up' | 'down' | 'left' | 'right',
  merge: MergeRegion<unknown> | undefined,
  rowCount: number,
  columnCount: number,
): CellAddress {
  const next = { ...address }
  if (direction === 'up') next.row = (merge?.rowStart ?? address.row) - 1
  if (direction === 'down') next.row = (merge?.rowEnd ?? address.row) + 1
  if (direction === 'left') next.column = (merge?.columnStart ?? address.column) - 1
  if (direction === 'right') next.column = (merge?.columnEnd ?? address.column) + 1
  return {
    row: clamp(next.row, 0, rowCount - 1),
    column: clamp(next.column, 0, columnCount - 1),
  }
}

function rangeIntersects(left: CellRange, right: CellRange | null): boolean {
  return Boolean(
    right &&
      left.rowStart <= right.rowEnd &&
      left.rowEnd >= right.rowStart &&
      left.columnStart <= right.columnEnd &&
      left.columnEnd >= right.columnStart,
  )
}

function rangesEqual(left: CellRange | null, right: CellRange | null): boolean {
  return left === right || Boolean(
    left && right &&
      left.rowStart === right.rowStart &&
      left.rowEnd === right.rowEnd &&
      left.columnStart === right.columnStart &&
      left.columnEnd === right.columnEnd,
  )
}

function normalizeAutoSize(value: UltiGridViewportProps['autoSize']) {
  const options = typeof value === 'object' ? value : {}
  return {
    columns: value === true || options.columns === true,
    rows: value === true || options.rows === true,
    minColumnWidth: options.minColumnWidth ?? 64,
    maxColumnWidth: options.maxColumnWidth ?? 480,
    minRowHeight: options.minRowHeight ?? 28,
    maxRowHeight: options.maxRowHeight ?? 240,
    allowShrink: options.allowShrink ?? false,
  }
}

function pruneMeasurements(measurements: Map<number, number>, count: number): boolean {
  let changed = false
  for (const index of measurements.keys()) {
    if (index >= count) {
      measurements.delete(index)
      changed = true
    }
  }
  return changed
}

function resolveConfiguredSize(
  index: number,
  explicit: ReadonlyMap<number, number> | undefined,
  getter: ((index: number) => number | undefined) | undefined,
  fallback: number,
): number {
  return explicit?.get(index) ?? getter?.(index) ?? fallback
}

function measureIntrinsicWidth(element: HTMLElement): number {
  const previousWidth = element.style.width
  const previousMaxWidth = element.style.maxWidth
  const previousOverflow = element.style.overflow
  element.style.width = 'max-content'
  element.style.maxWidth = 'none'
  element.style.overflow = 'visible'
  const width = element.scrollWidth
  element.style.width = previousWidth
  element.style.maxWidth = previousMaxWidth
  element.style.overflow = previousOverflow
  return width
}

function measureIntrinsicHeight(element: HTMLElement): number {
  const previousHeight = element.style.height
  const previousMaxHeight = element.style.maxHeight
  const previousOverflow = element.style.overflow
  element.style.height = 'auto'
  element.style.maxHeight = 'none'
  element.style.overflow = 'visible'
  const height = element.scrollHeight
  element.style.height = previousHeight
  element.style.maxHeight = previousMaxHeight
  element.style.overflow = previousOverflow
  return height
}

function windowsEqual(left: WindowState, right: WindowState): boolean {
  return indexWindowsEqual(left.rows, right.rows) && indexWindowsEqual(left.columns, right.columns)
}

function indexWindowsEqual(left: IndexWindow, right: IndexWindow): boolean {
  return left.start === right.start && left.end === right.end
}

function intersectWindow(range: IndexWindow, minimum: number, maximum: number): IndexWindow {
  if (range.start < 0 || minimum > maximum) return EMPTY_INDEX_WINDOW
  const start = Math.max(minimum, range.start)
  const end = Math.min(maximum, range.end)
  if (start > end) return EMPTY_INDEX_WINDOW
  return { start, end }
}

function countWindow(range: IndexWindow): number {
  return range.start < 0 ? 0 : range.end - range.start + 1
}

function cachedAxisOffset(axis: Axis, cache: Map<number, number>, index: number): number {
  const cached = cache.get(index)
  if (cached !== undefined) return cached
  const offset = axis.getOffset(index)
  cache.set(index, offset)
  return offset
}

function restoreColumnResizeAxis(session: ColumnResizeSession): void {
  restoreColumnSizes(session.axis, session.axisRollback)
  session.axis.setStretch(session.axisStretchBefore)
}

function releaseColumnResizePointer(session: ColumnResizeSession): void {
  if (session.input === 'touch') {
    window.removeEventListener('touchmove', preventActiveTouchResizeScroll)
  }
  try {
    session.captureTarget.classList.remove('is-resizing')
    if (session.captureTarget.hasPointerCapture?.(session.pointerId)) {
      session.captureTarget.releasePointerCapture?.(session.pointerId)
    }
  } catch {
    // The handle may have been detached by a host reconfiguration.
  }
}

function preventActiveTouchResizeScroll(event: TouchEvent): void {
  if (event.cancelable) event.preventDefault()
}

function useMobileInteractionEnabled(
  options: ResolvedMobileInteractionOptions,
  lastInputWasTouch: boolean,
): boolean {
  const [autoDetected, setAutoDetected] = useState(false)

  useEffect(() => {
    if (options.mode !== 'auto') return
    const media = window.matchMedia?.(TOUCH_CAPABLE_POINTER_QUERY)
    const update = () => setAutoDetected(detectTouchFirstInput())
    update()
    if (media?.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media?.addListener?.(update)
    return () => media?.removeListener?.(update)
  }, [options.mode])

  if (options.mode === 'always') return true
  if (options.mode === 'off') return false
  return autoDetected || lastInputWasTouch
}

function scrollDirection(current: number, previous: number): VirtualScrollDirection {
  return current === previous ? 0 : current > previous ? 1 : -1
}

function mergeId(range: CellRange): string {
  return `${range.rowStart}:${range.columnStart}:${range.rowEnd}:${range.columnEnd}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return clamp(Number.isFinite(value) ? Math.trunc(value) : minimum, minimum, maximum)
}
