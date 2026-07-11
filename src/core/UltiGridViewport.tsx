import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Axis } from './axis'
import { getDragAutoScrollVelocity, resolveDragAddress } from './dragAutoScroll'
import { MergeIndex, type MergeRegion } from './mergeIndex'
import { rangeToTSV } from './selection'
import { getVirtualRange } from './virtualizer'
import {
  normalizeCell,
  normalizeRange,
  type CellAddress,
  type CellPrimitive,
  type CellRange,
  type MergedCellRange,
  type UltiGridViewportApi,
  type UltiGridViewportProps,
  type TableCell,
  type ViewportSnapshot,
} from './viewportTypes'

interface ElementSize {
  width: number
  height: number
}

interface IndexWindow {
  start: number
  end: number
  visibleStart: number
  visibleEnd: number
}

interface WindowState {
  rows: IndexWindow
  columns: IndexWindow
}

interface SelectionModel {
  anchor: CellAddress
  focus: CellAddress
}

type BandKind = 'start' | 'middle' | 'end'

interface AxisBand {
  kind: BandKind
  start: number
  end: number
  clipStart: number
  clipSize: number
  coordinateBase: number
  translateBase: number
}

interface Pane {
  id: string
  rows: AxisBand
  columns: AxisBand
  zIndex: number
}

const EMPTY_INDEX_WINDOW: IndexWindow = {
  start: -1,
  end: -1,
  visibleStart: -1,
  visibleEnd: -1,
}

