import { describe, expect, it } from 'vitest'
import {
  readStudioScenario,
  writeStudioScenario,
} from '../src/studio/urlState'

describe('Studio URL state', () => {
  it('reads only supported scenarios', () => {
    expect(readStudioScenario('?scenario=spreadsheet')).toBe('spreadsheet')
    expect(readStudioScenario('?scenario=unknown')).toBeUndefined()
    expect(readStudioScenario('')).toBeUndefined()
  })

  it('preserves unrelated parameters and omits the default scenario', () => {
    expect(writeStudioScenario('?theme=dark', 'analysis')).toBe('?theme=dark&scenario=analysis')
    expect(writeStudioScenario('?theme=dark&scenario=analysis', 'intro')).toBe('?theme=dark')
    expect(writeStudioScenario('?scenario=gallery', 'intro')).toBe('')
  })
})
