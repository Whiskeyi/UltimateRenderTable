import { describe, expect, it } from 'vitest'
import {
  calculateSelectionStats,
  cellKey,
  columnName,
  createSpreadsheetEvaluator,
  parseCellInput,
  parseClipboardMatrix,
  parseSelectionLabel,
  selectionLabel,
} from '../src/demo/spreadsheetModel'

describe('spreadsheet model', () => {
  it('converts between cell addresses and normalized selections', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    expect(parseSelectionLabel('D8:B3', 200, 52)).toEqual({
      rowStart: 2,
      rowEnd: 7,
      columnStart: 1,
      columnEnd: 3,
    })
    expect(selectionLabel(parseSelectionLabel('$C$4', 200, 26))).toBe('C4')
    expect(parseSelectionLabel('ZZ999', 200, 26)).toBeNull()
  })

  it('parses typed and pasted cell values without losing formulas', () => {
    expect(parseCellInput('42.5')).toBe(42.5)
    expect(parseCellInput('=SUM(A1:A3)')).toBe('=SUM(A1:A3)')
    expect(parseCellInput('  text  ')).toBe('  text  ')
    expect(parseClipboardMatrix('1\t=2+3\r\nhello\t4')).toEqual([
      [1, '=2+3'],
      ['hello', 4],
    ])
    expect(parseClipboardMatrix('"North\tEnterprise"\t"line 1\nline 2"')).toEqual([
      ['North\tEnterprise', 'line 1\nline 2'],
    ])
  })

  it('evaluates arithmetic, references, ranges, functions, and cycles', () => {
    const values = new Map<string, string | number>([
      [cellKey(0, 0), 10],
      [cellKey(1, 0), 20],
      [cellKey(2, 0), '=SUM(A1:A2)'],
      [cellKey(0, 1), '=A3/2+5'],
      [cellKey(1, 1), '=AVERAGE(A1:A3)'],
      [cellKey(2, 1), '=MAX(A1:A3)-MIN(A1:A3)'],
      [cellKey(3, 0), '=B4'],
      [cellKey(3, 1), '=A4'],
      [cellKey(4, 0), '=1/0'],
    ])
    const evaluator = createSpreadsheetEvaluator(values)

    expect(evaluator.getValue(2, 0)).toBe(30)
    expect(evaluator.getValue(0, 1)).toBe(20)
    expect(evaluator.getValue(1, 1)).toBe(20)
    expect(evaluator.getValue(2, 1)).toBe(20)
    expect(evaluator.getValue(3, 0)).toBe('#CYCLE!')
    expect(evaluator.getValue(4, 0)).toBe('#DIV/0!')
  })

  it('guards invalid and oversized formula ranges', () => {
    const values = new Map<string, string | number>([
      [cellKey(0, 0), '=SUM(A2:A20)'],
      [cellKey(0, 1), '=Z1'],
      [cellKey(0, 2), '=SUM(A2:A8)'],
    ])
    const evaluator = createSpreadsheetEvaluator(values, {
      rowCount: 10,
      columnCount: 4,
      maxFormulaCells: 5,
    })

    expect(evaluator.getValue(0, 0)).toBe('#REF!')
    expect(evaluator.getValue(0, 1)).toBe('#REF!')
    expect(evaluator.getValue(0, 2)).toBe('#NUM!')
  })

  it('treats text references consistently in scalar and range function arguments', () => {
    const values = new Map<string, string | number>([
      [cellKey(0, 0), 'text'],
      [cellKey(0, 1), '=COUNT(A1)'],
      [cellKey(1, 1), '=COUNT(A1:A1)'],
      [cellKey(0, 2), '=AVERAGE(A1)'],
      [cellKey(1, 2), '=AVERAGE(A1:A1)'],
    ])
    const evaluator = createSpreadsheetEvaluator(values)

    expect(evaluator.getValue(0, 1)).toBe(0)
    expect(evaluator.getValue(1, 1)).toBe(0)
    expect(evaluator.getValue(0, 2)).toBe('#DIV/0!')
    expect(evaluator.getValue(1, 2)).toBe('#DIV/0!')
  })

  it('summarizes the selected computed values', () => {
    const values = new Map<string, string | number>([
      [cellKey(0, 0), 10],
      [cellKey(0, 1), 20],
      [cellKey(1, 0), '=A1+B1'],
      [cellKey(1, 1), 'text'],
    ])
    const evaluator = createSpreadsheetEvaluator(values)

    expect(calculateSelectionStats({
      rowStart: 0,
      rowEnd: 1,
      columnStart: 0,
      columnEnd: 1,
    }, evaluator.getValue)).toEqual({
      count: 4,
      numericCount: 3,
      sum: 60,
      average: 20,
    })
  })
})