const DEFAULT_COPY_LIMIT = 100_000
const EMPTY_MERGES = Object.freeze([]) as readonly MergedCellRange[]

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
    fitColumns = 'stretch',
    selection: controlledSelection,
    defaultSelection = null,
    onSelectionChange,
    onCellClick,
    onViewportChange,
    onCopy,
    copyCellLimit = DEFAULT_COPY_LIMIT,
    themeColor,
    className,
    style,
    ariaLabel = 'Virtual data grid',
    ariaRole = 'grid',
    emptyContent = null,
    apiRef,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const dragAutoScrollRafRef = useRef<number | null>(null)
  const dragAutoScrollCallbackRef = useRef<() => void>(() => undefined)
  const dragRef = useRef(false)
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const lastScrollRef = useRef({ top: 0, left: 0 })
  const measuredRowsRef = useRef(new Map<number, number>())
  const measuredColumnsRef = useRef(new Map<number, number>())
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  const [axisRevision, setAxisRevision] = useState(0)
  const [internalSelection, setInternalSelection] = useState<CellRange | null>(() =>
    defaultSelection ? normalizeRange(defaultSelection) : null,
  )
  const selectionModelRef = useRef<SelectionModel | null>(defaultSelection ? {
    anchor: { row: defaultSelection.rowStart, column: defaultSelection.columnStart },
    focus: { row: defaultSelection.rowEnd, column: defaultSelection.columnEnd },
  } : null)

  const rawSelection = controlledSelection === undefined
    ? internalSelection
    : controlledSelection
      ? normalizeRange(controlledSelection)
      : null
  const selection = useMemo(
    () => clampRangeToGrid(rawSelection, rowCount, columnCount),
    [rawSelection, rowCount, columnCount],
  )

  const rowOverrides = useMemo(
    () => collectOverrides(rowCount, rowHeights, getRowHeight),
    [rowCount, rowHeights, getRowHeight],
  )
  const columnOverrides = useMemo(
    () => collectOverrides(columnCount, columnWidths, getColumnWidth),
    [columnCount, columnWidths, getColumnWidth],
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
      overrides: mergeOverrides(columnOverrides, measuredColumnsRef.current, columnCount),
    }),
    [columnCount, defaultColumnWidth, columnOverrides],
  )
  columnAxis.setContainerSize(size.width)
  columnAxis.setStretch(fitColumns === 'stretch')

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

  const computeWindow = useCallback((scrollTop: number, scrollLeft: number): WindowState => {
    const rows = virtualBand(
      rowAxis,
      scrollTop + dimensions.topHeight,
      dimensions.centerHeight,
      overscan?.rows ?? 3,
      fixed.top,
      rowCount - fixed.bottom - 1,
    )
    const columns = virtualBand(
      columnAxis,
      scrollLeft + dimensions.leftWidth,
      dimensions.centerWidth,
      overscan?.columns ?? 2,
      fixed.left,
      columnCount - fixed.right - 1,
    )
    return { rows, columns }
  }, [
    rowAxis,
    columnAxis,
    dimensions,
    overscan,
    fixed,
    rowCount,
    columnCount,
  ])

  const [windowState, setWindowState] = useState<WindowState>(() => ({
    rows: EMPTY_INDEX_WINDOW,
    columns: EMPTY_INDEX_WINDOW,
  }))

  const renderedRowCount = countWindow(windowState.rows) + fixed.top + fixed.bottom
  const renderedColumnCount = countWindow(windowState.columns) + fixed.left + fixed.right

  const emitViewport = useCallback((nextWindow: WindowState, top: number, left: number) => {
    if (!onViewportChange) return
    const visibleRows = countVisible(nextWindow.rows) + fixed.top + fixed.bottom
    const visibleColumns = countVisible(nextWindow.columns) + fixed.left + fixed.right
    const nextRenderedRows = countWindow(nextWindow.rows) + fixed.top + fixed.bottom
    const nextRenderedColumns = countWindow(nextWindow.columns) + fixed.left + fixed.right
    const snapshot: ViewportSnapshot = {
      rowStart: nextWindow.rows.visibleStart,
      rowEnd: nextWindow.rows.visibleEnd,
      columnStart: nextWindow.columns.visibleStart,
      columnEnd: nextWindow.columns.visibleEnd,
      visibleCellCount: visibleRows * visibleColumns,
      renderedCellCount: nextRenderedRows * nextRenderedColumns,
      scrollTop: top,
      scrollLeft: left,
    }
    onViewportChange(snapshot)
  }, [onViewportChange, fixed])

  const syncScroll = useCallback(() => {
    const scroller = scrollerRef.current
    const viewport = viewportRef.current
    if (!scroller || !viewport) return
    const top = scroller.scrollTop
    const left = scroller.scrollLeft
    lastScrollRef.current = { top, left }
    viewport.style.setProperty('--ultigrid-scroll-x', `${-left}px`)
    viewport.style.setProperty('--ultigrid-scroll-y', `${-top}px`)
    const nextWindow = computeWindow(top, left)
    setWindowState((previous) => windowsEqual(previous, nextWindow) ? previous : nextWindow)
    emitViewport(nextWindow, top, left)
  }, [computeWindow, emitViewport])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      syncScroll()
    })
  }, [syncScroll])

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
    const stableModel = next && rowCount > 0 && columnCount > 0 ? {
      anchor: clampAddress(next.anchor, rowCount, columnCount),
      focus: clampAddress(next.focus, rowCount, columnCount),
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
  }, [controlledSelection, onSelectionChange, rowCount, columnCount])

  useEffect(() => {
    if (controlledSelection === undefined) return
    if (!selection) {
      selectionModelRef.current = null
      return
    }
    const current = selectionModelRef.current
    const currentRange = current ? normalizeRange({
      rowStart: current.anchor.row,
      rowEnd: current.focus.row,
      columnStart: current.anchor.column,
      columnEnd: current.focus.column,
    }) : null
    if (!rangesEqual(currentRange, selection)) {
      selectionModelRef.current = {
        anchor: { row: selection.rowStart, column: selection.columnStart },
        focus: { row: selection.rowEnd, column: selection.columnEnd },
      }
    }
  }, [controlledSelection, selection])

  useEffect(() => {
    if (controlledSelection !== undefined || rangesEqual(internalSelection, selection)) return
    setInternalSelection(selection)
    selectionModelRef.current = selection ? {
      anchor: { row: selection.rowStart, column: selection.columnStart },
      focus: { row: selection.rowEnd, column: selection.columnEnd },
    } : null
    onSelectionChange?.(selection)
  }, [controlledSelection, internalSelection, selection, onSelectionChange])

  const scrollToCell = useCallback((address: CellAddress, align: 'auto' | 'start' | 'center' | 'end' = 'auto') => {
    const scroller = scrollerRef.current
    if (!scroller || rowCount === 0 || columnCount === 0) return
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

  useEffect(() => {
    if (!apiRef) return
    const api: UltiGridViewportApi = {
      scrollToCell,
      copySelection,
      getSelection: () => selection,
      focus: () => rootRef.current?.focus(),
    }
    apiRef.current = api
    return () => {
      if (apiRef.current === api) apiRef.current = null
    }
  }, [apiRef, scrollToCell, copySelection, selection])

  const beginSelection = useCallback((
    address: CellAddress,
    event: ReactPointerEvent<HTMLDivElement>,
    cell: TableCell<TValue, TMeta>,
  ) => {
    event.preventDefault()
    rootRef.current?.focus({ preventScroll: true })
    dragRef.current = true
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
  }, [selection, commitSelection, onCellClick])

  const extendSelection = useCallback((address: CellAddress) => {
    if (!dragRef.current) return
    if (
      selectionModelRef.current?.focus.row === address.row &&
      selectionModelRef.current.focus.column === address.column
    ) return
    commitSelection({
      anchor: selectionModelRef.current?.anchor ?? address,
      focus: address,
    })
  }, [commitSelection])

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

    const bounds = viewport.getBoundingClientRect()
    const velocity = getDragAutoScrollVelocity(pointer, bounds)
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
  }, [updateDragSelection])

  useLayoutEffect(() => {
    dragAutoScrollCallbackRef.current = runDragAutoScroll
  }, [runDragAutoScroll])

  const stopDragging = useCallback(() => {
    dragRef.current = false
    dragPointerRef.current = null
    if (dragAutoScrollRafRef.current !== null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current)
      dragAutoScrollRafRef.current = null
    }
  }, [])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      if (!dragRef.current) return
      if (event.buttons === 0) {
        stopDragging()
        return
      }
      const pointer = { x: event.clientX, y: event.clientY }
      dragPointerRef.current = pointer
      updateDragSelection(pointer)
      if (dragAutoScrollRafRef.current === null) {
        dragAutoScrollRafRef.current = requestAnimationFrame(runDragAutoScroll)
      }
    }
    window.addEventListener('pointermove', trackPointer)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('pointermove', trackPointer)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
      window.removeEventListener('blur', stopDragging)
    }
  }, [runDragAutoScroll, stopDragging, updateDragSelection])

  useEffect(() => () => stopDragging(), [stopDragging])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      if (selection) {
        event.preventDefault()
        void copySelection().catch(() => undefined)
      }
      return
    }

    const direction = keyboardDirection(event.key)
    if (!direction || rowCount === 0 || columnCount === 0) return
    event.preventDefault()
    const current = selectionModelRef.current?.focus
      ?? (selection
      ? { row: selection.rowEnd, column: selection.columnEnd }
      : { row: 0, column: 0 }
      )
    const merge = mergeIndex.getAt(current.row, current.column)
    const next = moveAddress(current, direction, merge, rowCount, columnCount)
    const targetMerge = mergeIndex.getAt(next.row, next.column)
    const target = targetMerge
      ? { row: targetMerge.rowStart, column: targetMerge.columnStart }
      : next

    commitSelection(event.shiftKey && selection
      ? {
          anchor: selectionModelRef.current?.anchor
            ?? { row: selection.rowStart, column: selection.columnStart },
          focus: target,
        }
      : { anchor: target, focus: target })
    requestAnimationFrame(() => scrollToCell(target))
  }, [selection, rowCount, columnCount, mergeIndex, commitSelection, scrollToCell, copySelection])

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
            resolveConfiguredSize(column, columnWidths, getColumnWidth, defaultColumnWidth),
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
  ])

  useLayoutEffect(() => {
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
      if (autoSizeOptions.columns) {
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

    const transform = paneTransform(pane)
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
        <div className="ultigrid-pane__cells" style={transform}>
          {cells}
        </div>
      </div>
    )
  }

  const renderSurface = (
    pane: Pane,
    bounds: CellRange,
    merged: boolean,
    key: string,
    renderCustomContent = true,
  ) => {
    const row = bounds.rowStart
    const column = bounds.columnStart
    const source = normalizeCell(getCell(row, column))
    const selected = rangeIntersects(bounds, selection)
    const focus = selectionModelRef.current?.focus
    const active = Boolean(selection && focus && focus.row === row && focus.column === column)
    const text = cellText(source, row, column)
    const content = !renderCustomContent
      ? null
      : renderCell
        ? renderCell({ row, column, cell: source, selected, active, merged, range: selection })
        : text
    const x = columnAxis.getOffset(bounds.columnStart) - pane.columns.coordinateBase
    const y = rowAxis.getOffset(bounds.rowStart) - pane.rows.coordinateBase
    const width = columnAxis.getOffset(bounds.columnEnd + 1) - columnAxis.getOffset(bounds.columnStart)
    const height = rowAxis.getOffset(bounds.rowEnd + 1) - rowAxis.getOffset(bounds.rowStart)
    const address = { row, column }
    const cellStyle: CSSProperties = {
      ...source.style,
      width,
      height,
      transform: `translate3d(${x}px, ${y}px, 0)`,
    }

    return (
      <div
        key={key}
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
          source.className,
        ].filter(Boolean).join(' ')}
        style={cellStyle}
        data-ultigrid-cell="true"
        data-merged={merged ? 'true' : 'false'}
        data-row={row}
        data-column={column}
        data-row-end={bounds.rowEnd}
        data-column-end={bounds.columnEnd}
        title={!renderCustomContent || renderCell ? undefined : text}
        onPointerDown={(event) => beginSelection(address, event, source)}
        onPointerEnter={() => extendSelection(address)}
      >
        <div className="ultigrid-cell__content">{content}</div>
      </div>
    )
  }

  const rootClassName = ['ultigrid-root', className].filter(Boolean).join(' ')
  const rootStyle = useMemo(
    () => themeColor
      ? ({ ...style, '--ultigrid-theme-color': themeColor } as CSSProperties)
      : style,
    [style, themeColor],
  )
  const canvasWidth = Math.max(size.width, columnAxis.totalSize)
  const canvasHeight = Math.max(size.height, rowAxis.totalSize)
  const isEmpty = rowCount === 0 || columnCount === 0

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
      data-rendered-rows={renderedRowCount}
      data-rendered-columns={renderedColumnCount}
    >
      <div ref={scrollerRef} className="ultigrid-scroller" onScroll={handleScroll}>
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

