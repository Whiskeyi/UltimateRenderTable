import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { App } from '../src/App'
import { UltiGridViewport } from '../src/core'
import { I18nProvider } from '../src/i18n'

describe('theme and repository links', () => {
  it('applies a public Core theme color to the grid token', () => {
    const markup = renderToStaticMarkup(
      <UltiGridViewport
        rowCount={1}
        columnCount={1}
        getCell={() => 'value'}
        themeColor="#c2410c"
      />,
    )

    expect(markup).toContain('--ultigrid-theme-color:#c2410c')
  })

  it('exposes the Studio theme control and opens the repository on GitHub', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <App />
      </I18nProvider>,
    )

    expect(markup).toContain('--studio-accent:#198754')
    expect(markup).toContain('--ultigrid-theme-color:#198754')
    expect(markup).toContain('type="color"')
    expect(markup).toContain('href="https://github.com/Whiskeyi/UltimateRenderTable"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('aria-label="查看源码"')
    expect(markup).toContain('title="查看源码"')
    expect(markup).not.toContain('<span>GitHub</span>')
  })
})
