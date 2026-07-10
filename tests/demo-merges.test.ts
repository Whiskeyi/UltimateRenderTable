import { describe, expect, it } from 'vitest'
import { createDemoMerges } from '../src/demo/demoData'

const ROW_COUNT = 100_000
const COLUMN_COUNT = 100_000

describe('demo merged scenario', () => {
  it('includes independent horizontal and vertical 10k stress merges', () => {
    const merges = createDemoMerges(ROW_COUNT, COLUMN_COUNT, 128, 'merged')
    const horizontal = merges.find((merge) => merge.id === 'horizontal-stress-10k-columns')
    const vertical = merges.find((merge) => merge.id === 'vertical-stress-10k-rows')

    expect(horizontal).toMatchObject({
      rowStart: 0,
      rowEnd: 0,
      columnStart: 0,
      columnEnd: 10_500,
    })
    expect(vertical).toMatchObject({
      rowStart: 2,
      rowEnd: 10_500,
      columnStart: 0,
      columnEnd: 0,
    })
    expect(horizontal!.columnEnd - horizontal!.columnStart + 1).toBeGreaterThanOrEqual(10_000)
    expect(vertical!.rowEnd - vertical!.rowStart + 1).toBeGreaterThanOrEqual(10_000)
  })

  it('keeps every merge inside the grid as a non-overlapping rectangle', () => {
    const merges = createDemoMerges(ROW_COUNT, COLUMN_COUNT, 128, 'merged')

    expect(new Set(merges.map((merge) => merge.id)).size).toBe(merges.length)

    for (const merge of merges) {
      expect(Number.isInteger(merge.rowStart)).toBe(true)
      expect(Number.isInteger(merge.rowEnd)).toBe(true)
      expect(Number.isInteger(merge.columnStart)).toBe(true)
      expect(Number.isInteger(merge.columnEnd)).toBe(true)
      expect(merge.rowStart).toBeGreaterThanOrEqual(0)
      expect(merge.columnStart).toBeGreaterThanOrEqual(0)
      expect(merge.rowEnd).toBeGreaterThanOrEqual(merge.rowStart)
      expect(merge.columnEnd).toBeGreaterThanOrEqual(merge.columnStart)
      expect(merge.rowEnd).toBeLessThan(ROW_COUNT)
      expect(merge.columnEnd).toBeLessThan(COLUMN_COUNT)
    }

    for (let leftIndex = 0; leftIndex < merges.length; leftIndex += 1) {
      const left = merges[leftIndex]!
      for (let rightIndex = leftIndex + 1; rightIndex < merges.length; rightIndex += 1) {
        const right = merges[rightIndex]!
        const rowOverlap = left.rowStart <= right.rowEnd && right.rowStart <= left.rowEnd
        const columnOverlap = left.columnStart <= right.columnEnd && right.columnStart <= left.columnEnd

        expect(rowOverlap && columnOverlap, `${left.id} overlaps ${right.id}`).toBe(false)
      }
    }
  })
})
