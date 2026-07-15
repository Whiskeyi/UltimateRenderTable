import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { Studio } from '../src/studio'
import { STUDIO_COMPACT_LAYOUT_QUERY } from '../src/studio/layoutMode'

describe('Studio mobile shell', () => {
  it('exposes an accessible bottom-sheet trigger and drag handle', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <Studio />
      </I18nProvider>,
    )

    const trigger = markup.match(/class="studio-mobile-inspector-trigger"[^>]*aria-controls="([^"]+)"/)
    expect(trigger?.[1]).toBeTruthy()
    expect(trigger?.[0]).toContain('aria-expanded="false"')
    expect(markup).toContain(`id="${trigger?.[1]}"`)
    expect(markup.indexOf('class="studio-mobile-inspector-trigger"')).toBeGreaterThan(
      markup.indexOf('class="studio-stage-controls"'),
    )
    expect(markup.indexOf('class="studio-mobile-inspector-trigger"')).toBeLessThan(
      markup.indexOf('data-testid="studio-diagnostics-trigger"'),
    )
    expect(markup).toContain('class="studio-sheet-grabber"')
    expect(markup).toContain('aria-label="关闭参数面板"')
    expect(markup).toContain('class="studio-inspector-mobile-reset"')
    expect(markup).toContain('class="studio-mobile-scale-picker"')
    expect(markup).toContain('data-virtual-keyboard="closed"')
  })

  it('keeps phone, coarse-pointer tablet, and short landscape modes aligned', () => {
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain('(max-width: 760px)')
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (pointer: coarse)',
    )
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (any-pointer: coarse)',
    )
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (max-height: 600px) and (orientation: landscape)',
    )
  })

  it('removes Props Lab from the spreadsheet scenario', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <Studio defaultValue={{ scenario: 'spreadsheet' }} />
      </I18nProvider>,
    )

    expect(markup).toContain('UltiGrid Sheets')
    expect(markup).toContain('销售计划.xlsx')
    expect(markup).not.toContain('Props Lab')
    expect(markup).not.toContain('data-testid="studio-inspector"')
  })
})
