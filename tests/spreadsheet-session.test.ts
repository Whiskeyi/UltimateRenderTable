import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasDirtySpreadsheetSession,
  setSpreadsheetSessionDirty,
} from '../src/demo/spreadsheetSession'

describe('spreadsheet session dirty marker', () => {
  afterEach(() => {
    setSpreadsheetSessionDirty(false)
    vi.unstubAllGlobals()
  })

  it('survives component unmount through a compact session marker', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })

    setSpreadsheetSessionDirty(true)
    expect(hasDirtySpreadsheetSession()).toBe(true)

    setSpreadsheetSessionDirty(false)
    expect(hasDirtySpreadsheetSession()).toBe(false)
  })
})
