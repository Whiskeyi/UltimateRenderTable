import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InsightCell } from '../src/bi'

const baseProps = {
  row: { id: 1 },
  rowId: 1,
  rowIndex: 0,
  columnId: 'value',
  columnIndex: 0,
  value: 'Alpha',
}

describe('InsightCell embedding', () => {
  it('marks embedded cells while preserving Core-owned selection state', () => {
    const markup = renderToStaticMarkup(
      <InsightCell {...baseProps} embedded selected active disabled ariaLabel="Embedded value" />,
    )

    expect(markup).toContain('role="presentation"')
    expect(markup).toContain('ultigrid-insight-cell--embedded')
    expect(markup).toContain('ultigrid-insight-cell--selected')
    expect(markup).toContain('ultigrid-insight-cell--active')
    expect(markup).not.toContain('aria-colindex')
    expect(markup).not.toContain('aria-rowindex')
    expect(markup).not.toContain('aria-selected')
    expect(markup).not.toContain('aria-disabled')
    expect(markup).not.toContain('aria-label')
  })

  it('keeps standalone cells out of the embedded styling path', () => {
    const markup = renderToStaticMarkup(
      <InsightCell {...baseProps} selected active disabled ariaLabel="Standalone value" />,
    )

    expect(markup).toContain('role="gridcell"')
    expect(markup).not.toContain('ultigrid-insight-cell--embedded')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).toContain('aria-label="Standalone value"')
  })
})
