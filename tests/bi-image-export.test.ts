import { describe, expect, it } from 'vitest'
import { ensureImageFileName } from '../src/bi/imageExport'

describe('image export', () => {
  it('keeps the download extension consistent with the encoded format', () => {
    expect(ensureImageFileName('snapshot', 'png')).toBe('snapshot.png')
    expect(ensureImageFileName('snapshot.PNG', 'png')).toBe('snapshot.PNG')
    expect(ensureImageFileName('snapshot.jpg', 'png')).toBe('snapshot.png')
    expect(ensureImageFileName('snapshot.png', 'jpeg')).toBe('snapshot.jpg')
    expect(ensureImageFileName('snapshot.jpeg', 'jpeg')).toBe('snapshot.jpeg')
  })
})
