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
const mobileExampleSource = readFileSync(
  new URL('../src/demo/examples/MobileInteractionExample.tsx', import.meta.url),
  'utf8',
)
const studioSource = readFileSync(new URL('../src/studio/Studio.tsx', import.meta.url), 'utf8')

describe('gallery mobile layout contract', () => {
  it('uses the Studio compact viewport contract instead of querying a container itself', () => {
    expect(demoCss).not.toMatch(/\.component-gallery\s*\{[^}]*container:/s)
    expect(demoCss).toContain('container: gallery-example / inline-size')
    expect(demoCss).toContain(`@media ${STUDIO_COMPACT_LAYOUT_QUERY}`)
    expect(studioCss).toContain(`@media ${STUDIO_COMPACT_LAYOUT_QUERY}`)
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain('(any-pointer: coarse)')
  })

  it('renders an exact 375 by 750 mobile viewport beside compact live state', () => {
    for (const className of [
      'component-gallery__mobile-demo',
      'component-gallery__mobile-body',
      'component-gallery__mobile-details',
      'component-gallery__mobile-canvas',
      'component-gallery__mobile-device',
      'component-gallery__mobile-screen',
    ]) expect(mobileExampleSource).toContain(className)
    expect(mobileExampleSource).toContain('<dl className="component-gallery__mobile-state">')
    expect(mobileExampleSource).toContain('const DEVICE_WIDTH = 375')
    expect(mobileExampleSource).toContain('const DEVICE_HEIGHT = 750')
    expect(mobileExampleSource).toMatch(
      /className="component-gallery__mobile-screen"\s+data-viewport-width=\{DEVICE_WIDTH\}\s+data-viewport-height=\{DEVICE_HEIGHT\}/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-layout\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-body\s*\{[^}]*grid-template-areas:\s*'device details'[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(170px, 200px\)/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-device\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*389px[^}]*min-width:\s*389px[^}]*height:\s*764px[^}]*min-height:\s*764px[^}]*padding:\s*6px[^}]*border-radius:\s*53px/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-canvas\s*\{[^}]*overflow:\s*auto/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-screen\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*375px[^}]*height:\s*750px[^}]*aspect-ratio:\s*375 \/ 750[^}]*overflow:\s*hidden/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-screen\s*\{[^}]*grid-template-rows:\s*50px 52px minmax\(0, 1fr\) 24px/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__mobile-device-island\s*\{[^}]*width:\s*114px[^}]*height:\s*32px/s,
    )
    expect(mobileExampleSource).toContain('component-gallery__mobile-status-icons')
    expect(mobileExampleSource).toContain('component-gallery__mobile-battery')
  })

  it('scrolls instead of shrinking the fixed device in narrow viewports', () => {
    expect(demoCss).toMatch(
      /@container gallery-example \(max-width: 640px\)[\s\S]*?\.component-gallery__mobile-body\s*\{[^}]*grid-template-areas:\s*\n\s*'device'\s*\n\s*'details'[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
    )
    expect(demoCss.match(/\.component-gallery__mobile-device\s*\{/g)).toHaveLength(1)
  })

  it('floats the source entry without consuming phone height', () => {
    expect(gallerySource).toContain('data-editor-open={editorOpen}')
    expect(demoCss).toMatch(
      /\.component-gallery__stage\[data-example='mobile'\] \.component-gallery__stage-head\s*\{[^}]*position:\s*absolute/s,
    )
    expect(demoCss).toMatch(
      /\.component-gallery__stage\[data-example='mobile'\]\[data-editor-open='true'\][\s\S]*?\.component-gallery__stage-head\s*\{[^}]*display:\s*none/s,
    )
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
