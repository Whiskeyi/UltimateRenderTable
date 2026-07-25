import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { Studio } from '../src/studio'
import { DEFAULT_STUDIO_CONFIG } from '../src/studio/types'

describe('Studio everyday performance defaults', () => {
  it('keeps bounded table defaults while opening on the introduction', () => {
    expect(DEFAULT_STUDIO_CONFIG).toMatchObject({
      scenario: 'intro',
      rowCount: 1_000,
      columnCount: 40,
      overscanRows: 2,
      overscanColumns: 1,
      autoRowHeight: false,
    })

    const markup = renderToStaticMarkup(
      <I18nProvider>
        <Studio />
      </I18nProvider>,
    )
    expect(markup).toContain('data-scenario="intro" class="is-active" aria-pressed="true"')

    const tableMarkup = renderToStaticMarkup(
      <I18nProvider>
        <Studio defaultValue={{ scenario: 'analysis' }} />
      </I18nProvider>,
    )
    expect(tableMarkup).toContain(
      '<option value="everyday" selected="">日常数据 · 1K × 40</option>',
    )
  })
})
