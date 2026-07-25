import { describe, expect, it } from 'vitest'
import {
  getKeyboardNavigationDirection,
  hasSelectionTraversalWrapped,
  moveNavigationAddress,
  moveTabAddress,
  moveWithinSelection,
  moveWithinSelectionSurfaces,
  shouldExtendKeyboardSelection,
} from '../src/core/keyboardNavigation'

describe('Core keyboard navigation', () => {
  it('reverses Tab and Enter without turning them into range extension', () => {
    expect(getKeyboardNavigationDirection('Tab', false)).toBe('right')
    expect(getKeyboardNavigationDirection('Tab', true)).toBe('left')
    expect(getKeyboardNavigationDirection('Enter', false)).toBe('down')
    expect(getKeyboardNavigationDirection('Enter', true)).toBe('up')
    expect(shouldExtendKeyboardSelection('Tab', true)).toBe(false)
    expect(shouldExtendKeyboardSelection('Enter', true)).toBe(false)
  })

  it('detects when selection traversal should release native Tab navigation', () => {
    expect(hasSelectionTraversalWrapped(
      { row: 3, column: 6 },
      { row: 2, column: 4 },
      'right',
    )).toBe(true)
    expect(hasSelectionTraversalWrapped(
      { row: 2, column: 4 },
      { row: 3, column: 6 },
      'left',
    )).toBe(true)
    expect(hasSelectionTraversalWrapped(
      { row: 2, column: 5 },
      { row: 2, column: 6 },
      'right',
    )).toBe(false)
    expect(hasSelectionTraversalWrapped(
      { row: 2, column: 5 },
      { row: 2, column: 4 },
      'left',
    )).toBe(false)
    expect(hasSelectionTraversalWrapped(
      { row: 2, column: 5 },
      { row: 2, column: 5 },
      'right',
    )).toBe(false)
  })

  it('keeps Shift plus Arrow as the range-extension gesture', () => {
    expect(getKeyboardNavigationDirection('ArrowLeft', true)).toBe('left')
    expect(shouldExtendKeyboardSelection('ArrowLeft', true)).toBe(true)
    expect(shouldExtendKeyboardSelection('ArrowLeft', false)).toBe(false)
  })

  it('wraps Tab across row boundaries while keeping arrow keys clamped', () => {
    const bounds = { rowStart: 1, rowEnd: 200, columnStart: 1, columnEnd: 26 }
    const getMerge = () => undefined
    expect(moveTabAddress({ row: 1, column: 26 }, bounds, false, getMerge))
      .toEqual({ row: 2, column: 1 })
    expect(moveTabAddress({ row: 2, column: 1 }, bounds, true, getMerge))
      .toEqual({ row: 1, column: 26 })
    expect(moveNavigationAddress({ row: 1, column: 26 }, bounds, 'right'))
      .toEqual({ row: 1, column: 26 })
    expect(moveTabAddress({ row: 1, column: 1 }, bounds, true, getMerge))
      .toEqual({ row: 1, column: 1 })
  })

  it('skips covered merge fragments when Tab crosses a row boundary', () => {
    const bounds = { rowStart: 1, rowEnd: 3, columnStart: 1, columnEnd: 26 }
    const merge = { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 1 }
    const getMerge = ({ row, column }: { row: number; column: number }) => (
      row <= 2 && column === 1 ? merge : undefined
    )
    expect(moveTabAddress({ row: 1, column: 26 }, bounds, false, getMerge))
      .toEqual({ row: 2, column: 2 })
    expect(moveTabAddress({ row: 2, column: 2 }, bounds, true, getMerge))
      .toEqual({ row: 1, column: 26 })
  })

  it('enters the merge owner when reverse Tab reaches its owner row', () => {
    const bounds = { rowStart: 1, rowEnd: 3, columnStart: 1, columnEnd: 26 }
    const leftMerge = { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 2 }
    const middleMerge = { rowStart: 1, rowEnd: 2, columnStart: 2, columnEnd: 3 }
    const inMerge = (merge: typeof leftMerge) => ({ row, column }: { row: number; column: number }) => (
      row >= merge.rowStart && row <= merge.rowEnd
      && column >= merge.columnStart && column <= merge.columnEnd ? merge : undefined
    )
    expect(moveTabAddress({ row: 1, column: 3 }, bounds, true, inMerge(leftMerge)))
      .toEqual({ row: 1, column: 1 })
    expect(moveTabAddress({ row: 1, column: 4 }, bounds, true, inMerge(middleMerge)))
      .toEqual({ row: 1, column: 2 })
  })

  it('exits a full-width multi-row merge and treats its axis slice as one surface', () => {
    const bounds = { rowStart: 1, rowEnd: 4, columnStart: 1, columnEnd: 26 }
    const merge = { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 26 }
    const getMerge = ({ row, column }: { row: number; column: number }) => (
      row <= 2 && column <= 26 ? merge : undefined
    )
    expect(moveTabAddress({ row: 1, column: 1 }, bounds, false, getMerge))
      .toEqual({ row: 3, column: 1 })
    expect(moveTabAddress({ row: 3, column: 1 }, bounds, true, getMerge))
      .toEqual({ row: 1, column: 1 })
    expect(moveWithinSelectionSurfaces(
      { row: 1, column: 1 },
      { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 26 },
      'right',
      getMerge,
    )).toEqual({ row: 1, column: 1 })
  })

  it('cycles Tab and Enter targets inside a retained range', () => {
    const range = { rowStart: 2, rowEnd: 3, columnStart: 4, columnEnd: 6 }
    expect(moveWithinSelection({ row: 2, column: 6 }, range, 'right')).toEqual({ row: 3, column: 4 })
    expect(moveWithinSelection({ row: 3, column: 6 }, range, 'right')).toEqual({ row: 2, column: 4 })
    expect(moveWithinSelection({ row: 3, column: 4 }, range, 'down')).toEqual({ row: 2, column: 5 })
    expect(moveWithinSelection({ row: 2, column: 4 }, range, 'up')).toEqual({ row: 3, column: 6 })
  })

  it('traverses merged surfaces once in both row-major and column-major order', () => {
    const range = { rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 2 }
    const merge = { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 }
    const getMerge = ({ row, column }: { row: number; column: number }) => (
      row <= 1 && column <= 1 ? merge : undefined
    )

    expect(moveWithinSelectionSurfaces({ row: 0, column: 0 }, range, 'right', getMerge))
      .toEqual({ row: 0, column: 2 })
    expect(moveWithinSelectionSurfaces({ row: 0, column: 2 }, range, 'right', getMerge))
      .toEqual({ row: 1, column: 2 })
    expect(moveWithinSelectionSurfaces({ row: 1, column: 2 }, range, 'left', getMerge))
      .toEqual({ row: 0, column: 2 })
    expect(moveWithinSelectionSurfaces({ row: 0, column: 2 }, range, 'left', getMerge))
      .toEqual({ row: 0, column: 0 })
    expect(moveWithinSelectionSurfaces({ row: 0, column: 0 }, range, 'down', getMerge))
      .toEqual({ row: 2, column: 0 })
    expect(moveWithinSelectionSurfaces({ row: 2, column: 0 }, range, 'down', getMerge))
      .toEqual({ row: 2, column: 1 })
  })

  it('returns the active cell when the rest of an axis selection is covered fragments', () => {
    const range = { rowStart: 1, rowEnd: 3, columnStart: 2, columnEnd: 2 }
    const merge = { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 2 }
    const getMerge = ({ row, column }: { row: number; column: number }) => (
      row <= 2 && column <= 2 ? merge : undefined
    )
    expect(moveWithinSelectionSurfaces({ row: 3, column: 2 }, range, 'right', getMerge))
      .toEqual({ row: 3, column: 2 })
  })

  it('returns a merge owner when reverse traversal first reaches a covered fragment', () => {
    const horizontalRange = { rowStart: 5, rowEnd: 5, columnStart: 3, columnEnd: 6 }
    const horizontalMerge = { rowStart: 5, rowEnd: 5, columnStart: 5, columnEnd: 6 }
    const getHorizontalMerge = ({ row, column }: { row: number; column: number }) => (
      row === 5 && column >= 5 ? horizontalMerge : undefined
    )
    expect(moveWithinSelectionSurfaces(
      { row: 5, column: 3 },
      horizontalRange,
      'up',
      getHorizontalMerge,
    )).toEqual({ row: 5, column: 5 })

    const verticalRange = { rowStart: 1, rowEnd: 6, columnStart: 3, columnEnd: 3 }
    const verticalMerge = { rowStart: 1, rowEnd: 3, columnStart: 3, columnEnd: 3 }
    const getVerticalMerge = ({ row, column }: { row: number; column: number }) => (
      row <= 3 && column === 3 ? verticalMerge : undefined
    )
    expect(moveWithinSelectionSurfaces(
      { row: 4, column: 3 },
      verticalRange,
      'left',
      getVerticalMerge,
    )).toEqual({ row: 1, column: 3 })
  })
})
