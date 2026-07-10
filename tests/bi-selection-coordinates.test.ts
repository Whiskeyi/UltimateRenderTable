import { describe, expect, it } from 'vitest'
import {
  dataAddressToViewport,
  dataRangeToViewport,
  viewportRangeToData,
  viewportSnapshotToData,
} from '../src/bi/coordinates'

describe('UltiGridInsight data coordinates', () => {
  it('offsets controlled selections and API addresses around table chrome', () => {
    expect(dataAddressToViewport({ row: 4, column: 7 }, 1, 1)).toEqual({ row: 5, column: 8 })
    expect(dataRangeToViewport({
      rowStart: 2,
      rowEnd: 5,
      columnStart: 3,
      columnEnd: 8,
    }, 1, 1)).toEqual({
      rowStart: 3,
      rowEnd: 6,
      columnStart: 4,
      columnEnd: 9,
    })
  })

  it('removes headers and row numbers from selection callbacks', () => {
    expect(viewportRangeToData({
      rowStart: 0,
      rowEnd: 3,
      columnStart: 0,
      columnEnd: 4,
    }, 1, 1, 100, 40)).toEqual({
      rowStart: 0,
      rowEnd: 2,
      columnStart: 0,
      columnEnd: 3,
    })
    expect(viewportRangeToData({
      rowStart: 0,
      rowEnd: 0,
      columnStart: 1,
      columnEnd: 3,
    }, 1, 1, 100, 40)).toBeNull()
  })

  it('reports viewport windows in data coordinates', () => {
    expect(viewportSnapshotToData({
      rowStart: 0,
      rowEnd: 10,
      columnStart: 0,
      columnEnd: 6,
      visibleCellCount: 77,
      renderedCellCount: 120,
      scrollTop: 240,
      scrollLeft: 80,
    }, 1, 1, 100, 40)).toMatchObject({
      rowStart: 0,
      rowEnd: 9,
      columnStart: 0,
      columnEnd: 5,
      visibleCellCount: 60,
      renderedCellCount: 120,
    })
  })
})
