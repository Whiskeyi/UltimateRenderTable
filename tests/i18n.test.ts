import { describe, expect, it } from 'vitest'
import { translate } from '../src/i18n'

describe('translate', () => {
  it('returns Chinese and English messages from the selected locale', () => {
    expect(translate('zh-CN', 'scenario.merged')).toBe('合并画布')
    expect(translate('en-US', 'scenario.merged')).toBe('Merged canvas')
  })

  it('interpolates every supplied placeholder', () => {
    const params = { key: 'rowCount', min: 1, max: 100_000 }

    expect(translate('zh-CN', 'error.range', params)).toBe('rowCount 必须在 1 – 100000 之间')
    expect(translate('en-US', 'error.range', params)).toBe('rowCount must be between 1 and 100000')
  })
})
