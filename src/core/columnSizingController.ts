import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { mergeColumnWidthLayers } from './columnResize.js'

interface ColumnSizingControllerOptions {
  columnCount: number
  configuredColumnWidths: ReadonlyMap<number, number>
}

interface ColumnMeasurementStore {
  get: (viewportColumn: number) => number | undefined
  forEach: (visit: (viewportColumn: number, width: number) => void) => void
  record: (viewportColumn: number, width: number) => void
  prune: () => boolean
  clear: () => boolean
}

interface ColumnSizingController {
  resolvedColumnWidths: ReadonlyMap<number, number>
  resizedColumnWidths: ReadonlyMap<number, number>
  stretchBaselineColumnWidths: ReadonlyMap<number, number>
  manualColumnFitDisabled: boolean
  measurements: ColumnMeasurementStore
  beginManualColumnResize: () => boolean
  cancelManualColumnResize: (previousManualFitDisabled: boolean) => void
  commitStretchBaseline: (widths: ReadonlyMap<number, number>) => void
  commitResizedColumnWidth: (viewportColumn: number, width: number) => void
  resetColumnSizing: (clearMeasurements: boolean) => void
}

export function useColumnSizingController({
  columnCount,
  configuredColumnWidths,
}: ColumnSizingControllerOptions): ColumnSizingController {
  const measuredColumnWidthsRef = useRef(new Map<number, number>())
  const [resizedColumnWidths, setResizedColumnWidths] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  )
  const [stretchBaselineColumnWidths, setStretchBaselineColumnWidthsState] = useState<
    ReadonlyMap<number, number>
  >(() => new Map())
  const [measurementRevision, setMeasurementRevision] = useState(0)
  const [manualColumnFitDisabled, setManualColumnFitDisabled] = useState(false)

  useEffect(() => {
    setResizedColumnWidths((current) => pruneColumnWidths(current, columnCount))
    setStretchBaselineColumnWidthsState((current) => pruneColumnWidths(current, columnCount))
  }, [columnCount])

  const resolvedColumnWidths = useMemo(
    () => {
      // Measurements mutate in the layout hot path; the revision invalidates only contract resets.
      void measurementRevision
      return mergeColumnWidthLayers(columnCount, {
        configured: configuredColumnWidths,
        stretchBaseline: stretchBaselineColumnWidths,
        measured: measuredColumnWidthsRef.current,
        manuallyResized: resizedColumnWidths,
      })
    },
    [
      columnCount,
      configuredColumnWidths,
      measurementRevision,
      resizedColumnWidths,
      stretchBaselineColumnWidths,
    ],
  )

  const commitStretchBaseline = useCallback((
    widths: ReadonlyMap<number, number>,
  ) => {
    setStretchBaselineColumnWidthsState(widths)
  }, [])

  const commitResizedColumnWidth = useCallback((viewportColumn: number, width: number) => {
    setResizedColumnWidths((current) => {
      if (current.get(viewportColumn) === width) return current
      const next = new Map(current)
      next.set(viewportColumn, width)
      return next
    })
    setManualColumnFitDisabled(true)
  }, [])

  const beginManualColumnResize = useCallback(() => {
    setManualColumnFitDisabled(true)
    return manualColumnFitDisabled
  }, [manualColumnFitDisabled])

  const cancelManualColumnResize = useCallback((previousManualFitDisabled: boolean) => {
    setManualColumnFitDisabled(previousManualFitDisabled)
  }, [])

  const getMeasuredColumnWidth = useCallback(
    (viewportColumn: number) => measuredColumnWidthsRef.current.get(viewportColumn),
    [],
  )
  const forEachMeasuredColumnWidth = useCallback((
    visit: (viewportColumn: number, width: number) => void,
  ) => {
    for (const [viewportColumn, width] of measuredColumnWidthsRef.current) {
      visit(viewportColumn, width)
    }
  }, [])
  const recordMeasuredColumnWidth = useCallback((viewportColumn: number, width: number) => {
    measuredColumnWidthsRef.current.set(viewportColumn, width)
  }, [])
  const pruneMeasuredColumnWidths = useCallback(
    () => pruneColumnWidthsInPlace(measuredColumnWidthsRef.current, columnCount),
    [columnCount],
  )
  const clearMeasuredColumnWidths = useCallback(() => {
    if (measuredColumnWidthsRef.current.size === 0) return false
    measuredColumnWidthsRef.current.clear()
    return true
  }, [])
  const measurements = useMemo<ColumnMeasurementStore>(() => ({
    get: getMeasuredColumnWidth,
    forEach: forEachMeasuredColumnWidth,
    record: recordMeasuredColumnWidth,
    prune: pruneMeasuredColumnWidths,
    clear: clearMeasuredColumnWidths,
  }), [
    clearMeasuredColumnWidths,
    forEachMeasuredColumnWidth,
    getMeasuredColumnWidth,
    pruneMeasuredColumnWidths,
    recordMeasuredColumnWidth,
  ])

  const resetColumnSizing = useCallback((clearMeasurements: boolean) => {
    setResizedColumnWidths((current) => current.size === 0 ? current : new Map())
    setStretchBaselineColumnWidthsState((current) => current.size === 0 ? current : new Map())
    setManualColumnFitDisabled(false)
    if (clearMeasurements) {
      measuredColumnWidthsRef.current.clear()
      setMeasurementRevision((revision) => revision + 1)
    }
  }, [])

  return {
    resolvedColumnWidths,
    resizedColumnWidths,
    stretchBaselineColumnWidths,
    manualColumnFitDisabled,
    measurements,
    beginManualColumnResize,
    cancelManualColumnResize,
    commitStretchBaseline,
    commitResizedColumnWidth,
    resetColumnSizing,
  }
}

function pruneColumnWidths(
  widths: ReadonlyMap<number, number>,
  columnCount: number,
): ReadonlyMap<number, number> {
  let changed = false
  const next = new Map<number, number>()
  for (const [column, width] of widths) {
    if (column < columnCount) next.set(column, width)
    else changed = true
  }
  return changed ? next : widths
}

function pruneColumnWidthsInPlace(
  widths: Map<number, number>,
  columnCount: number,
): boolean {
  let changed = false
  for (const column of widths.keys()) {
    if (column < columnCount) continue
    widths.delete(column)
    changed = true
  }
  return changed
}
