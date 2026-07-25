import { describe, expect, it } from 'vitest'
import { VersionedLruCache } from '../src/bi/UltiGridInsight'

describe('Insight versioned row caches', () => {
  it('invalidates stable-source rows and metadata when contentVersion changes', () => {
    const cache = new VersionedLruCache<number, { value: string }>(4, 'v1')
    cache.set(0, { value: 'old' })

    cache.setVersion('v1')
    expect(cache.get(0)?.value).toBe('old')

    cache.setVersion('v2')
    expect(cache.get(0)).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('retains recently-read entries when the bounded cache evicts', () => {
    const cache = new VersionedLruCache<number, string>(2)
    cache.set(0, 'leading')
    cache.set(1, 'middle')
    expect(cache.get(0)).toBe('leading')

    cache.set(2, 'trailing')

    expect(cache.get(0)).toBe('leading')
    expect(cache.get(1)).toBeUndefined()
    expect(cache.get(2)).toBe('trailing')
  })
})
