import { describe, expect, it } from 'vitest'
import { createExcelExport } from '../src/bi/excelExport'

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
})
