import { describe, expect, it } from 'vitest'
import { MergeIndex, type MergeRegion } from '../src/core/mergeIndex'

describe('MergeIndex', () => {
  it('queries a merge spanning 10k columns as one rectangle', () => {
    const wide: MergeRegion<{ label: string }> = {
      id: 'wide',
      rowStart: 4,
      rowEnd: 6,
      columnStart: 10,
      columnEnd: 10_009,
      data: { label: 'wide merge' },
    }
    const index = new MergeIndex([wide])

    expect(index.size).toBe(1)
    expect(index.getAt(5, 10_009)?.id).toBe('wide')
    expect(index.getAt(5, 10_010)).toBeUndefined()
    expect(index.query({
      rowStart: 6,
      rowEnd: 6,
      columnStart: 10_009,
      columnEnd: 10_009,
    }).map((region) => region.id)).toEqual(['wide'])
  })

  it('uses inclusive 2D intersection bounds across packed branches', () => {
    const regions: MergeRegion<number>[] = []
    for (let row = 0; row < 30; row += 1) {
      for (let column = 0; column < 30; column += 1) {
        regions.push({
          id: `${row}:${column}`,
          rowStart: row * 3,
          rowEnd: row * 3 + 1,
          columnStart: column * 4,
          columnEnd: column * 4 + 2,
          data: row + column,
        })
      }
    }
    const index = new MergeIndex(regions, { maxEntries: 8 })

    const result = index.query({
      rowStart: 10,
      rowEnd: 12,
      columnStart: 18,
      columnEnd: 20,
    })
    expect(new Set(result.map((region) => region.id))).toEqual(new Set(['3:4', '3:5', '4:4', '4:5']))
  })

  it('rebuilds lazily after set/remove and reuses query output', () => {
    const index = new MergeIndex()
    index.set({ id: 'a', rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 2 })
    expect(index.getAt(1, 1)?.id).toBe('a')

    index.set({ id: 'b', rowStart: 10, rowEnd: 12, columnStart: 20, columnEnd: 22 })
    expect(index.getAt(11, 21)?.id).toBe('b')
    expect(index.remove('a')).toBe(true)
    expect(index.getAt(1, 1)).toBeUndefined()

    const output = [{ id: 'stale', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 }]
    expect(index.query({ rowStart: 10, rowEnd: 10, columnStart: 20, columnEnd: 20 }, output)).toBe(output)
    expect(output.map((region) => region.id)).toEqual(['b'])
  })

  it('matches brute-force 2D intersections for many packed nodes', () => {
    let seed = 19
    const random = (limit: number) => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed % limit
    }
    const regions = Array.from({ length: 500 }, (_, index): MergeRegion => {
      const rowStart = random(2_000)
      const columnStart = random(2_000)
      return {
        id: String(index),
        rowStart,
        rowEnd: rowStart + random(80),
        columnStart,
        columnEnd: columnStart + random(80),
      }
    })
    const index = new MergeIndex(regions, { maxEntries: 8 })

    for (let queryIndex = 0; queryIndex < 100; queryIndex += 1) {
      const rowStart = random(2_000)
      const columnStart = random(2_000)
      const bounds = {
        rowStart,
        rowEnd: rowStart + random(100),
        columnStart,
        columnEnd: columnStart + random(100),
      }
      const expected = regions.filter((region) => region.rowStart <= bounds.rowEnd
        && region.rowEnd >= bounds.rowStart
        && region.columnStart <= bounds.columnEnd
        && region.columnEnd >= bounds.columnStart)
      expect(new Set(index.query(bounds).map((region) => region.id))).toEqual(
        new Set(expected.map((region) => region.id)),
      )
    }
  })

  it('keeps the previous dataset when replaceAll validation fails', () => {
    const index = new MergeIndex([
      { id: 'old', rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 2 },
    ])
    expect(index.getAt(1, 1)?.id).toBe('old')

    expect(() => index.replaceAll([
      { id: 'new', rowStart: 10, rowEnd: 11, columnStart: 10, columnEnd: 11 },
      { id: 'invalid', rowStart: 5, rowEnd: 4, columnStart: 0, columnEnd: 0 },
    ])).toThrow(RangeError)

    expect(index.size).toBe(1)
    expect(index.has('old')).toBe(true)
    expect(index.has('new')).toBe(false)
    expect(index.getAt(1, 1)?.id).toBe('old')
  })
})
