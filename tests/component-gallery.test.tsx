import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComponentGallery, GALLERY_SOURCE_URLS } from '../src/demo/ComponentGallery'
import { RepositoryIntro } from '../src/demo/RepositoryIntro'
import { GALLERY_EXAMPLES, type GalleryExampleId } from '../src/demo/galleryExamples'
import galleryExampleSource from '../src/demo/galleryExamples.tsx?raw'
import { I18nProvider } from '../src/i18n'

const EXAMPLE_FUNCTIONS = {
  virtualization: 'VirtualizationExample',
  frozen: 'FrozenExample',
  sizing: 'SizingExample',
  selection: 'SelectionExample',
  renderer: 'RendererExample',
  merging: 'MergingExample',
  tree: 'TreeExample',
  conditional: 'ConditionalExample',
  lazy: 'LazyDataExample',
  api: 'ImperativeApiExample',
  export: 'ExportExample',
} as const satisfies Record<GalleryExampleId, string>

describe('ComponentGallery', () => {
  it('maps every interactive example to its GitHub implementation', () => {
    expect(Object.keys(GALLERY_SOURCE_URLS)).toEqual(GALLERY_EXAMPLES.map(({ id }) => id))
    expect(new Set(Object.values(GALLERY_SOURCE_URLS)).size).toBe(GALLERY_EXAMPLES.length)
    for (const url of Object.values(GALLERY_SOURCE_URLS)) {
      expect(url).toMatch(/^https:\/\/github\.com\/Whiskeyi\/UltimateRenderTable\/blob\/main\/src\/demo\/galleryExamples\.tsx#L\d+$/)
    }

    const sourceLines = galleryExampleSource.split(/\r?\n/)
    for (const [id, functionName] of Object.entries(EXAMPLE_FUNCTIONS)) {
      const line = Number(GALLERY_SOURCE_URLS[id as GalleryExampleId].match(/#L(\d+)$/)?.[1])
      expect(sourceLines[line - 1], id).toContain(`function ${functionName}`)
    }
  })

  it('renders a new-tab GitHub source link without an overview row above the grid', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <ComponentGallery />
      </I18nProvider>,
    )

    expect(markup).toContain(`href="${GALLERY_SOURCE_URLS.virtualization}"`)
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).not.toContain('component-gallery__overview')
    expect(markup).not.toContain('一个 Studio，两层公开 npm 包')
  })

  it('renders architecture and capability summaries in the standalone overview', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RepositoryIntro />
      </I18nProvider>,
    )

    expect(markup).toContain('一个 Studio，两层公开 npm 包')
    expect(markup).toContain('@ultigrid/insight')
    expect(markup).toContain('@ultigrid/core')
    expect(markup).toContain(`<dd>${GALLERY_EXAMPLES.length}</dd>`)
    expect(markup).toContain('拖选、越界滚动与 Shift 扩选')
    expect(markup).toContain('任意深度异步树')
  })
})
