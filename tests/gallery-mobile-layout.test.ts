// @ts-expect-error Vitest runs in Node; the browser package intentionally omits Node typings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STUDIO_COMPACT_LAYOUT_QUERY } from '../src/studio/layoutMode'

const demoCss = readFileSync(new URL('../src/styles/demo.css', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../src/studio/studio.css', import.meta.url), 'utf8')
const gallerySource = readFileSync(
  new URL('../src/demo/ComponentGallery.tsx', import.meta.url),
  'utf8',
)
const liveWorkbenchSource = readFileSync(
  new URL('../src/demo/live/LiveExampleWorkbench.tsx', import.meta.url),
  'utf8',
)
const studioSource = readFileSync(new URL('../src/studio/Studio.tsx', import.meta.url), 'utf8')

describe('gallery mobile layout contract', () => {
  it('uses the Studio compact viewport contract instead of querying a container itself', () => {
    expect(demoCss).not.toMatch(/@container\s+(?:gallery|repository-intro)/)
    expect(demoCss).toContain(`@media ${STUDIO_COMPACT_LAYOUT_QUERY}`)
    expect(studioCss).toContain(`@media ${STUDIO_COMPACT_LAYOUT_QUERY}`)
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain('(any-pointer: coarse)')
  })

  it('keeps mobile navigation horizontal and brings the active capability into view', () => {
    expect(demoCss).toMatch(/\.component-gallery__tabs\s*\{[^}]*overflow-x:\s*auto/s)
    expect(demoCss).toMatch(/\.component-gallery__group h3\s*\{[^}]*writing-mode:\s*horizontal-tb/s)
    expect(demoCss).toMatch(/\.component-gallery__tabs button\s*\{[^}]*min-height:\s*44px/s)
    expect(gallerySource).toContain("inline: 'center'")
    expect(gallerySource).toContain('scrollIntoView')
  })

  it('stacks the live editor at full width with mobile-safe editing controls', () => {
    expect(demoCss).toMatch(
      /\.component-gallery__workbench\.is-editor-open\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    )
    expect(demoCss).toMatch(/\.component-gallery__editor\s*\{[^}]*font-size:\s*16px/s)
    expect(demoCss).toMatch(
      /\.component-gallery__editor-panel > header button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    )
    expect(demoCss).toContain('env(safe-area-inset-bottom)')
  })

  it('keeps focused live editing inside the Studio visual viewport above the keyboard', () => {
    expect(studioSource).toContain("stage.dataset.virtualKeyboard = keyboardOpen ? 'open' : 'closed'")
    expect(studioSource).toContain("'--studio-stage-available-height'")
    expect(studioSource).toContain("'--studio-visual-viewport-height'")
    expect(liveWorkbenchSource).toContain('is-editor-editing')
    expect(liveWorkbenchSource).toContain('onRequestClose')
    expect(demoCss).toMatch(
      /\.studio-stage-shell\[data-virtual-keyboard='open'\][\s\S]*\.component-gallery__editor-panel\s*\{[^}]*position:\s*fixed[^}]*height:\s*var\(--studio-visual-viewport-height/s,
    )
  })

  it('keeps the repository overview inside one full-width horizontal snap lane', () => {
    expect(demoCss).toMatch(
      /\.repository-intro__content\s*\{[^}]*grid-auto-columns:\s*minmax\(0, 100%\)[^}]*overflow-x:\s*auto/s,
    )
  })
})
