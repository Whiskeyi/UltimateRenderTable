import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderElementAsync } from 'react-live'
import { describe, expect, it } from 'vitest'
import type { Translate } from '../src/i18n'
import { GALLERY_EXAMPLES } from '../src/demo/galleryExamples'
import {
  createLiveScope,
  prepareLiveSource,
  resolveLiveModule,
} from '../src/demo/live/liveRuntime'

const t: Translate = (key) => key

function compileSource(source: string): Promise<ComponentType> {
  return new Promise((resolve, reject) => {
    renderElementAsync(
      {
        code: prepareLiveSource(source),
        scope: createLiveScope('en-US', t),
        enableTypeScript: false,
      },
      resolve,
      reject,
    )
  })
}

describe('gallery live runtime', () => {
  it('limits editable imports to the playground module allowlist', () => {
    expect(resolveLiveModule('react')).toHaveProperty('useState')
    expect(resolveLiveModule('@ultigrid/core')).toHaveProperty('UltiGridViewport')
    expect(() => resolveLiveModule('unknown-package')).toThrow('not available in this playground')
  })

  it('transpiles TypeScript source and renders its default React export', async () => {
    const source = `
import { useMemo } from 'react'

export default function LiveExample() {
  const label: string = useMemo(() => 'live source', [])
  return <span>{label}</span>
}
    `.trim()

    const Rendered = await compileSource(source)

    expect(renderToStaticMarkup(createElement(Rendered))).toContain('live source')
  })

  it.each(GALLERY_EXAMPLES)('compiles the real $id Demo source', async ({ source }) => {
    const Rendered = await compileSource(source)

    expect(typeof Rendered).toBe('function')
  })

  it('renders an edited Demo source instead of the registry component', async () => {
    const source = GALLERY_EXAMPLES.find(({ id }) => id === 'virtualization')!.source
    const editedSource = source.replace(
      "ariaLabel={t('gallery.virtualization.title')}",
      'ariaLabel="EDITED LIVE GRID"',
    )
    const Rendered = await compileSource(editedSource)

    expect(renderToStaticMarkup(createElement(Rendered))).toContain('aria-label="EDITED LIVE GRID"')
  })

  it('renders the mobile device Demo with every playground icon resolved', async () => {
    const source = GALLERY_EXAMPLES.find(({ id }) => id === 'mobile')!.source
    const Rendered = await compileSource(source)
    const markup = renderToStaticMarkup(createElement(Rendered))

    expect(markup).toContain('component-gallery__mobile-device')
    expect(markup).toContain('375 × 750')
  })
})
