import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n'
import { SpreadsheetDemo } from '../src/demo/SpreadsheetDemo'
import { Studio } from '../src/studio'
import { STUDIO_COMPACT_LAYOUT_QUERY } from '../src/studio/layoutMode'

describe('Studio mobile shell', () => {
  it('exposes an accessible bottom-sheet trigger and drag handle', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <Studio defaultValue={{ scenario: 'analysis' }} />
      </I18nProvider>,
    )

    const trigger = markup.match(/class="studio-mobile-inspector-trigger"[^>]*aria-controls="([^"]+)"/)
    expect(trigger?.[1]).toBeTruthy()
    expect(trigger?.[0]).toContain('aria-expanded="false"')
    expect(markup).toContain(`id="${trigger?.[1]}"`)
    expect(markup.indexOf('class="studio-mobile-inspector-trigger"')).toBeGreaterThan(
      markup.indexOf('class="studio-stage-controls"'),
    )
    expect(markup.indexOf('class="studio-mobile-inspector-trigger"')).toBeLessThan(
      markup.indexOf('data-testid="studio-diagnostics-trigger"'),
    )
    expect(markup).toContain('class="studio-sheet-grabber"')
    expect(markup).toContain('aria-label="关闭参数面板"')
    expect(markup).toContain('class="studio-inspector-mobile-reset"')
    expect(markup).toContain('class="studio-mobile-scale-picker"')
    expect(markup).toContain('data-virtual-keyboard="closed"')
  })

  it('keeps phone, coarse-pointer tablet, and short landscape modes aligned', () => {
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain('(max-width: 760px)')
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (pointer: coarse)',
    )
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (any-pointer: coarse)',
    )
    expect(STUDIO_COMPACT_LAYOUT_QUERY).toContain(
      '(max-width: 1024px) and (max-height: 600px) and (orientation: landscape)',
    )
  })

  it('removes Props Lab from the spreadsheet scenario', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <Studio defaultValue={{ scenario: 'spreadsheet' }} />
      </I18nProvider>,
    )

    expect(markup).toContain('studio-stage-shell is-spreadsheet')
    expect(markup).not.toContain('class="studio-icon-button studio-reset-button"')
    expect(markup).not.toContain('Props Lab')
    expect(markup).not.toContain('data-testid="studio-inspector"')
  })

  it('renders a functional spreadsheet ribbon and editable name box', () => {
    const markup = renderToStaticMarkup(
      <SpreadsheetDemo
        locale="zh-CN"
        apiRef={{ current: null }}
        onViewportChange={() => undefined}
        localeText={{
          expandRow: '展开',
          collapseRow: '折叠',
          nodeLoadError: '加载失败',
          tableNotMounted: '未挂载',
          excelColumnLimit: '列超限',
          excelRowLimit: '行超限',
          exportCellLimitInvalid: '导出范围无效',
          exportRangeTooLarge: () => '导出范围过大',
          copySelection: '复制选区',
          copySuccess: '复制成功',
          copyError: '复制失败',
          selectionHandle: '选区手柄',
          selectionActions: '选区操作',
          resizeColumn: () => '调整列宽',
        }}
      />,
    )

    expect(markup).toContain('id="spreadsheet-ribbon-panel"')
    expect(markup).toContain('aria-label="名称框"')
    expect(markup).toContain('剪贴板')
    expect(markup).toContain('合并所选单元格')
    expect(markup.match(/role="tab"/g)).toHaveLength(3)
    expect(markup).not.toContain('新增工作表')
  })
})
