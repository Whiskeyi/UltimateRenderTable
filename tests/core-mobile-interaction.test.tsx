// @ts-expect-error Vitest runs in Node; the browser package intentionally omits Node typings.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UltiGridViewport } from '../src/core'
import { writeClipboard } from '../src/core/clipboard'
import { isAddressInRange } from '../src/core/viewportTypes'
import {
  createTouchTapGesture,
  detectTouchFirstInput,
  isCompletedTouchTap,
  resolveMobileInteractionOptions,
  TOUCH_CAPABLE_POINTER_QUERY,
  updateTouchTapGesture,
} from '../src/core/mobileInteraction'

const coreCss = readFileSync(new URL('../src/core/ultiGridViewport.css', import.meta.url), 'utf8')

describe('Core mobile interaction', () => {
  it('normalizes automatic, forced, bounded, and localized options', () => {
    expect(resolveMobileInteractionOptions(undefined)).toMatchObject({
      mode: 'auto',
      tapSlop: 10,
      edgeAutoScrollThreshold: 36,
      showCopyAction: true,
    })
    expect(resolveMobileInteractionOptions(false).mode).toBe('off')
    expect(resolveMobileInteractionOptions(true).mode).toBe('always')
    expect(resolveMobileInteractionOptions({
      tapSlop: 200,
      edgeAutoScrollThreshold: -10,
      labels: { copySelection: '复制' },
    })).toMatchObject({
      tapSlop: 32,
      edgeAutoScrollThreshold: 0,
      labels: { copySelection: '复制', copySuccess: 'Copied' },
    })
  })

  it('keeps a small touch movement as a tap and rejects a pan', () => {
    const start = createTouchTapGesture(7, 100, 200)
    const tap = updateTouchTapGesture(start, 7, 106, 206, 10)
    const pan = updateTouchTapGesture(tap, 7, 120, 206, 10)

    expect(isCompletedTouchTap(tap, 7)).toBe(true)
    expect(isCompletedTouchTap(pan, 7)).toBe(false)
    expect(updateTouchTapGesture(start, 8, 400, 400, 10)).toBe(start)
  })

  it('detects touch capability on mixed-input devices and expands coarse hit targets', () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === TOUCH_CAPABLE_POINTER_QUERY,
    }))
    vi.stubGlobal('window', { matchMedia })
    vi.stubGlobal('navigator', { maxTouchPoints: 0 })

    try {
      expect(TOUCH_CAPABLE_POINTER_QUERY).toContain('(any-pointer: coarse)')
      expect(detectTouchFirstInput()).toBe(true)
      expect(matchMedia).toHaveBeenCalledWith(TOUCH_CAPABLE_POINTER_QUERY)
      expect(coreCss).toContain('.ultigrid-root--mobile .ultigrid-column-resize-handle')
      expect(coreCss).toContain('@media (hover: none), (pointer: coarse), (any-pointer: coarse)')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('treats a controlled focus inside a merged surface as active', () => {
    expect(isAddressInRange(
      { row: 2, column: 3 },
      { rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 3 },
    )).toBe(true)
  })

  it('renders localized, coarse-pointer selection affordances when forced', () => {
    const markup = renderToStaticMarkup(
      <UltiGridViewport
        rowCount={1}
        columnCount={1}
        getCell={() => 'value'}
        defaultSelection={{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 }}
        mobileInteraction={{
          mode: 'always',
          labels: {
            copySelection: '复制选区',
            selectionHandle: '拖动扩展选区',
            selectionActions: '选区操作',
          },
        }}
      />,
    )

    expect(markup).toContain('data-mobile-interaction="true"')
    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('aria-label="选区操作"')
    expect(markup).toContain('<span>复制选区</span>')
  })

  it('reports a rejected DOM clipboard fallback and always removes its textarea', async () => {
    const textarea = {
      value: '',
      style: {},
      select: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLTextAreaElement
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn(() => false),
    })

    try {
      await expect(writeClipboard('value')).rejects.toThrow('Clipboard copy was rejected')
      expect(textarea.remove).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
