import { describe, expect, it } from 'vitest'
import {
  createSpreadsheetSelectionState,
  spreadsheetSelectionReducer,
} from '../src/demo/useSpreadsheetSelection'

describe('spreadsheet selection state', () => {
  it('commits programmatic selection fields atomically', () => {
    const initial = createSpreadsheetSelectionState({
      rowStart: 2,
      rowEnd: 2,
      columnStart: 4,
      columnEnd: 4,
    })
    const selected = spreadsheetSelectionReducer(initial, {
      type: 'select',
      selection: {
        rowStart: 0,
        rowEnd: 199,
        columnStart: 3,
        columnEnd: 5,
      },
      selectionKind: 'column',
      activeCell: { row: 7, column: 4 },
    })

    expect(selected).toEqual({
      selection: {
        rowStart: 0,
        rowEnd: 199,
        columnStart: 3,
        columnEnd: 5,
      },
      selectionKind: 'column',
      selectionEndpoints: {
        anchor: { row: 7, column: 3 },
        focus: { row: 7, column: 5 },
      },
      activeCell: { row: 7, column: 4 },
    })
  })

  it('accepts viewport callbacks without discarding the other selection fields', () => {
    const initial = createSpreadsheetSelectionState({
      rowStart: 2,
      rowEnd: 2,
      columnStart: 4,
      columnEnd: 4,
    })
    const range = {
      rowStart: 3,
      rowEnd: 5,
      columnStart: 1,
      columnEnd: 2,
    }
    const withRange = spreadsheetSelectionReducer(initial, {
      type: 'viewport-selection',
      selection: range,
      selectionKind: 'cell',
    })
    const withActive = spreadsheetSelectionReducer(withRange, {
      type: 'viewport-active-cell',
      activeCell: { row: 5, column: 2 },
    })
    const withEndpoints = spreadsheetSelectionReducer(withActive, {
      type: 'viewport-endpoints',
      selectionEndpoints: {
        anchor: { row: 3, column: 1 },
        focus: { row: 5, column: 2 },
      },
    })

    expect(withEndpoints).toMatchObject({
      selection: range,
      selectionKind: 'cell',
      activeCell: { row: 5, column: 2 },
      selectionEndpoints: {
        anchor: { row: 3, column: 1 },
        focus: { row: 5, column: 2 },
      },
    })
  })
})
