import {
  useCallback,
  useReducer,
  useRef,
} from 'react'
import type {
  CellAddress,
  CellRange,
  SelectionEndpoints,
  SelectionKind,
} from '@ultigrid/insight'

export interface SpreadsheetSelectionState {
  selection: CellRange | null
  selectionKind: SelectionKind
  selectionEndpoints: SelectionEndpoints
  activeCell: CellAddress
}

export type SpreadsheetSelectionAction =
  | {
      type: 'select'
      selection: CellRange
      selectionKind?: SelectionKind
      selectionEndpoints?: SelectionEndpoints
      activeCell?: CellAddress
    }
  | {
      type: 'viewport-selection'
      selection: CellRange | null
      selectionKind: SelectionKind
    }
  | {
      type: 'viewport-active-cell'
      activeCell: CellAddress
    }
  | {
      type: 'viewport-endpoints'
      selectionEndpoints: SelectionEndpoints
    }

export function createSpreadsheetSelectionState(
  selection: CellRange,
): SpreadsheetSelectionState {
  const activeCell = {
    row: selection.rowStart,
    column: selection.columnStart,
  }
  return {
    selection,
    selectionKind: 'cell',
    selectionEndpoints: createSelectionEndpoints(selection, activeCell, 'cell'),
    activeCell,
  }
}

export function spreadsheetSelectionReducer(
  state: SpreadsheetSelectionState,
  action: SpreadsheetSelectionAction,
): SpreadsheetSelectionState {
  if (action.type === 'select') {
    const selectionKind = action.selectionKind ?? 'cell'
    const activeCell = action.activeCell ?? {
      row: action.selection.rowStart,
      column: action.selection.columnStart,
    }
    return {
      selection: action.selection,
      selectionKind,
      selectionEndpoints: action.selectionEndpoints
        ?? createSelectionEndpoints(action.selection, activeCell, selectionKind),
      activeCell,
    }
  }
  if (action.type === 'viewport-selection') {
    if (
      state.selection === action.selection
      && state.selectionKind === action.selectionKind
    ) return state
    return {
      ...state,
      selection: action.selection,
      selectionKind: action.selectionKind,
    }
  }
  if (action.type === 'viewport-active-cell') {
    if (
      state.activeCell.row === action.activeCell.row
      && state.activeCell.column === action.activeCell.column
    ) return state
    return { ...state, activeCell: action.activeCell }
  }
  if (
    state.selectionEndpoints.anchor.row === action.selectionEndpoints.anchor.row
    && state.selectionEndpoints.anchor.column === action.selectionEndpoints.anchor.column
    && state.selectionEndpoints.focus.row === action.selectionEndpoints.focus.row
    && state.selectionEndpoints.focus.column === action.selectionEndpoints.focus.column
  ) return state
  return { ...state, selectionEndpoints: action.selectionEndpoints }
}

export function useSpreadsheetSelection(defaultSelection: CellRange) {
  const [state, dispatch] = useReducer(
    spreadsheetSelectionReducer,
    defaultSelection,
    createSpreadsheetSelectionState,
  )
  const activeCellRef = useRef(state.activeCell)
  activeCellRef.current = state.activeCell

  const select = useCallback((
    selection: CellRange,
    activeCell?: CellAddress,
    selectionKind: SelectionKind = 'cell',
    selectionEndpoints?: SelectionEndpoints,
  ) => {
    dispatch({
      type: 'select',
      selection,
      selectionKind,
      selectionEndpoints,
      activeCell,
    })
  }, [])

  const setViewportSelection = useCallback((
    selection: CellRange | null,
    selectionKind: SelectionKind,
  ) => {
    dispatch({ type: 'viewport-selection', selection, selectionKind })
  }, [])

  const setViewportActiveCell = useCallback((activeCell: CellAddress | null) => {
    if (activeCell) dispatch({ type: 'viewport-active-cell', activeCell })
  }, [])

  const setViewportEndpoints = useCallback((selectionEndpoints: SelectionEndpoints | null) => {
    if (selectionEndpoints) dispatch({ type: 'viewport-endpoints', selectionEndpoints })
  }, [])

  return {
    ...state,
    activeCellRef,
    select,
    setViewportSelection,
    setViewportActiveCell,
    setViewportEndpoints,
  }
}

function createSelectionEndpoints(
  range: CellRange,
  active: CellAddress,
  kind: SelectionKind,
): SelectionEndpoints {
  if (kind === 'column') {
    return {
      anchor: { row: active.row, column: range.columnStart },
      focus: { row: active.row, column: range.columnEnd },
    }
  }
  if (kind === 'row') {
    return {
      anchor: { row: range.rowStart, column: active.column },
      focus: { row: range.rowEnd, column: active.column },
    }
  }
  if (kind === 'sheet') return { anchor: active, focus: active }
  return {
    anchor: { row: range.rowStart, column: range.columnStart },
    focus: { row: range.rowEnd, column: range.columnEnd },
  }
}
