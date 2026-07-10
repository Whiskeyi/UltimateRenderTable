import { describe, expect, it } from 'vitest'
import {
  createSelection,
  moveSelection,
  normalizeSelection,
  parseTSV,
  rangeToTSV,
  selectionToTSV,
  type CellRange,
} from '../src/core/selection'

describe('selection utilities', () => {
  it('normalizes a backwards drag', () => {
    expect(normalizeSelection({
      anchor: { row: 8, column: 7 },
      focus: { row: 3, column: 2 },
    })).toEqual({ rowStart: 3, rowEnd: 8, columnStart: 2, columnEnd: 7 })
  })

  it('moves and shift-extends within grid boundaries', () => {
    const grid = { rowCount: 10, columnCount: 10 }
    const start = createSelection({ row: 0, column: 0 })
    expect(moveSelection(start, 'up', grid)).toEqual(start)

    const right = moveSelection(start, 'right', grid)
    const extended = moveSelection(right, 'down', grid, { extend: true })
    expect(extended).toEqual({
      anchor: { row: 0, column: 1 },
      focus: { row: 1, column: 1 },
    })
  })

  it('jumps over merged ranges and snaps to a destination anchor', () => {
    const merges: CellRange[] = [
      { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 3 },
      { rowStart: 1, rowEnd: 2, columnStart: 5, columnEnd: 6 },
    ]
    const resolveMergedRange = ({ row, column }: { row: number; column: number }) => (
      merges.find((range) => row >= range.rowStart
        && row <= range.rowEnd
        && column >= range.columnStart
        && column <= range.columnEnd)
    )

    const selected = createSelection({ row: 1, column: 1 })
    expect(moveSelection(selected, 'right', { rowCount: 10, columnCount: 10 }, { resolveMergedRange })).toEqual({
      anchor: { row: 1, column: 4 },
      focus: { row: 1, column: 4 },
    })
    expect(moveSelection(
      createSelection({ row: 1, column: 4 }),
      'right',
      { rowCount: 10, columnCount: 10 },
      { resolveMergedRange },
    )).toEqual({
      anchor: { row: 1, column: 5 },
      focus: { row: 1, column: 5 },
    })
  })
})

describe('TSV utilities', () => {
  it('serializes and parses quoted tabs, quotes, and newlines', () => {
    const values = [
      ['plain', 'with\ttab'],
      ['say "hi"', 'line\nbreak'],
    ]
    const serialized = rangeToTSV(
      { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
      ({ row, column }) => values[row]?.[column],
    )

    expect(serialized).toBe('plain\t"with\ttab"\r\n"say ""hi"""\t"line\nbreak"')
    expect(parseTSV(serialized)).toEqual(values)
  })

  it('serializes a normalized selection and supports a cell limit', () => {
    const selection = {
      anchor: { row: 1, column: 1 },
      focus: { row: 0, column: 0 },
    }
    expect(selectionToTSV(selection, ({ row, column }) => `${row}:${column}`)).toBe(
      '0:0\t0:1\r\n1:0\t1:1',
    )
    expect(() => selectionToTSV(selection, () => '', { maxCells: 3 })).toThrow(RangeError)
  })

  it('preserves quoted empty fields and trailing newline semantics', () => {
    expect(parseTSV('""')).toEqual([['']])
    expect(parseTSV('a\t""')).toEqual([['a', '']])
    expect(parseTSV('""\r\n')).toEqual([['']])
    expect(parseTSV('\r\n')).toEqual([['']])
    expect(parseTSV('a\t')).toEqual([['a', '']])
  })
})
