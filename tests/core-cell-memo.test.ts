import { describe, expect, it } from 'vitest'
import { areCellSurfacePropsEqual } from '../src/core/UltiGridViewport'

type SurfaceProps = Parameters<typeof areCellSurfacePropsEqual>[0]

describe('Core cell memoization', () => {
  it('retains unaffected cells when an opted-out renderer selection range changes', () => {
    const previous = {
      renderCellUsesSelectionRange: false,
      range: { rowStart: 1, rowEnd: 1, columnStart: 1, columnEnd: 1 },
      selected: false,
      active: false,
    } as SurfaceProps
    const next = {
      ...previous,
      range: { rowStart: 1, rowEnd: 8, columnStart: 1, columnEnd: 8 },
    } as SurfaceProps

    expect(areCellSurfacePropsEqual(previous, next)).toBe(true)
    expect(areCellSurfacePropsEqual(previous, {
      ...next,
      selected: true,
    } as SurfaceProps)).toBe(false)
  })

  it('preserves full range updates for renderers that consume context.range', () => {
    const previous = {
      renderCellUsesSelectionRange: true,
      range: { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 },
    } as SurfaceProps
    const next = {
      ...previous,
      range: { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
    } as SurfaceProps

    expect(areCellSurfacePropsEqual(previous, next)).toBe(false)
  })
})