function virtualBand(
  axis: Axis,
  offset: number,
  viewportSize: number,
  overscan: number,
  minimum: number,
  maximum: number,
): IndexWindow {
  if (axis.count === 0 || viewportSize <= 0 || minimum > maximum) return EMPTY_INDEX_WINDOW
  const range = getVirtualRange(axis, offset, viewportSize, overscan)
  const start = Math.max(minimum, range.start)
  const end = Math.min(maximum, range.end)
  if (start > end) return EMPTY_INDEX_WINDOW
  return {
    start,
    end,
    visibleStart: clamp(range.visibleStart, minimum, maximum),
    visibleEnd: clamp(range.visibleEnd, minimum, maximum),
  }
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
      translateBase: 0,
    })
  }
  if (currentRows.start >= 0 && dimensions.centerHeight > 0) {
    const base = rowAxis.getOffset(currentRows.start)
    rows.push({
      kind: 'middle',
      start: currentRows.start,
      end: currentRows.end,
      clipStart: dimensions.topHeight,
      clipSize: dimensions.centerHeight,
      coordinateBase: base,
      translateBase: base - dimensions.topHeight,
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
      translateBase: 0,
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
      translateBase: 0,
    })
  }
  if (currentColumns.start >= 0 && dimensions.centerWidth > 0) {
    const base = columnAxis.getOffset(currentColumns.start)
    columns.push({
      kind: 'middle',
      start: currentColumns.start,
      end: currentColumns.end,
      clipStart: dimensions.leftWidth,
      clipSize: dimensions.centerWidth,
      coordinateBase: base,
      translateBase: base - dimensions.leftWidth,
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
      translateBase: 0,
    })
  }

  // With no frozen items the middle bands still need to exist.
  if (rows.length === 0 && currentRows.start >= 0 && size.height > 0) {
    const base = rowAxis.getOffset(currentRows.start)
    rows.push({
      kind: 'middle',
      start: currentRows.start,
      end: currentRows.end,
      clipStart: 0,
      clipSize: size.height,
      coordinateBase: base,
      translateBase: base,
    })
  }
  if (columns.length === 0 && currentColumns.start >= 0 && size.width > 0) {
    const base = columnAxis.getOffset(currentColumns.start)
    columns.push({
      kind: 'middle',
      start: currentColumns.start,
      end: currentColumns.end,
      clipStart: 0,
      clipSize: size.width,
      coordinateBase: base,
      translateBase: base,
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

function paneTransform(pane: Pane): CSSProperties {
  const x = pane.columns.kind === 'middle'
    ? `calc(var(--ultigrid-scroll-x) + ${pane.columns.translateBase}px)`
    : '0px'
  const y = pane.rows.kind === 'middle'
    ? `calc(var(--ultigrid-scroll-y) + ${pane.rows.translateBase}px)`
    : '0px'
  return { transform: `translate3d(${x}, ${y}, 0)` }
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

function clampRangeToGrid(
  range: CellRange | null,
  rowCount: number,
  columnCount: number,
): CellRange | null {
  if (!range || rowCount <= 0 || columnCount <= 0) return null
  const normalized = normalizeRange(range)
  return {
    rowStart: clamp(normalized.rowStart, 0, rowCount - 1),
    rowEnd: clamp(normalized.rowEnd, 0, rowCount - 1),
    columnStart: clamp(normalized.columnStart, 0, columnCount - 1),
    columnEnd: clamp(normalized.columnEnd, 0, columnCount - 1),
  }
}

function clampAddress(address: CellAddress, rowCount: number, columnCount: number): CellAddress {
  return {
    row: clamp(address.row, 0, rowCount - 1),
    column: clamp(address.column, 0, columnCount - 1),
  }
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

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Sandboxed embeds may expose the API but reject it; use the DOM fallback.
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function windowsEqual(left: WindowState, right: WindowState): boolean {
  return indexWindowsEqual(left.rows, right.rows) && indexWindowsEqual(left.columns, right.columns)
}

function indexWindowsEqual(left: IndexWindow, right: IndexWindow): boolean {
  return left.start === right.start
    && left.end === right.end
    && left.visibleStart === right.visibleStart
    && left.visibleEnd === right.visibleEnd
}

function intersectWindow(range: IndexWindow, minimum: number, maximum: number): IndexWindow {
  if (range.start < 0 || minimum > maximum) return EMPTY_INDEX_WINDOW
  const start = Math.max(minimum, range.start)
  const end = Math.min(maximum, range.end)
  if (start > end) return EMPTY_INDEX_WINDOW
  return {
    start,
    end,
    visibleStart: clamp(range.visibleStart, start, end),
    visibleEnd: clamp(range.visibleEnd, start, end),
  }
}

function countWindow(range: IndexWindow): number {
  return range.start < 0 ? 0 : range.end - range.start + 1
}

function countVisible(range: IndexWindow): number {
  return range.visibleStart < 0 ? 0 : range.visibleEnd - range.visibleStart + 1
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
