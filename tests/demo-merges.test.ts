import { describe, expect, it } from 'vitest'
import { buildAdjacentMerges } from '../src/bi/adjacentMerge'
import {
  createDemoColumnGetter,
  type DemoRow,
} from '../src/demo/demoData'

function createAnalysisMerges(rowCount: number) {
  const getColumn = createDemoColumnGetter('analysis', 'zh-CN')
  return buildAdjacentMerges<DemoRow>({
    rowCount,
    columnCount: 10,
    getRow: (index) => ({ id: index, index }),
    getColumnValue: (columnIndex, row, rowIndex) => (
      getColumn(columnIndex).getValue(row, rowIndex)
    ),
  }, { columns: [0, 1] })
}

describe('analysis adjacent-dimension demo', () => {
  it('shows nested region and product merges in the first viewport', () => {
    const merges = createAnalysisMerges(24)

    expect(merges).toContainEqual(expect.objectContaining({
      rowStart: 0,
      rowEnd: 7,
      columnStart: 0,
      columnEnd: 0,
    }))
    expect(merges).toContainEqual(expect.objectContaining({
      rowStart: 0,
      rowEnd: 3,
      columnStart: 1,
      columnEnd: 1,
    }))
    expect(merges.filter((merge) => merge.columnStart === 0)).toHaveLength(3)
    expect(merges.filter((merge) => merge.columnStart === 1)).toHaveLength(6)
  })

  it('keeps generated dimension ranges ordered and non-overlapping per column', () => {
    const merges = createAnalysisMerges(96)

    for (const columnIndex of [0, 1]) {
      const ranges = merges.filter((merge) => merge.columnStart === columnIndex)
      for (let index = 1; index < ranges.length; index += 1) {
        expect(ranges[index]!.rowStart).toBeGreaterThan(ranges[index - 1]!.rowEnd)
      }
    }
  })
})
