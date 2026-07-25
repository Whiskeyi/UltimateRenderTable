import { describe, expect, it, vi } from 'vitest'
import {
  createCsvText,
  ensureCsvFileName,
  serializeCsvValue,
} from '../src/bi/csvExport'

describe('CSV export', () => {
  it('neutralizes spreadsheet formulas without changing numeric negatives', () => {
    expect(serializeCsvValue('=1+1')).toBe("'=1+1")
    expect(serializeCsvValue('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)")
    expect(serializeCsvValue('-42')).toBe("'-42")
    expect(serializeCsvValue('  @command')).toBe("'  @command")
    expect(serializeCsvValue(-42)).toBe('-42')
    expect(serializeCsvValue('safe, "quoted"')).toBe('"safe, ""quoted"""')
  })

  it('serializes dates deterministically across runtimes', () => {
    expect(serializeCsvValue(new Date('2025-03-08T09:10:11.000Z')))
      .toBe('2025-03-08T09:10:11.000Z')
    expect(serializeCsvValue(new Date(Number.NaN))).toBe('Invalid Date')
  })

  it('materializes each wide lazy column once and preserves missing row positions', () => {
    const columnCount = 2_049
    const getColumn = vi.fn((index: number) => index)
    const csv = createCsvText<{ prefix: string }, number>({
      rowStart: 0,
      rowCount: 3,
      columnStart: 0,
      columnCount,
      getRow: (index) => index === 1 ? undefined : { prefix: `R${index}` },
      getColumn,
      getColumnHeader: (column) => column === 0 ? '=unsafe header' : `C${column}`,
      getCellValue: (column, row) => `${row.prefix}:${column}`,
    })
    const lines = csv.slice(1).split('\r\n')

    expect(getColumn).toHaveBeenCalledTimes(columnCount)
    expect(lines).toHaveLength(4)
    expect(lines[0]?.startsWith("'=unsafe header,C1")).toBe(true)
    expect(lines[1]?.startsWith('R0:0,R0:1')).toBe(true)
    expect(lines[2]).toBe(new Array<string>(columnCount).fill('').join(','))
    expect(lines[3]?.endsWith(`R2:${columnCount - 1}`)).toBe(true)
  })

  it('returns a minimal file without reading rows when there are no columns', () => {
    const getRow = vi.fn(() => ({ value: 'unused' }))
    const getColumn = vi.fn(() => 'unused')
    const csv = createCsvText({
      rowStart: 0,
      rowCount: 100_000,
      columnStart: 0,
      columnCount: 0,
      getRow,
      getColumn,
      getColumnHeader: () => 'unused',
      getCellValue: () => 'unused',
    })

    expect(csv).toBe('\ufeff')
    expect(getRow).not.toHaveBeenCalled()
    expect(getColumn).not.toHaveBeenCalled()
  })

  it('adds the CSV extension only when it is missing', () => {
    expect(ensureCsvFileName('report')).toBe('report.csv')
    expect(ensureCsvFileName('report.CSV')).toBe('report.CSV')
  })
})
