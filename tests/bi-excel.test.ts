import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import {
  createExcelExport,
  downloadBlob,
  normalizeExcelValue,
} from '../src/bi/excelExport'

describe('Excel export', () => {
  it('creates a zipped workbook with headers, widths and merged cells', async () => {
    const rows = [
      { region: '华东', value: 120 },
      { region: '华南', value: 88 },
    ]
    const artifact = await createExcelExport({
      rows,
      columns: [
        { id: 'region', header: '区域', width: 18, getValue: (row) => row.region },
        { id: 'value', header: '收入', width: 14, getValue: (row) => row.value },
      ],
      merges: [{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 1 }],
      download: false,
    })

    const bytes = new Uint8Array(await artifact.blob.arrayBuffer())
    expect(artifact.rowCount).toBe(2)
    expect(artifact.columnCount).toBe(2)
    expect(artifact.blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(bytes.length).toBeGreaterThan(500)
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK')
  })

  it('serializes non-finite values as text and rejects oversized Excel text', () => {
    expect(normalizeExcelValue(Number.NaN)).toBe('NaN')
    expect(normalizeExcelValue(Number.POSITIVE_INFINITY)).toBe('Infinity')
    expect(normalizeExcelValue(Number.NEGATIVE_INFINITY)).toBe('-Infinity')
    expect(normalizeExcelValue(new Date(Number.NaN))).toBe('Invalid Date')
    expect(normalizeExcelValue('x'.repeat(32_767))).toHaveLength(32_767)
    expect(() => normalizeExcelValue('x'.repeat(32_768))).toThrow(
      'Excel cell text exceeds the 32,767-character limit',
    )
  })

  it('preserves accessor row positions when a row is unavailable', async () => {
    const artifact = await createExcelExport({
      rows: {
        getRowCount: () => 3,
        getRow: (index) => index === 1 ? undefined : { value: `row-${index}` },
      },
      columns: [{ id: 'value', header: 'Value', getValue: (row) => row.value }],
      download: false,
    })
    const files = unzipSync(new Uint8Array(await artifact.blob.arrayBuffer()))
    const sheet = files['xl/worksheets/sheet1.xml']

    expect(sheet).toBeDefined()
    expect(strFromU8(sheet!)).toContain('r="A4"')
    expect(artifact.rowCount).toBe(3)
  })

  it('does not materialize accessor rows when there are no visible columns', async () => {
    const getRow = vi.fn(() => ({ value: 'unused' }))
    const artifact = await createExcelExport({
      rows: {
        getRowCount: () => 100_000,
        getRow,
      },
      columns: [],
      download: false,
    })

    expect(artifact.rowCount).toBe(0)
    expect(artifact.columnCount).toBe(0)
    expect(getRow).not.toHaveBeenCalled()
  })

  it('cleans up the temporary download when the synthetic click throws', () => {
    vi.useFakeTimers()
    const remove = vi.fn()
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        rel: '',
        style: {},
        click: vi.fn(() => { throw new Error('blocked download') }),
        remove,
      })),
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL,
    })

    try {
      expect(() => downloadBlob(new Blob(['value']), 'report.xlsx')).toThrow('blocked download')
      expect(remove).toHaveBeenCalledOnce()
      vi.runAllTimers()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})
