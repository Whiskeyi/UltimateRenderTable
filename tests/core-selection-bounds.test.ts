import { describe, expect, expectTypeOf, it } from 'vitest'
import { reconcileSelectionModel } from '../src/core/selectionBounds'
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
      { anchor: { row: 9, column: 10 }, focus: { row: 0, column: 0 } },
      bounds,
      bounds,
    )

    expect(model).toEqual({
      anchor: { row: 6, column: 7 },
      focus: { row: 2, column: 3 },
    })
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
  })
})
