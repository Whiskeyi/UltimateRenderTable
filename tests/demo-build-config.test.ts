import { describe, expect, it } from 'vitest'
import config from '../vite.config'

describe('Demo deployment config', () => {
  it('uses relative assets so GitHub project pages do not request site-root files', () => {
    expect(typeof config).toBe('object')
    expect('base' in config && config.base).toBe('./')
  })
})
