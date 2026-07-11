import { describe, expect, it } from 'vitest'
import { Axis } from '../src/core/axis'
import { getDragAutoScrollVelocity, resolveDragAddress } from '../src/core/dragAutoScroll'

describe('drag selection auto-scroll', () => {
  it('accelerates outside the viewport and caps the frame speed', () => {
    const bounds = { left: 100, right: 500, top: 50, bottom: 350 }

    expect(getDragAutoScrollVelocity({ x: 300, y: 200 }, bounds)).toEqual({ x: 0, y: 0 })
    expect(getDragAutoScrollVelocity({ x: 90, y: 370 }, bounds)).toEqual({ x: -3.5, y: 7 })
    expect(getDragAutoScrollVelocity({ x: 0, y: 500 }, bounds)).toEqual({ x: -32, y: 32 })
  })

  it('resolves a clamped pointer against the current scroll position', () => {
    const rows = new Axis({ count: 100, defaultSize: 20 })
    const columns = new Axis({ count: 100, defaultSize: 50 })
    const viewport = { left: 100, top: 50, width: 300, height: 200 }
    const metrics = {
      scrollTop: 200,
      scrollLeft: 500,
      topHeight: 0,
      bottomHeight: 0,
      bottomStartOffset: rows.totalSize,
      leftWidth: 0,
      rightWidth: 0,
      rightStartOffset: columns.totalSize,
    }

    expect(resolveDragAddress({ x: 450, y: 300 }, viewport, metrics, rows, columns)).toEqual({
      row: 19,
      column: 15,
    })
  })

  it('keeps fixed panes addressable without letting them trap an outside drag', () => {
    const rows = new Axis({ count: 100, defaultSize: 20 })
    const columns = new Axis({ count: 100, defaultSize: 50 })
    const viewport = { left: 100, top: 50, width: 300, height: 200 }
    const metrics = {
      scrollTop: 200,
      scrollLeft: 500,
      topHeight: 20,
      bottomHeight: 20,
      bottomStartOffset: rows.getOffset(99),
      leftWidth: 50,
      rightWidth: 50,
      rightStartOffset: columns.getOffset(99),
    }

    expect(resolveDragAddress({ x: 110, y: 60 }, viewport, metrics, rows, columns)).toEqual({
      row: 0,
      column: 0,
    })
    expect(resolveDragAddress({ x: 390, y: 240 }, viewport, metrics, rows, columns)).toEqual({
      row: 99,
      column: 99,
    })
    expect(resolveDragAddress({ x: 50, y: 0 }, viewport, metrics, rows, columns)).toEqual({
      row: 11,
      column: 11,
    })
    expect(resolveDragAddress({ x: 450, y: 300 }, viewport, metrics, rows, columns)).toEqual({
      row: 18,
      column: 14,
    })
  })
})
