import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkbookHistory,
  deserializeWorkbookHistory,
  workbookReducer,
  type WorksheetSnapshot,
} from '../src/demo/spreadsheetWorkbook'
import { cellKey } from '../src/demo/spreadsheetModel'
import type { Locale } from '../src/i18n'

function seed(_locale: Locale): WorksheetSnapshot {
  return {
    values: new Map([[cellKey(0, 0), 'seed']]),
    formats: new Map(),
    mergedCells: [],
    editedValueKeys: new Set(),
  }
}

describe('spreadsheet workbook persistence adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('stores a compact reload snapshot while preserving full history in memory', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      setTimeout,
      clearTimeout,
    })
    const {
      initializeWorkbookHistory,
      persistWorkbookHistory,
    } = await import('../src/demo/spreadsheetWorkbookPersistence')
    const initial = createWorkbookHistory('zh-CN', seed)
    const values = new Map(initial.present.values)
    values.set(cellKey(1, 1), 42)
    const committed = workbookReducer(initial, {
      type: 'commit',
      snapshot: { ...initial.present, values },
    })

    persistWorkbookHistory(committed, { immediate: true })

    const serialized = storage.get('ultigrid.spreadsheet-workbook.v1')
    expect(serialized).toBeDefined()
    const restoredFromStorage = deserializeWorkbookHistory(serialized!)
    expect(restoredFromStorage?.past).toEqual([])
    expect(restoredFromStorage?.future).toEqual([])
    expect(restoredFromStorage?.present.values.get(cellKey(1, 1))).toBe(42)

    const restoredFromMemory = initializeWorkbookHistory('zh-CN', seed)
    expect(restoredFromMemory.past).toHaveLength(1)
    expect(restoredFromMemory.present.values.get(cellKey(1, 1))).toBe(42)
  })
})
