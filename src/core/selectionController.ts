import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { MergeIndex } from './mergeIndex.js'
import {
  reconcileSelectionModel,
  resolveSelectionThroughMerges,
  type SelectionModel,
} from './selectionBounds.js'
import {
  clampAddressToRange,
  clampRangeToBounds,
  normalizeRange,
  type CellAddress,
  type CellRange,
  type SelectionEndpoints,
  type SelectionKind,
  type UltiGridViewportProps,
} from './viewportTypes.js'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type SelectionIntent = Pick<SelectionModel, 'anchor' | 'focus' | 'active'>

interface SelectionControllerOptions {
  boundedDefaultSelection: CellRange | null
  selectableBounds: CellRange | null
  mergeIndex: MergeIndex<CellRange>
  controlledSelection: CellRange | null | undefined
  controlledSelectionKind: SelectionKind
  controlledSelectionEndpoints: SelectionEndpoints | null | undefined
  controlledActiveCell: CellAddress | null | undefined
  onSelectionChange: UltiGridViewportProps['onSelectionChange']
  onSelectionEndpointsChange: UltiGridViewportProps['onSelectionEndpointsChange']
  onActiveCellChange: UltiGridViewportProps['onActiveCellChange']
}

interface SelectionController {
  selection: CellRange | null
  renderedSelectionModel: SelectionModel | null
  selectionInteractionActive: boolean
  beginSelectionInteraction: () => void
  endSelectionInteraction: () => void
  getSelectionModel: () => SelectionModel | null
  getSelection: () => CellRange | null
  getActiveCell: () => CellAddress | null
  commitSelection: (next: SelectionIntent | null, kind?: SelectionKind) => void
}

