import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComponentGallery } from '../src/demo/ComponentGallery'
import { RepositoryIntro } from '../src/demo/RepositoryIntro'
import { GALLERY_EXAMPLES } from '../src/demo/galleryExamples'
import { I18nProvider } from '../src/i18n'

describe('ComponentGallery', () => {
  it('pairs every interactive example with its actual editable implementation', () => {
    expect(new Set(GALLERY_EXAMPLES.map(({ id }) => id)).size).toBe(GALLERY_EXAMPLES.length)
    expect(new Set(GALLERY_EXAMPLES.map(({ source }) => source)).size).toBe(GALLERY_EXAMPLES.length)
    for (const example of GALLERY_EXAMPLES) {
      expect(typeof example.component, example.id).toBe('function')
      expect(example.source, example.id).toMatch(/export default function \w+Example/)
      expect(example.source, example.id).toContain(`from '${example.packageName}'`)
    }
  })

  it('renders an in-place source editor trigger without extra gallery rows', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <ComponentGallery />
      </I18nProvider>,
    )

    expect(markup).toContain('data-testid="gallery-editor-toggle-virtualization"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('编辑源码')
    expect(markup).not.toContain('GitHub 源码')
    expect(markup).not.toContain('component-gallery__overview')
    expect(markup).not.toContain('component-gallery__hint')
    expect(markup).not.toContain('Studio + 应用层表格 + 表格渲染底座')
  })

  it('renders architecture and capability summaries in the standalone overview', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RepositoryIntro />
      </I18nProvider>,
    )

    expect(markup).toContain('Studio + 应用层表格 + 表格渲染底座')
    expect(markup).toContain('@ultigrid/insight')
    expect(markup).toContain('@ultigrid/core')
    expect(markup).toContain(`<dd>${GALLERY_EXAMPLES.length}</dd>`)
    expect(markup).toContain('拖选、越界滚动与 Shift 扩选')
    expect(markup).toContain('aria-pressed="false">进阶能力</button>')
  })
})
