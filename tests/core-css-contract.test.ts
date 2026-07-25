// @ts-expect-error Vitest runs in Node; the browser package intentionally omits Node typings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const coreCss = readFileSync(
  new URL('../src/core/ultiGridViewport.css', import.meta.url),
  'utf8',
)

describe('Core standalone CSS contract', () => {
  it('owns border-box geometry without depending on an application reset', () => {
    expect(coreCss).toMatch(/\.ultigrid-root\s*\{[^}]*box-sizing:\s*border-box/s)
    expect(coreCss).toMatch(
      /\.ultigrid-root \*,\s*\.ultigrid-root \*::before,\s*\.ultigrid-root \*::after\s*\{[^}]*box-sizing:\s*border-box/s,
    )
  })

  it('keeps both dividers visible at every frozen corner', () => {
    for (const corner of ['start-start', 'start-end', 'end-start', 'end-end']) {
      expect(coreCss).toMatch(new RegExp(
        `\\.ultigrid-pane--${corner}\\s*\\{[^}]*box-shadow:[^;}]+,[^;}]+;`,
        's',
      ))
    }
  })
})
