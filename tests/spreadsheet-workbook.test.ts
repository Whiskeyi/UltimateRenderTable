import { describe, expect, it } from 'vitest'
import {
  createWorkbookHistory,
  deserializeWorkbookHistory,
  localizeWorkbookHistory,
  serializeWorkbookHistory,
  workbookReducer,
  type WorksheetSnapshot,
} from '../src/demo/spreadsheetWorkbook'
import { cellKey } from '../src/demo/spreadsheetModel'
import type { Locale } from '../src/i18n'

function seed(locale: Locale): WorksheetSnapshot {
  return {
    values: new Map([
      [cellKey(0, 0), locale === 'zh-CN' ? '标题' : 'Title'],
      [cellKey(1, 0), locale === 'zh-CN' ? '区域' : 'Region'],
    ]),
    formats: new Map([[cellKey(0, 0), { bold: true }]]),
    mergedCells: [{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 1 }],
    editedValueKeys: new Set(),
  }
}

describe('spreadsheet workbook history', () => {
  it('round-trips maps, sets, merge ranges, and undo history', () => {
    const initial = createWorkbookHistory('zh-CN', seed)
    const values = new Map(initial.present.values)
    values.set(cellKey(2, 2), '=A1')
    const committed = workbookReducer(initial, {
      type: 'commit',
      snapshot: { ...initial.present, values },
    })
    const restored = deserializeWorkbookHistory(serializeWorkbookHistory(committed))

    expect(restored?.dirty).toBe(true)
    expect(restored?.past).toHaveLength(1)
    expect(restored?.present.values.get(cellKey(2, 2))).toBe('=A1')
    expect(restored?.present.editedValueKeys.has(cellKey(2, 2))).toBe(true)
    expect(restored?.present.formats.get(cellKey(0, 0))).toEqual({ bold: true })
  })

  it('localizes untouched seed values without overwriting user edits or history', () => {
    const initial = createWorkbookHistory('zh-CN', seed)
    const values = new Map(initial.present.values)
    values.set(cellKey(1, 0), '自定义区域')
    const committed = workbookReducer(initial, {
      type: 'commit',
      snapshot: { ...initial.present, values },
    })
    const localized = localizeWorkbookHistory(committed, 'en-US', seed)

    expect(localized.present.values.get(cellKey(0, 0))).toBe('Title')
    expect(localized.present.values.get(cellKey(1, 0))).toBe('自定义区域')
    expect(localized.past[0]?.values.get(cellKey(0, 0))).toBe('Title')
    expect(localized.past[0]?.values.get(cellKey(1, 0))).toBe('Region')
    expect(localized.dirty).toBe(true)
  })

  it('keeps reset undoable while clearing seed edit markers', () => {
    const initial = createWorkbookHistory('zh-CN', seed)
    const values = new Map(initial.present.values)
    values.set(cellKey(0, 0), '自定义标题')
    const edited = workbookReducer(initial, {
      type: 'commit',
      snapshot: { ...initial.present, values },
    })
    const reset = workbookReducer(edited, {
      type: 'commit',
      snapshot: seed('zh-CN'),
      trackValueChanges: false,
    })
    const undone = workbookReducer(reset, { type: 'undo' })

    expect(reset.present.editedValueKeys.size).toBe(0)
    expect(undone.present.values.get(cellKey(0, 0))).toBe('自定义标题')
  })
})
