import { describe, expect, it } from 'vitest'
import {
  getEffectiveFormat,
  summarizeFormats,
} from '../src/demo/spreadsheetFormatting'
import {
  applyCellInput,
  applyFormatPatch,
  applyPaste,
  clearWorksheetRange,
  createCopyPayload,
  planFunctionInsertion,
  toggleMergedRange,
} from '../src/demo/spreadsheetOperations'
import { cellKey } from '../src/demo/spreadsheetModel'
import type { WorksheetSnapshot } from '../src/demo/spreadsheetWorkbook'

const BOUNDS = { rowCount: 20, columnCount: 10 }

function createSheet(
  values: readonly [string, string | number][] = [],
): WorksheetSnapshot {
  return {
    values: new Map(values),
    formats: new Map(),
    mergedCells: [],
    editedValueKeys: new Set(),
  }
}

describe('spreadsheet operations', () => {
  it('applies cell and format changes without inventing no-op history entries', () => {
    const initial = createSheet([[cellKey(1, 1), 42]])
    expect(applyCellInput(initial, { row: 1, column: 1 }, '42')).toBe(initial)

    const edited = applyCellInput(initial, { row: 1, column: 1 }, '=A1')
    expect(edited.values.get(cellKey(1, 1))).toBe('=A1')
    expect(initial.values.get(cellKey(1, 1))).toBe(42)

    const range = { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 2 }
    const formatted = applyFormatPatch(edited, range, { bold: true })
    expect(formatted.formats.get(cellKey(1, 1))).toEqual({ bold: true })
    expect(applyFormatPatch(formatted, range, { bold: true })).toBe(formatted)

    const cleared = clearWorksheetRange(formatted, range, 'all')
    expect(cleared.values.has(cellKey(1, 1))).toBe(false)
    expect(cleared.formats.has(cellKey(1, 1))).toBe(false)
  })

  it('creates a structured copy payload and translates copied formulas on paste', () => {
    const source = createSheet([
      [cellKey(0, 0), 10],
      [cellKey(0, 1), '=A1'],
    ])
    source.formats.set(cellKey(0, 0), { numberFormat: 'number', bold: true })
    const range = { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 1 }
    const payload = createCopyPayload(source, range, 'en-US', BOUNDS)

    expect(payload.text).toBe('10.00\t10')
    expect(payload.values).toEqual([[10, '=A1']])
    expect(payload.formats).toEqual([[{ numberFormat: 'number', bold: true }, undefined]])

    const result = applyPaste(source, {
      values: payload.values,
      formats: payload.formats,
      target: { row: 2, column: 2 },
      copySource: payload.source,
      bounds: BOUNDS,
      maxCells: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.values.get(cellKey(2, 2))).toBe(10)
    expect(result.snapshot.values.get(cellKey(2, 3))).toBe('=C3')
    expect(result.snapshot.formats.get(cellKey(2, 2))).toEqual({
      numberFormat: 'number',
      bold: true,
    })
  })

  it('rejects unsafe paste shapes and moves a complete cut merge atomically', () => {
    const source = createSheet([
      [cellKey(1, 1), 'owner'],
      [cellKey(1, 2), 'discarded'],
    ])
    source.mergedCells = [{ rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 2 }]

    expect(applyPaste(source, {
      values: [['a', 'b']],
      target: { row: 19, column: 9 },
      bounds: BOUNDS,
      maxCells: 100,
    })).toMatchObject({ ok: false, reason: 'out-of-bounds' })

    const moved = applyPaste(source, {
      values: [['owner', '']],
      target: { row: 4, column: 3 },
      cutSourceRange: { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 2 },
      bounds: BOUNDS,
      maxCells: 100,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.snapshot.values.has(cellKey(1, 1))).toBe(false)
    expect(moved.snapshot.values.get(cellKey(4, 3))).toBe('owner')
    expect(moved.snapshot.mergedCells).toEqual([
      { rowStart: 4, rowEnd: 4, columnStart: 3, columnEnd: 4 },
    ])
  })

  it('returns explicit decisions for merging and formula insertion', () => {
    const source = createSheet([
      [cellKey(1, 0), 10],
      [cellKey(2, 0), 20],
      [cellKey(2, 1), 'will be discarded'],
    ])
    const range = { rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 1 }
    expect(toggleMergedRange(source, range)).toEqual({
      status: 'confirmation-required',
      discardedValues: 2,
    })

    const merged = toggleMergedRange(source, range, { allowDiscard: true })
    expect(merged.status).toBe('changed')
    if (merged.status !== 'changed') return
    expect(merged.mode).toBe('merged')
    expect(merged.snapshot.values.get(cellKey(1, 0))).toBe(10)
    expect(merged.snapshot.values.has(cellKey(2, 0))).toBe(false)
    expect(toggleMergedRange(merged.snapshot, range)).toMatchObject({
      status: 'changed',
      mode: 'unmerged',
    })

    expect(planFunctionInsertion(
      source,
      { rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 0 },
      { row: 1, column: 0 },
      'SUM',
      BOUNDS,
    )).toEqual({
      target: { row: 3, column: 0 },
      formula: '=SUM(A2:A3)',
    })
  })
})

describe('spreadsheet formatting', () => {
  it('resolves defaults and reports mixed selected formats', () => {
    const sheet = createSheet()
    sheet.formats.set(cellKey(2, 3), { bold: true })
    const summary = summarizeFormats(
      { rowStart: 2, rowEnd: 2, columnStart: 3, columnEnd: 4 },
      { row: 2, column: 3 },
      sheet.formats,
    )

    expect(summary.format.bold).toBe(true)
    expect(summary.mixed.has('bold')).toBe(true)
    expect(getEffectiveFormat(2, 3).numberFormat).toBe('currency')
  })
})
