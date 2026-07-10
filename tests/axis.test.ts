import { describe, expect, it } from 'vitest'
import { Axis } from '../src/core/axis'

describe('Axis', () => {
  it('indexes 100k items with sparse overrides', () => {
    const axis = new Axis({
      count: 100_000,
      defaultSize: 10,
      overrides: new Map([
        [2, 30],
        [50_000, 5],
        [99_999, 20],
      ]),
    })

    expect(axis.overrideCount).toBe(3)
    expect(axis.getOffset(3)).toBe(50)
    expect(axis.getOffset(50_001)).toBe(500_025)
    expect(axis.totalSize).toBe(1_000_025)
    expect(axis.indexAtOffset(49.99)).toBe(2)
    expect(axis.indexAtOffset(50)).toBe(3)
    expect(axis.indexAtOffset(500_024.99)).toBe(50_000)
  })

  it('updates its typed prefix index without materializing default overrides', () => {
    const axis = new Axis({ count: 4, defaultSize: 10 })
    axis.setSize(1, 25)
    axis.setSize(3, 5)

    expect(axis.getOffset(4)).toBe(50)
    expect(axis.indexAtOffset(34.99)).toBe(1)
    expect(axis.indexAtOffset(35)).toBe(2)

    axis.resetSize(1)
    expect(axis.getOffset(4)).toBe(35)
    expect(axis.overrideCount).toBe(1)

    axis.setDefaultSize(5)
    expect([...axis.overrides()]).toEqual([])
    expect(axis.totalSize).toBe(20)
  })

  it('adds equal stretch space while preserving custom-size deltas', () => {
    const axis = new Axis({
      count: 4,
      defaultSize: 20,
      overrides: [[1, 40]],
      containerSize: 120,
      stretch: true,
    })

    expect(axis.contentSize).toBe(100)
    expect(axis.totalSize).toBe(120)
    expect(axis.getSize(0)).toBe(25)
    expect(axis.getSize(1)).toBe(45)
    expect(axis.getOffset(2)).toBe(70)
    expect(axis.indexAtOffset(25)).toBe(1)
  })

  it('resizes and defines explicit out-of-range behavior', () => {
    const axis = new Axis({ count: 3, defaultSize: 10, overrides: [[2, 30]] })
    axis.setCount(2)

    expect(axis.totalSize).toBe(20)
    expect(axis.indexAtOffset(-100)).toBe(0)
    expect(axis.indexAtOffset(Number.NaN)).toBe(0)
    expect(axis.indexAtOffset(Number.POSITIVE_INFINITY)).toBe(1)
    expect(() => axis.getOffset(3)).toThrow(RangeError)

    const empty = new Axis({ count: 0, defaultSize: 10 })
    expect(empty.indexAtOffset(0)).toBe(-1)
  })

  it('matches a naive prefix scan across mixed smaller/larger sizes', () => {
    const sizes = new Array<number>(257).fill(20)
    let seed = 7
    for (let index = 0; index < sizes.length; index += 7) {
      seed = (seed * 48_271) % 2_147_483_647
      sizes[index] = 1 + (seed % 50)
    }
    const overrides = sizes
      .map((size, index) => [index, size] as const)
      .filter(([, size]) => size !== 20)
    const axis = new Axis({ count: sizes.length, defaultSize: 20, overrides })

    let offset = 0
    for (let index = 0; index < sizes.length; index += 1) {
      expect(axis.getOffset(index)).toBe(offset)
      expect(axis.indexAtOffset(offset)).toBe(index)
      expect(axis.indexAtOffset(offset + sizes[index]! / 2)).toBe(index)
      offset += sizes[index]!
    }
    expect(axis.totalSize).toBe(offset)
  })

  it('round-trips exact fractional and stretched boundaries', () => {
    const fractional = new Axis({
      count: 100_000,
      defaultSize: 0.1,
      overrides: [[33_333, 0.3], [77_777, 0.07]],
    })
    for (const index of [1, 411, 33_333, 33_334, 77_778, 99_999]) {
      expect(fractional.indexAtOffset(fractional.getOffset(index))).toBe(index)
    }

    const stretched = new Axis({
      count: 997,
      defaultSize: 0.2,
      overrides: [[301, 0.35]],
      containerSize: 333.3,
      stretch: true,
    })
    for (const index of [1, 17, 301, 302, 701, 996]) {
      expect(stretched.indexAtOffset(stretched.getOffset(index))).toBe(index)
    }
  })
})