export function useSelectionController({
  boundedDefaultSelection,
  selectableBounds,
  mergeIndex,
  controlledSelection,
  controlledSelectionKind,
  controlledSelectionEndpoints,
  controlledActiveCell,
  onSelectionChange,
  onSelectionEndpointsChange,
  onActiveCellChange,
}: SelectionControllerOptions): SelectionController {
  const [internalSelection, setInternalSelection] = useState<CellRange | null>(
    boundedDefaultSelection,
  )
  const [selectionDragActive, setSelectionDragActive] = useState(false)
  const selectionModelRef = useRef<SelectionModel | null>(
    createInitialSelectionModel(boundedDefaultSelection),
  )
  const rawSelection = controlledSelection === undefined
    ? internalSelection
    : controlledSelection
  const boundedSelection = useMemo(
    () => clampRangeToBounds(rawSelection, selectableBounds),
    [rawSelection, selectableBounds],
  )
  const selection = useMemo(
    () => resolveSelectionThroughMerges(
      boundedSelection,
      selectableBounds,
      mergeIndex,
      controlledSelection === undefined ? 'cell' : controlledSelectionKind,
    ),
    [
      boundedSelection,
      controlledSelection,
      controlledSelectionKind,
      mergeIndex,
      selectableBounds,
    ],
  )
  const currentSelectionRef = useRef<CellRange | null>(selection)
  useIsomorphicLayoutEffect(() => {
    currentSelectionRef.current = selection
  }, [selection])

  const resolvedControlledActiveCell = useMemo(() => {
    if (!selection || !controlledActiveCell) return null
    const active = clampAddressToRange(controlledActiveCell, selection)
    const merge = mergeIndex.getAt(active.row, active.column)
    return merge && rangeContains(selection, merge)
      ? { row: merge.rowStart, column: merge.columnStart }
      : active
  }, [controlledActiveCell, mergeIndex, selection])

  const commitSelection = useCallback((
    next: SelectionIntent | null,
    kind: SelectionKind = 'cell',
  ) => {
    const stableIntent = next && selectableBounds ? {
      anchor: clampAddressToRange(next.anchor, selectableBounds),
      focus: clampAddressToRange(next.focus, selectableBounds),
      active: clampAddressToRange(next.active, selectableBounds),
    } : null
    const normalizedIntentRange = stableIntent ? normalizeRange({
      rowStart: stableIntent.anchor.row,
      rowEnd: stableIntent.focus.row,
      columnStart: stableIntent.anchor.column,
      columnEnd: stableIntent.focus.column,
    }) : null
    const normalizedRange = normalizedIntentRange && selectableBounds ? {
      rowStart: kind === 'column' || kind === 'sheet'
        ? selectableBounds.rowStart
        : normalizedIntentRange.rowStart,
      rowEnd: kind === 'column' || kind === 'sheet'
        ? selectableBounds.rowEnd
        : normalizedIntentRange.rowEnd,
      columnStart: kind === 'row' || kind === 'sheet'
        ? selectableBounds.columnStart
        : normalizedIntentRange.columnStart,
      columnEnd: kind === 'row' || kind === 'sheet'
        ? selectableBounds.columnEnd
        : normalizedIntentRange.columnEnd,
    } : null
    const stableRange = resolveSelectionThroughMerges(
      normalizedRange,
      selectableBounds,
      mergeIndex,
      kind,
    )
    const intendedActive = stableIntent && stableRange
      ? clampAddressToRange(stableIntent.active, stableRange)
      : null
    const activeMerge = intendedActive
      ? mergeIndex.getAt(intendedActive.row, intendedActive.column)
      : undefined
    const stableActive = intendedActive && activeMerge && rangeContains(stableRange!, activeMerge)
      ? { row: activeMerge.rowStart, column: activeMerge.columnStart }
      : intendedActive
    const stableModel = stableIntent && stableRange ? {
      ...stableIntent,
      active: stableActive!,
      range: stableRange,
    } : null
    currentSelectionRef.current = stableRange
    selectionModelRef.current = stableModel
    if (controlledSelection === undefined) setInternalSelection(stableRange)
    onSelectionChange?.(stableRange, kind)
    onSelectionEndpointsChange?.(stableModel ? {
      anchor: stableModel.anchor,
      focus: stableModel.focus,
    } : null)
    onActiveCellChange?.(stableModel?.active ?? null)
  }, [
    controlledSelection,
    mergeIndex,
    onActiveCellChange,
    onSelectionChange,
    onSelectionEndpointsChange,
    selectableBounds,
  ])

  useIsomorphicLayoutEffect(() => {
    if (controlledSelection === undefined || selectionDragActive) return
    const reconciled = reconcileSelectionModel(
      selectionModelRef.current,
      selection,
      selectableBounds,
      resolvedControlledActiveCell,
      controlledSelectionEndpoints,
      controlledSelectionKind,
      mergeIndex,
    )
    selectionModelRef.current = reconciled
    if (!rangesEqual(boundedSelection, selection)) {
      onSelectionChange?.(selection, controlledSelectionKind)
    }
    if (controlledActiveCell !== undefined
      && !addressesEqual(controlledActiveCell, resolvedControlledActiveCell)) {
      onActiveCellChange?.(resolvedControlledActiveCell)
    }
    const resolvedEndpoints = reconciled ? {
      anchor: reconciled.anchor,
      focus: reconciled.focus,
    } : null
    if (controlledSelectionEndpoints !== undefined
      && !selectionEndpointsEqual(controlledSelectionEndpoints, resolvedEndpoints)) {
      onSelectionEndpointsChange?.(resolvedEndpoints)
    }
  }, [
    boundedSelection,
    controlledActiveCell,
    controlledSelection,
    controlledSelectionEndpoints,
    controlledSelectionKind,
    mergeIndex,
    onActiveCellChange,
    onSelectionChange,
    onSelectionEndpointsChange,
    resolvedControlledActiveCell,
    selectableBounds,
    selection,
    selectionDragActive,
  ])

  useEffect(() => {
    if (controlledSelection !== undefined || rangesEqual(internalSelection, selection)) return
    setInternalSelection(selection)
    selectionModelRef.current = reconcileSelectionModel(
      selectionModelRef.current,
      selection,
      selectableBounds,
    )
    onSelectionChange?.(selection, 'cell')
  }, [
    controlledSelection,
    internalSelection,
    onSelectionChange,
    selectableBounds,
    selection,
  ])

  const renderedSelectionModel = controlledSelection !== undefined && !selectionDragActive
    ? reconcileSelectionModel(
        selectionModelRef.current,
        selection,
        selectableBounds,
        resolvedControlledActiveCell,
        controlledSelectionEndpoints,
        controlledSelectionKind,
        mergeIndex,
      )
    : selectionModelRef.current ?? reconcileSelectionModel(null, selection, selectableBounds)
  const beginSelectionInteraction = useCallback(() => {
    setSelectionDragActive(true)
  }, [])
  const endSelectionInteraction = useCallback(() => {
    setSelectionDragActive(false)
  }, [])
  const getSelectionModel = useCallback(
    () => selectionModelRef.current
      ?? reconcileSelectionModel(null, currentSelectionRef.current, selectableBounds),
    [selectableBounds],
  )
  const getSelection = useCallback(
    () => getSelectionModel()?.range ?? currentSelectionRef.current,
    [getSelectionModel],
  )
  const getActiveCell = useCallback(() => {
    const model = getSelectionModel()
    if (model) return model.active
    const currentSelection = currentSelectionRef.current
    return currentSelection
      ? { row: currentSelection.rowStart, column: currentSelection.columnStart }
      : null
  }, [getSelectionModel])

  return {
    selection,
    renderedSelectionModel,
    selectionInteractionActive: selectionDragActive,
    beginSelectionInteraction,
    endSelectionInteraction,
    getSelectionModel,
    getSelection,
    getActiveCell,
    commitSelection,
  }
}

export function addressesEqual(
  left: CellAddress | null,
  right: CellAddress | null,
): boolean {
  return left === right || Boolean(
    left && right && left.row === right.row && left.column === right.column,
  )
}

function createInitialSelectionModel(selection: CellRange | null): SelectionModel | null {
  return selection ? {
    anchor: {
      row: selection.rowStart,
      column: selection.columnStart,
    },
    focus: {
      row: selection.rowEnd,
      column: selection.columnEnd,
    },
    active: {
      row: selection.rowStart,
      column: selection.columnStart,
    },
    range: selection,
  } : null
}

function rangeContains(outer: CellRange, inner: CellRange): boolean {
  return inner.rowStart >= outer.rowStart
    && inner.rowEnd <= outer.rowEnd
    && inner.columnStart >= outer.columnStart
    && inner.columnEnd <= outer.columnEnd
}

function rangesEqual(left: CellRange | null, right: CellRange | null): boolean {
  return left === right || Boolean(
    left && right
      && left.rowStart === right.rowStart
      && left.rowEnd === right.rowEnd
      && left.columnStart === right.columnStart
      && left.columnEnd === right.columnEnd,
  )
}

function selectionEndpointsEqual(
  left: SelectionEndpoints | null,
  right: SelectionEndpoints | null,
): boolean {
  return left === right || Boolean(
    left && right
      && addressesEqual(left.anchor, right.anchor)
      && addressesEqual(left.focus, right.focus),
  )
}
