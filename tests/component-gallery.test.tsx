import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComponentGallery } from '../src/demo/ComponentGallery'
import { RepositoryIntro } from '../src/demo/RepositoryIntro'
import { GALLERY_EXAMPLES } from '../src/demo/galleryExamples'
import { GALLERY_EXAMPLE_COUNT } from '../src/demo/galleryExampleTypes'
import { I18nProvider } from '../src/i18n'

describe('ComponentGallery', () => {
  it('pairs every interactive example with its actual editable implementation', () => {
    expect(GALLERY_EXAMPLES).toHaveLength(GALLERY_EXAMPLE_COUNT)
    expect(new Set(GALLERY_EXAMPLES.map(({ id }) => id)).size).toBe(GALLERY_EXAMPLES.length)
    expect(new Set(GALLERY_EXAMPLES.map(({ source }) => source)).size).toBe(GALLERY_EXAMPLES.length)
    for (const example of GALLERY_EXAMPLES) {
      expect(typeof example.component, example.id).toBe('function')
      expect(example.source, example.id).toMatch(/export default function \w+Example/)
      expect(example.source, example.id).toContain(`from '${example.packageName}'`)
    }
  })

  it('ships three production-shaped cases before the isolated capability examples', () => {
    const productionExamples = GALLERY_EXAMPLES.filter(({ level }) => level === 'production')

    expect(productionExamples.map(({ id }) => id)).toEqual(['orders', 'budget', 'mobile'])
    expect(productionExamples.every(({ source }) => source.includes("height: '100%'"))).toBe(true)
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('LazyRowSource')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('const ROW_COUNT = 12_480')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('showRowNumbers={!compact}')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('onCellClick={handleCellClick}')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('onCopy={handleCopy}')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('copyCellLimit={ROW_COUNT * columns.length}')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('getOrderWorkflowIndexes')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'orders')?.source).toContain('aria-pressed={attentionOnly}')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'budget')?.source).toContain('LazyRowSource')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'budget')?.source).toContain('const ROW_COUNT = 12_000')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'budget')?.source).toContain('left: compact ? 1 : 2')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'budget')?.source).toContain('getOverBudgetRowIndexes')
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'budget')?.source).toContain("exportCsv('budget-overrun-review.csv'")
    expect(GALLERY_EXAMPLES.find(({ id }) => id === 'mobile')?.source).toContain('const ROW_COUNT = 120')
  })

  it('renders an in-place source editor trigger without extra gallery rows', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <ComponentGallery />
      </I18nProvider>,
    )

    expect(markup).toContain('data-testid="gallery-editor-toggle-orders"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('生产用例')
    expect(markup).toContain('订单履约中心')
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
    expect(markup).toContain(`<dd>${GALLERY_EXAMPLE_COUNT}</dd>`)
    expect(markup).toContain('拖选、越界滚动与 Shift 扩选')
    expect(markup).toContain('aria-pressed="false">进阶能力</button>')
    expect(markup).toContain('快速接入')
    expect(markup).toContain('生产用例')
    expect(markup).toContain('包文档')
    expect(markup).toContain('href="https://www.npmjs.com/package/@ultigrid/insight"')
    expect(markup).toContain('href="https://unpkg.com/@ultigrid/core/README.md"')
  })
})
