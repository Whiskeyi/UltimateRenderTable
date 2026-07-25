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

  it('reports progress and supports cancellation between row batches', async () => {
    const controller = new AbortController()
    const progress = vi.fn((event: { completedRows: number }) => {
      if (event.completedRows === 2) controller.abort()
    })

    await expect(createExcelExport({
      rows: Array.from({ length: 8 }, (_, value) => ({ value })),
      columns: [{ id: 'value', header: 'Value', getValue: (row) => row.value }],
      signal: controller.signal,
      onProgress: progress,
      yieldEveryRows: 2,
      download: false,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(progress).toHaveBeenNthCalledWith(1, {
      phase: 'materializing',
      completedRows: 0,
      totalRows: 8,
    })
    expect(progress).toHaveBeenNthCalledWith(2, {
      phase: 'materializing',
      completedRows: 2,
      totalRows: 8,
    })
  })

  it('keeps cancellation checkpoints when accessor rows are unavailable', async () => {
    const controller = new AbortController()
    const progress = vi.fn((event: { completedRows: number }) => {
      if (event.completedRows === 2) controller.abort()
    })

    await expect(createExcelExport({
      rows: {
        getRowCount: () => 8,
        getRow: () => undefined,
      },
      columns: [{ id: 'value', header: 'Value', getValue: () => 'unused' }],
      signal: controller.signal,
      onProgress: progress,
      yieldEveryRows: 2,
      download: false,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(progress).toHaveBeenCalledWith({
      phase: 'materializing',
      completedRows: 2,
      totalRows: 8,
    })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid yieldEveryRows value (%s)',
    async (yieldEveryRows) => {
      await expect(createExcelExport({
        rows: [{ id: 1 }],
        columns: [{ id: 'id', header: 'ID', getValue: (row) => row.id }],
        yieldEveryRows,
        download: false,
      })).rejects.toThrow('yieldEveryRows must be a positive safe integer')
    },
  )

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
