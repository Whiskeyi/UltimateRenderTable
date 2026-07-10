import { describe, expect, it } from 'vitest'
import { demoSnippets } from '../src/demo/demoSnippets'

describe('demo source viewer snippets', () => {
  it('covers every Studio tab with public package imports only', () => {
    expect(Object.keys(demoSnippets)).toEqual([
      'capabilities',
      'analysis',
      'tree',
      'conditional',
      'merged',
    ])
    for (const source of Object.values(demoSnippets)) {
      expect(source).toMatch(/@ultigrid\/(core|insight)/)
      expect(source).not.toMatch(/from ['"]\.\.?\//)
    }
  })
})
