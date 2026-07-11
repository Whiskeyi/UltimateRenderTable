import {
  useCallback,
  useMemo,
  useState,
} from 'react'
import type { CellRange } from '@ultigrid/core'
import {
  dataRangeToViewport,
  viewportRangeToData,
} from './coordinates.js'

interface InsightSelectionAdapterOptions {
  selection: CellRange | null | undefined
  onSelectionChange: ((range: CellRange | null) => void) | undefined
  headerOffset: number
  rowNumberOffset: number
  rowCount: number
  columnCount: number
}

/**
 * Keeps Core permanently controlled from Insight so table chrome can never
 * become part of the application selection or its clipboard payload.
 */
export function useInsightSelectionAdapter({
  selection,
  onSelectionChange,
  headerOffset,
  rowNumberOffset,
  rowCount,
  columnCount,
}: InsightSelectionAdapterOptions) {
  const [internalSelection, setInternalSelection] = useState<CellRange | null>(null)
  const controlled = selection !== undefined
  const requestedSelection = controlled ? selection : internalSelection
  const dataSelection = useMemo(() => clampDataSelection(
    requestedSelection,
    headerOffset,
    rowNumberOffset,
    rowCount,
    columnCount,
  ), [
    requestedSelection,
    headerOffset,
    rowNumberOffset,
    rowCount,
    columnCount,
  ])
  const viewportSelection = useMemo(
    () => dataSelection
      ? dataRangeToViewport(dataSelection, headerOffset, rowNumberOffset)
      : null,
    [dataSelection, headerOffset, rowNumberOffset],
  )
  const handleViewportSelectionChange = useCallback((range: CellRange | null) => {
    const next = viewportRangeToData(
      range,
      headerOffset,
      rowNumberOffset,
      rowCount,
      columnCount,
    )
    if (!controlled) setInternalSelection(next)
    onSelectionChange?.(next)
  }, [
    controlled,
    onSelectionChange,
    headerOffset,
    rowNumberOffset,
    rowCount,
    columnCount,
  ])

  return {
    dataSelection,
    viewportSelection,
    handleViewportSelectionChange,
  }
}

function clampDataSelection(
  range: CellRange | null | undefined,
  headerOffset: number,
  rowNumberOffset: number,
  rowCount: number,
  columnCount: number,
): CellRange | null {
  if (!range) return null
  return viewportRangeToData(
    dataRangeToViewport(range, headerOffset, rowNumberOffset),
    headerOffset,
    rowNumberOffset,
    rowCount,
    columnCount,
  )
}
