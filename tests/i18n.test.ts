import { describe, expect, it } from 'vitest'
import { translate } from '../src/i18n'

describe('translate', () => {
  it('returns Chinese and English messages from the selected locale', () => {
    expect(translate('zh-CN', 'scenario.intro')).toBe('介绍')
    expect(translate('en-US', 'scenario.intro')).toBe('Overview')
    expect(translate('zh-CN', 'error.scenario')).toContain('intro / gallery / analysis / conditional')
    expect(translate('en-US', 'error.scenario')).toContain('intro, gallery, analysis, or conditional')
    expect(translate('zh-CN', 'scenario.gallery')).toBe('组件展厅')
    expect(translate('en-US', 'scenario.gallery')).toBe('Component gallery')
    expect(translate('zh-CN', 'gallery.group.advanced')).toBe('进阶能力')
    expect(translate('en-US', 'gallery.tree.title')).toBe('Multi-level tree row model')
    expect(translate('zh-CN', 'gallery.lazy.title')).toBe('惰性行列数据')
    expect(translate('en-US', 'gallery.export.title')).toBe('Excel, CSV, and image')
    expect(translate('zh-CN', 'intro.capabilities.basic')).toContain('拖选、越界滚动与 Shift 扩选')
    expect(translate('zh-CN', 'intro.capabilities.basic')).toContain('方向键/Tab/Enter')
    expect(translate('en-US', 'intro.capabilities.advanced')).toContain('arbitrary-depth async trees')
    expect(translate('en-US', 'intro.capabilities.advanced')).toContain('rule priority')
    expect(translate('zh-CN', 'studio.field.treeEnabled')).toBe('树形展示')
    expect(translate('en-US', 'studio.field.mergeSameValueDimensions')).toBe('Merge matching dimensions')
  })

  it('interpolates every supplied placeholder', () => {
    const params = { key: 'rowCount', min: 1, max: 100_000 }

    expect(translate('zh-CN', 'error.range', params)).toBe('rowCount 必须在 1 – 100000 之间')
    expect(translate('en-US', 'error.range', params)).toBe('rowCount must be between 1 and 100000')
  })
})
