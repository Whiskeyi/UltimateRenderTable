import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  reconcileSelectionModel,
  resolveSelectionOverlayFragment,
  resolveSelectionThroughMerges,
} from '../src/core/selectionBounds'
import { MergeIndex } from '../src/core/mergeIndex'
import {
  clampAddressToRange,
  clampRangeToBounds,
  resolveSelectionBounds,
  type UltiGridViewportApi,
  type UltiGridViewportProps,
} from '../src/core/viewportTypes'

describe('Core selection bounds', () => {
  it('resolves full, intersected, null, and empty selectable regions', () => {
    expect(resolveSelectionBounds(undefined, 10, 8)).toEqual({
      rowStart: 0,
      rowEnd: 9,
      columnStart: 0,
      columnEnd: 7,
    })
    expect(resolveSelectionBounds(null, 10, 8)).toBeNull()
    expect(resolveSelectionBounds({
      rowStart: -3,
      rowEnd: 4,
      columnStart: 2,
      columnEnd: 20,
    }, 10, 8)).toEqual({ rowStart: 0, rowEnd: 4, columnStart: 2, columnEnd: 7 })
    expect(resolveSelectionBounds({
      rowStart: 20,
      rowEnd: 30,
      columnStart: 0,
      columnEnd: 2,
    }, 10, 8)).toBeNull()
  })

  it('clamps ranges and endpoints to the same invariant', () => {
    const bounds = { rowStart: 2, rowEnd: 6, columnStart: 3, columnEnd: 7 }
    expect(clampAddressToRange({ row: 10, column: 0 }, bounds)).toEqual({ row: 6, column: 3 })
    expect(clampRangeToBounds({
      rowStart: 0,
      rowEnd: 9,
      columnStart: 4,
      columnEnd: 12,
    }, bounds)).toEqual({ rowStart: 2, rowEnd: 6, columnStart: 4, columnEnd: 7 })
    expect(clampRangeToBounds(null, bounds)).toBeNull()
  })

  it('preserves a reverse anchor when controlled selection is clipped', () => {
    const bounds = { rowStart: 2, rowEnd: 6, columnStart: 3, columnEnd: 7 }
    const model = reconcileSelectionModel(
      {
        anchor: { row: 9, column: 10 },
        focus: { row: 0, column: 0 },
        active: { row: 9, column: 10 },
        range: { rowStart: 0, rowEnd: 9, columnStart: 0, columnEnd: 10 },
      },
      bounds,
      bounds,
    )

    expect(model).toEqual({
      anchor: { row: 6, column: 7 },
      focus: { row: 2, column: 3 },
      active: { row: 6, column: 7 },
      range: bounds,
    })
  })

  it('defaults the active cell to the top-left of a controlled range', () => {
    expect(reconcileSelectionModel(null, {
      rowStart: 3,
      rowEnd: 7,
      columnStart: 4,
      columnEnd: 8,
    }, {
      rowStart: 0,
      rowEnd: 20,
      columnStart: 0,
      columnEnd: 20,
    })).toEqual({
      anchor: { row: 3, column: 4 },
      focus: { row: 7, column: 8 },
      active: { row: 3, column: 4 },
      range: { rowStart: 3, rowEnd: 7, columnStart: 4, columnEnd: 8 },
    })
  })

  it('honors a controlled active cell while preserving the controlled range', () => {
    expect(reconcileSelectionModel(null, {
      rowStart: 1,
      rowEnd: 10,
      columnStart: 4,
      columnEnd: 4,
    }, {
      rowStart: 1,
      rowEnd: 20,
      columnStart: 1,
      columnEnd: 8,
    }, { row: 6, column: 4 })).toEqual({
      anchor: { row: 1, column: 4 },
      focus: { row: 10, column: 4 },
      active: { row: 6, column: 4 },
      range: { rowStart: 1, rowEnd: 10, columnStart: 4, columnEnd: 4 },
    })
  })

  it('honors controlled directional endpoints for a reverse range', () => {
    expect(reconcileSelectionModel(null, {
      rowStart: 1,
      rowEnd: 10,
      columnStart: 2,
      columnEnd: 5,
    }, {
      rowStart: 0,
      rowEnd: 20,
      columnStart: 0,
      columnEnd: 8,
    }, { row: 1, column: 5 }, {
      anchor: { row: 1, column: 5 },
      focus: { row: 10, column: 2 },
    })).toEqual({
      anchor: { row: 1, column: 5 },
      focus: { row: 10, column: 2 },
      active: { row: 1, column: 5 },
      range: { rowStart: 1, rowEnd: 10, columnStart: 2, columnEnd: 5 },
    })
  })

  it('keeps column-selection direction without forcing endpoints to sheet edges', () => {
    expect(reconcileSelectionModel(null, {
      rowStart: 1,
      rowEnd: 200,
      columnStart: 2,
      columnEnd: 5,
    }, {
      rowStart: 1,
      rowEnd: 200,
      columnStart: 1,
      columnEnd: 26,
    }, { row: 6, column: 5 }, {
      anchor: { row: 6, column: 5 },
      focus: { row: 6, column: 2 },
    }, 'column')).toMatchObject({
      anchor: { row: 6, column: 5 },
      focus: { row: 6, column: 2 },
      active: { row: 6, column: 5 },
    })
  })

  it('rebuilds raw endpoints whose merge closure matches the controlled range', () => {
    const merge = new MergeIndex([
      { id: 'title', rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
    ])
    expect(reconcileSelectionModel(null, {
      rowStart: 1,
      rowEnd: 1,
      columnStart: 1,
      columnEnd: 8,
    }, {
      rowStart: 1,
      rowEnd: 20,
      columnStart: 1,
      columnEnd: 26,
    }, { row: 1, column: 1 }, {
      anchor: { row: 1, column: 2 },
      focus: { row: 1, column: 2 },
    }, 'cell', merge)).toMatchObject({
      anchor: { row: 1, column: 2 },
      focus: { row: 1, column: 2 },
      active: { row: 1, column: 1 },
    })
  })

  it('rebuilds directional endpoints when a merge topology change invalidates them', () => {
    const model = reconcileSelectionModel({
      anchor: { row: 1, column: 2 },
      focus: { row: 1, column: 2 },
      active: { row: 1, column: 1 },
      range: { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
    }, {
      rowStart: 1,
      rowEnd: 1,
      columnStart: 1,
      columnEnd: 8,
    }, {
      rowStart: 1,
      rowEnd: 20,
      columnStart: 1,
      columnEnd: 26,
    }, { row: 1, column: 1 }, {
      anchor: { row: 1, column: 2 },
      focus: { row: 1, column: 2 },
    }, 'cell', new MergeIndex())

    expect(model).toMatchObject({
      anchor: { row: 1, column: 1 },
      focus: { row: 1, column: 8 },
      active: { row: 1, column: 1 },
    })
  })

  it('splits an overlay at pane boundaries without drawing internal edges', () => {
    expect(resolveSelectionOverlayFragment(
      { rowStart: 2, rowEnd: 8, columnStart: 3, columnEnd: 9 },
      { rowStart: 5, rowEnd: 12, columnStart: 0, columnEnd: 6 },
      { rowStart: 2, rowEnd: 2, columnStart: 3, columnEnd: 3 },
    )).toEqual({
      range: { rowStart: 5, rowEnd: 8, columnStart: 3, columnEnd: 6 },
      activeRange: null,
      top: false,
      right: false,
      bottom: true,
      left: true,
    })
  })

  it('keeps whole-row and whole-column selections independent of merged cells', () => {
    const bounds = { rowStart: 1, rowEnd: 200, columnStart: 1, columnEnd: 26 }
    const horizontalMerge = new MergeIndex([
      { id: 'title', rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
    ])
    const verticalMerge = new MergeIndex([
      { id: 'side', rowStart: 1, rowEnd: 8, columnStart: 1, columnEnd: 1 },
    ])

    expect(resolveSelectionThroughMerges(
      { rowStart: 1, rowEnd: 200, columnStart: 3, columnEnd: 3 },
      bounds,
      horizontalMerge,
      'column',
    )).toEqual({ rowStart: 1, rowEnd: 200, columnStart: 3, columnEnd: 3 })
    expect(resolveSelectionThroughMerges(
      { rowStart: 8, rowEnd: 8, columnStart: 1, columnEnd: 26 },
      bounds,
      verticalMerge,
      'row',
    )).toEqual({ rowStart: 8, rowEnd: 8, columnStart: 1, columnEnd: 26 })
    expect(resolveSelectionThroughMerges(bounds, bounds, horizontalMerge, 'sheet')).toEqual(bounds)
    expect(resolveSelectionThroughMerges(
      { rowStart: 1, rowEnd: 5, columnStart: 3, columnEnd: 3 },
      bounds,
      horizontalMerge,
    )).toEqual({ rowStart: 1, rowEnd: 5, columnStart: 1, columnEnd: 8 })
  })

  it('uses explicit intent even when cell and axis geometry are ambiguous', () => {
    const merge = new MergeIndex([
      { id: 'title', rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
    ])
    expect(resolveSelectionThroughMerges(
      { rowStart: 1, rowEnd: 1, columnStart: 3, columnEnd: 3 },
      { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
      merge,
      'cell',
    )).toEqual({ rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 })
    expect(resolveSelectionThroughMerges(
      { rowStart: 1, rowEnd: 1, columnStart: 3, columnEnd: 3 },
      { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 8 },
      merge,
      'column',
    )).toEqual({ rowStart: 1, rowEnd: 1, columnStart: 3, columnEnd: 3 })
  })

  it('publishes bounds, layout reset, and effective-width API types', () => {
    const props = {
      rowCount: 1,
      columnCount: 1,
      getCell: () => '',
      selectionBounds: { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 },
      columnLayoutVersion: 'layout-2',
    } satisfies UltiGridViewportProps

    expect(props.columnLayoutVersion).toBe('layout-2')
    expectTypeOf<UltiGridViewportApi['getColumnWidth']>()
      .returns.toEqualTypeOf<number | undefined>()
    expectTypeOf<UltiGridViewportApi['getActiveCell']>()
      .returns.toEqualTypeOf<{ row: number; column: number } | null>()
  })
})
