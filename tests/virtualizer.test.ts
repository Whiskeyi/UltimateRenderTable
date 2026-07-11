import { describe, expect, it } from 'vitest'
import { Axis } from '../src/core/axis'
import {
  getVirtualRange,
  getVisibleRange2D,
  retainVirtualRange,
} from '../src/core/virtualizer'

describe('getVirtualRange', () => {
  it('returns inclusive visible and overscanned ranges', () => {
    const axis = new Axis({ count: 100, defaultSize: 10 })
    const range = getVirtualRange(axis, 25, 30, 2)

    expect(range).toEqual({
      start: 0,
      end: 7,
      visibleStart: 2,
      visibleEnd: 5,
      count: 8,
      offset: 0,
      size: 80,
      paddingStart: 0,
      paddingEnd: 920,
    })
  })

  it('treats viewport end as half-open at an exact boundary', () => {
    const axis = new Axis({ count: 100, defaultSize: 10 })
    const range = getVirtualRange(axis, 20, 30, 0)
    expect([range.visibleStart, range.visibleEnd]).toEqual([2, 4])
  })

  it('handles variable sizes and clamps stale scroll positions', () => {
    const axis = new Axis({ count: 100, defaultSize: 10, overrides: [[98, 30]] })
    const range = getVirtualRange(axis, 99_999, 20, { before: 1, after: 0 })

    expect([range.visibleStart, range.visibleEnd]).toEqual([98, 99])
    expect([range.start, range.end]).toEqual([97, 99])
    expect(getVirtualRange(axis, Number.POSITIVE_INFINITY, 20, 0).visibleStart).toBe(98)
  })

  it('returns empty ranges for an empty axis or zero viewport', () => {
    const emptyAxis = new Axis({ count: 0, defaultSize: 10 })
    expect(getVirtualRange(emptyAxis, 0, 100).count).toBe(0)

    const axis = new Axis({ count: 10, defaultSize: 10 })
    expect(getVirtualRange(axis, 0, 0).start).toBe(-1)
  })
})

describe('getVisibleRange2D', () => {
  it('virtualizes rows and columns independently', () => {
    const window = getVisibleRange2D({
      rowAxis: new Axis({ count: 1_000, defaultSize: 20 }),
      columnAxis: new Axis({ count: 1_000, defaultSize: 100 }),
      scrollTop: 100,
      scrollLeft: 250,
      viewportHeight: 100,
      viewportWidth: 300,
      rowOverscan: 1,
      columnOverscan: { before: 2, after: 0 },
    })

    expect([window.rows.visibleStart, window.rows.visibleEnd]).toEqual([5, 9])
    expect([window.rows.start, window.rows.end]).toEqual([4, 10])
    expect([window.columns.visibleStart, window.columns.visibleEnd]).toEqual([2, 5])
    expect([window.columns.start, window.columns.end]).toEqual([0, 5])
  })
})

describe('retainVirtualRange', () => {
  it('keeps the render window while the visible range has forward buffer', () => {
    const previous = { start: 6, end: 18 }

    expect(retainVirtualRange(
      { start: 11, end: 15 },
      previous,
      4,
      1,
      0,
      99,
    )).toBe(previous)
  })

  it('replenishes more overscan in the current scroll direction', () => {
    expect(retainVirtualRange(
      { start: 13, end: 17 },
      { start: 6, end: 18 },
      4,
      1,
      0,
      99,
    )).toEqual({ start: 11, end: 23 })

    expect(retainVirtualRange(
      { start: 12, end: 16 },
      { start: 11, end: 23 },
      4,
      -1,
      0,
      99,
    )).toEqual({ start: 6, end: 18 })
  })

  it('clamps retained windows to the scrollable band', () => {
    expect(retainVirtualRange(
      { start: 2, end: 5 },
      undefined,
      4,
      -1,
      2,
      20,
    )).toEqual({ start: 2, end: 7 })
  })

  it('rebuilds retention after the band or overscan budget changes', () => {
    expect(retainVirtualRange(
      { start: 10, end: 14 },
      { start: 6, end: 18 },
      4,
      0,
      10,
      90,
    )).toEqual({ start: 10, end: 18 })

    expect(retainVirtualRange(
      { start: 10, end: 14 },
      { start: 4, end: 20 },
      1,
      0,
      0,
      99,
    )).toEqual({ start: 9, end: 15 })

    expect(retainVirtualRange(
      { start: 10, end: 14 },
      { start: 9, end: 15 },
      2,
      0,
      0,
      99,
      1,
    )).toEqual({ start: 8, end: 16 })

    expect(retainVirtualRange(
      { start: 10, end: 14 },
      { start: 9, end: 15 },
      0,
      0,
      0,
      99,
      1,
    )).toEqual({ start: 10, end: 14 })
  })
})
