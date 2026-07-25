// @ts-expect-error Vitest runs in Node; the browser package intentionally omits Node typings.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UltiGridViewport } from '../src/core'
import {
  resolveActiveDescendantId,
  resolveMergedAriaSpan,
} from '../src/core/UltiGridViewport'
import { writeClipboard } from '../src/core/clipboard'
import { isAddressInRange } from '../src/core/viewportTypes'
import {
  createTouchTapGesture,
  detectTouchFirstInput,
  isCompletedTouchTap,
  resolveMobileInteractionOptions,
  resolveTouchScrollIntent,
  TOUCH_CAPABLE_POINTER_QUERY,
  updateTouchTapGesture,
} from '../src/core/mobileInteraction'

const coreCss = readFileSync(new URL('../src/core/ultiGridViewport.css', import.meta.url), 'utf8')

describe('Core mobile interaction', () => {
  it('normalizes automatic, forced, bounded, and localized options', () => {
    expect(resolveMobileInteractionOptions(undefined)).toMatchObject({
      mode: 'auto',
      scrollAxisLock: 'dominant',
      tapSlop: 10,
      edgeAutoScrollThreshold: 36,
      showCopyAction: true,
    })
    expect(resolveMobileInteractionOptions(false).mode).toBe('off')
    expect(resolveMobileInteractionOptions(true).mode).toBe('always')
    expect(resolveMobileInteractionOptions({ scrollAxisLock: 'native' }).scrollAxisLock).toBe('native')
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

  it('locks a one-finger pan to one dominant axis after the touch slop', () => {
    expect(resolveTouchScrollIntent(100, 100, 106, 104, 10)).toBeNull()
    expect(resolveTouchScrollIntent(100, 100, 124, 108, 10)).toBe('horizontal')
    expect(resolveTouchScrollIntent(100, 100, 108, 124, 10)).toBe('vertical')
    expect(resolveTouchScrollIntent(100, 100, 120, 118, 10)).toBe('vertical')
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
      expect(coreCss).toContain('.ultigrid-root--axis-lock > .ultigrid-scroller')
      expect(coreCss).toContain('touch-action: pan-y pinch-zoom')
      expect(coreCss).toMatch(
        /\.ultigrid-root--mobile\.ultigrid-root--axis-lock > \.ultigrid-scroller\s*\{[^}]*overscroll-behavior-y:\s*auto/s,
      )
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
        rowCount={2}
        columnCount={2}
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
    expect(markup).toContain('data-scroll-axis-lock="dominant"')
    expect(markup).toContain('aria-multiselectable="true"')
    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('aria-label="选区操作"')
    expect(markup).toContain('<span>复制选区</span>')
  })

  it('exposes spans only for merged owner surfaces', () => {
    expect(resolveMergedAriaSpan(0, 1, true)).toBe(2)
    expect(resolveMergedAriaSpan(0, 2, true)).toBe(3)
    expect(resolveMergedAriaSpan(0, 2, false)).toBeUndefined()
    expect(resolveMergedAriaSpan(0, 0, true)).toBeUndefined()
  })

  it('links the focused grid to a rendered cell or merged owner', () => {
    expect(resolveActiveDescendantId(
      'grid-a',
      { row: 2, column: 4 },
      undefined,
      true,
    )).toBe('grid-a-r2-c4')
    expect(resolveActiveDescendantId(
      'grid-a',
      { row: 3, column: 5 },
      { rowStart: 2, rowEnd: 3, columnStart: 4, columnEnd: 5 },
      true,
    )).toBe('grid-a-r2-c4')
    expect(resolveActiveDescendantId(
      'grid-a',
      { row: 2, column: 4 },
      undefined,
      false,
    )).toBeUndefined()
  })

  it('rejects selection bounds that split a merged interaction surface', () => {
    expect(() => renderToStaticMarkup(
      <UltiGridViewport
        rowCount={1}
        columnCount={3}
        getCell={(_row, column) => column}
        mergedCells={[{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 2 }]}
        selectionBounds={{ rowStart: 0, rowEnd: 0, columnStart: 1, columnEnd: 2 }}
      />,
    )).toThrow('selectionBounds must fully contain or exclude merged cell')
  })

  it('rejects duplicate merged-cell ids before they can overwrite each other', () => {
    expect(() => renderToStaticMarkup(
      <UltiGridViewport
        rowCount={2}
        columnCount={2}
        getCell={(_row, column) => column}
        mergedCells={[
          { id: 'duplicate', rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 },
          { id: 'duplicate', rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 1 },
        ]}
      />,
    )).toThrow('mergedCells ids must be unique; received duplicate')
  })

  it('reports a rejected DOM clipboard fallback and always removes its textarea', async () => {
    const textarea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
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

  it('falls back after a hanging Clipboard API call and restores grid focus', async () => {
    vi.useFakeTimers()
    const previousFocus = { focus: vi.fn() }
    const textarea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLTextAreaElement
    const execCommand = vi.fn(() => true)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => new Promise<void>(() => undefined)) },
    })
    vi.stubGlobal('document', {
      activeElement: previousFocus,
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand,
    })

    try {
      const result = writeClipboard('value', 75)
      await vi.advanceTimersByTimeAsync(75)
      await expect(result).resolves.toBeUndefined()
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(textarea.setAttribute).toHaveBeenCalledWith('readonly', '')
      expect(textarea.remove).toHaveBeenCalledOnce()
      expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true })
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})
