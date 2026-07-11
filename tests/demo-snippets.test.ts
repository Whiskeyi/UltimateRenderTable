import { describe, expect, it } from 'vitest'
import { GALLERY_EXAMPLES } from '../src/demo/galleryExamples'
import { demoSnippets, scenarioSnippetKeys } from '../src/demo/demoSnippets'

describe('demo source viewer snippets', () => {
  it('maps every Studio tab and gallery example to public-package source', () => {
    expect(scenarioSnippetKeys).toEqual({
      capabilities: 'capabilities',
      gallery: 'gallery',
      analysis: 'analysis',
      conditional: 'conditional',
    })
    for (const example of GALLERY_EXAMPLES) {
      expect(demoSnippets[example.sourceKey], example.id).toBeTruthy()
    }
    for (const source of Object.values(demoSnippets)) {
      expect(source).toMatch(/@ultigrid\/(core|insight)/)
      expect(source).not.toMatch(/from ['"]\.\.?\//)
    }
  })
})
