// @ts-expect-error Vitest runs in Node; the browser package intentionally omits Node typings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Axis } from '../src/core/axis'
import {
  captureColumnSize,
  clampColumnWidth,
  didColumnLayoutContractChange,
  getKeyboardColumnWidth,
  getPointerColumnWidth,
  hasTouchResizeMoved,
  mergeColumnWidthLayers,
  normalizeColumnResizeInput,
  restoreColumnSizes,
  resolveColumnResizeOptions,
  resolveColumnWidthBounds,
} from '../src/core/columnResize'
import type { ColumnResizeChange, UltiGridViewportProps } from '../src/core'

const viewportCss = readFileSync(
  new URL('../src/core/ultiGridViewport.css', import.meta.url),
  'utf8',
)
const viewportSource = readFileSync(
  new URL('../src/core/UltiGridViewport.tsx', import.meta.url),
  'utf8',
)

describe('Core column resize', () => {
  it('is opt-in and resolves exact viewport header rows and per-column bounds', () => {
    expect(resolveColumnResizeOptions(undefined).enabled).toBe(false)
    const options = resolveColumnResizeOptions({
      headerRows: [0, 2, 2, -1],
      minWidth: (column) => 44 + column,
      maxWidth: 320,
      keyboardStep: 12,
      isColumnResizable: (column) => column !== 0,
      getHandleAriaLabel: (column) => `调整第 ${column + 1} 列`,
    })

    expect([...options.headerRows]).toEqual([0, 2])
    expect(resolveColumnWidthBounds(options, 3)).toEqual({ min: 47, max: 320 })
    expect(options.keyboardStep).toBe(12)
    expect(options.touchActivationDelay).toBe(280)
    expect(options.isColumnResizable(0)).toBe(false)
    expect(options.isColumnResizable(3)).toBe(true)
    expect(options.getHandleAriaLabel(3)).toBe('调整第 4 列')
  })

  it('cancels touch activation after pan intent and supports immediate opt-in', () => {
    expect(hasTouchResizeMoved(100, 200, 106, 206)).toBe(false)
    expect(hasTouchResizeMoved(100, 200, 112, 206)).toBe(true)
    expect(resolveColumnResizeOptions({ touchActivationDelay: 0 }).touchActivationDelay).toBe(0)
    expect(resolveColumnResizeOptions({ touchActivationDelay: 9_000 }).touchActivationDelay).toBe(2_000)
  })

  it('preserves native pan until long press and then cancels touch scroll explicitly', () => {
    expect(viewportCss).toMatch(
      /\.ultigrid-column-resize-handle\s*\{[^}]*touch-action:\s*pan-x pan-y/s,
    )
    expect(viewportCss).not.toMatch(
      /\.ultigrid-column-resize-handle\.is-resizing\s*\{[^}]*touch-action/s,
    )
    expect(viewportSource).toContain(
      "window.addEventListener('touchmove', preventActiveTouchResizeScroll, { passive: false })",
    )
    expect(viewportSource).toContain(
      "window.removeEventListener('touchmove', preventActiveTouchResizeScroll)",
    )
  })

  it('captures and restores one target in a 100K sparse Axis without a full snapshot', () => {
    const axis = new Axis({
      count: 100_000,
      defaultSize: 100,
      overrides: [[42, 80], [99_999, 160]],
    })
    const rollback = [captureColumnSize(axis, 42)]

    axis.setSize(42, 220)
    restoreColumnSizes(axis, rollback)

    expect(rollback).toHaveLength(1)
    expect(axis.getSize(42)).toBe(80)
    expect(axis.getSize(99_999)).toBe(160)
  })

  it('keeps stretch baselines separate from measured and manually resized columns', () => {
    const widths = mergeColumnWidthLayers(4, {
      configured: new Map([[0, 90], [1, 100], [2, 110]]),
      stretchBaseline: new Map([[0, 140], [1, 150], [2, 160]]),
      measured: new Map([[1, 180], [2, 190]]),
      manuallyResized: new Map([[2, 240]]),
    })

    expect([...widths]).toEqual([[0, 140], [1, 180], [2, 240]])
  })

  it('uses explicit layout inputs rather than width-source identity as the reset contract', () => {
    const current = {
      columnCount: 100_000,
      defaultColumnWidth: 120,
      fitColumns: 'stretch' as const,
      columnLayoutVersion: 1,
    }

    expect(didColumnLayoutContractChange(current, { ...current })).toBe(false)
    expect(didColumnLayoutContractChange(current, {
      ...current,
      columnLayoutVersion: 2,
    })).toBe(true)
    expect(didColumnLayoutContractChange(current, {
      ...current,
      fitColumns: 'none',
    })).toBe(true)
  })

  it('clamps pointer widths and supports precise, accelerated, and limit keys', () => {
    const bounds = { min: 48, max: 240 }

    expect(clampColumnWidth(31, bounds)).toBe(48)
    expect(clampColumnWidth(241, bounds)).toBe(240)
    expect(getPointerColumnWidth(100.5, 300, 300, 1, bounds)).toBe(100.5)
    expect(getPointerColumnWidth(100, 300, 330, 1, bounds)).toBe(130)
    expect(getPointerColumnWidth(100, 300, 270, -1, bounds)).toBe(130)
    expect(getKeyboardColumnWidth('ArrowRight', 100, bounds, 8)).toBe(108)
    expect(getKeyboardColumnWidth('ArrowLeft', 100, bounds, 8, { altKey: true })).toBe(99)
    expect(getKeyboardColumnWidth('ArrowRight', 100, bounds, 8, { shiftKey: true })).toBe(132)
    expect(getKeyboardColumnWidth('Home', 100, bounds, 8)).toBe(48)
    expect(getKeyboardColumnWidth('End', 100, bounds, 8)).toBe(240)
    expect(getKeyboardColumnWidth('Enter', 100, bounds, 8)).toBeNull()
  })

  it('keeps pointer sources and public callback coordinates explicit', () => {
    expect(normalizeColumnResizeInput('touch')).toBe('touch')
    expect(normalizeColumnResizeInput('pen')).toBe('pen')
    expect(normalizeColumnResizeInput('')).toBe('mouse')

    const change: ColumnResizeChange = {
      viewportColumn: 3,
      width: 180,
      previousWidth: 136,
      phase: 'change',
      input: 'touch',
    }
    const props = {
      rowCount: 1,
      columnCount: 4,
      getCell: () => '',
      columnResize: { headerRows: [0] },
      onColumnResize: (event: ColumnResizeChange) => event.viewportColumn,
    } satisfies UltiGridViewportProps

    expect(change.viewportColumn).toBe(3)
    expect(props.columnResize.headerRows).toEqual([0])
  })
})
