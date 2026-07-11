import { describe, expect, it } from 'vitest'
import {
  buildInsightViewportColumnWidths,
  resolveInsightColumnWidth,
} from '../src/bi/columnLayout'

describe('Insight column layout adapter', () => {
  it('keeps external widths above column defaults in viewport and export paths', () => {
    const overrides = new Map([[0, 224], [2, 168]])
    const viewport = buildInsightViewportColumnWidths(
      [{ width: 120 }, { width: 140 }, { width: 160 }],
      overrides,
      1,
    )

    expect([...viewport]).toEqual([[0, 54], [1, 224], [2, 140], [3, 168]])
    expect(resolveInsightColumnWidth(0, overrides, 120, 136)).toBe(224)
    expect(resolveInsightColumnWidth(1, overrides, 140, 136)).toBe(140)
    expect(resolveInsightColumnWidth(3, overrides, undefined, 136)).toBe(136)
  })
})
