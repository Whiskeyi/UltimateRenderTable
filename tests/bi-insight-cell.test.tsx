import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defineInsightColumn, InsightCell, UltiGridInsight } from '../src/bi'
import { buildTreeToggleLabel } from '../src/bi/UltiGridInsight'

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

  it('keeps wrapped display text available when fixed row height clips it', () => {
    const markup = renderToStaticMarkup(
      <InsightCell
        {...baseProps}
        embedded
        displayValue="A long exception note"
        visualStyle={{ wrap: true }}
      />,
    )

    expect(markup).toContain('ultigrid-insight-cell--wrap')
    expect(markup).toContain('title="A long exception note"')
  })

  it('renders the application empty state even when table chrome is present', () => {
    const markup = renderToStaticMarkup(
      <UltiGridInsight<{ label: string }>
        rows={[]}
        columns={[defineInsightColumn<{ label: string }, string>({
          id: 'label',
          header: 'Label',
          getValue: (row) => row.label,
        })]}
        emptyContent="NO RESULTS"
      />,
    )

    expect(markup).toContain('class="ultigrid-insight-empty"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('NO RESULTS')
  })

  it('identifies tree toggle buttons by their node label', () => {
    expect(buildTreeToggleLabel('Collapse row', 'Commercial')).toBe(
      'Collapse row: Commercial',
    )
    expect(buildTreeToggleLabel('Expand row', 'Direct', 'Could not load children')).toBe(
      'Could not load children. Expand row: Direct',
    )
  })
})
