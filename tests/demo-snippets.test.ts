import { describe, expect, it } from 'vitest'
import { GALLERY_EXAMPLES } from '../src/demo/galleryExamples'
import { demoSnippets, scenarioSnippetKeys } from '../src/demo/demoSnippets'

describe('demo source viewer snippets', () => {
  it('maps every Studio tab and gallery example to public-package source', () => {
    expect(scenarioSnippetKeys).toEqual({
      gallery: 'gallery',
      analysis: 'analysis',
      conditional: 'conditional',
    })
    expect(Object.keys(demoSnippets)).toHaveLength(14)
    expect(GALLERY_EXAMPLES).toHaveLength(11)
    expect(GALLERY_EXAMPLES.filter(({ level }) => level === 'basic').map(({ id }) => id)).toEqual([
      'virtualization',
      'frozen',
      'sizing',
      'selection',
      'renderer',
    ])
    expect(GALLERY_EXAMPLES.filter(({ level }) => level === 'advanced').map(({ id }) => id)).toEqual([
      'merging',
      'tree',
      'conditional',
      'lazy',
      'api',
      'export',
    ])
    expect(new Set(GALLERY_EXAMPLES.map(({ id }) => id)).size).toBe(11)
    expect(new Set(GALLERY_EXAMPLES.map(({ sourceKey }) => sourceKey)).size).toBe(11)
    for (const example of GALLERY_EXAMPLES) {
      expect(demoSnippets[example.sourceKey], example.id).toBeTruthy()
    }
    for (const source of Object.values(demoSnippets)) {
      expect(source).toMatch(/@ultigrid\/(core|insight)/)
      expect(source).not.toMatch(/from ['"]\.\.?\//)
    }
  })

  it('includes the three advanced public API snippets', () => {
    expect(demoSnippets.lazyData).toMatch(/rowSource=\{rowSource\}[\s\S]*columnCount=\{10_000\}[\s\S]*getColumn=\{getColumn\}/)
    expect(demoSnippets.imperativeApi).toMatch(/UltiGridViewportApi[\s\S]*scrollToCell[\s\S]*setSelection/)
    expect(demoSnippets.exporting).toMatch(/exportExcel[\s\S]*exportCsv[\s\S]*exportImage/)
  })
})
