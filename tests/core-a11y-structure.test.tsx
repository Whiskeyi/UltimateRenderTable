import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  buildA11yRowDescriptors,
  UltiGridViewport,
} from '../src/core/UltiGridViewport'

describe('Core ARIA grid ownership', () => {
  it('always exposes a rowgroup beneath the grid contract', () => {
    const markup = renderToStaticMarkup(
      <UltiGridViewport
        rowCount={2}
        columnCount={2}
        getCell={() => 'value'}
        ariaLabel="Contract grid"
      />,
    )

    expect(markup).toContain('role="grid"')
    expect(markup).toContain('aria-label="Contract grid"')
    expect(markup).toContain('class="ultigrid-a11y-rowgroup" role="rowgroup"')
  })

  it('creates one ordered logical row across pane-owned cells', () => {
    const getRowAriaAttributes = vi.fn((row: number) => row === 3 ? {
      ariaLabel: 'Expandable total',
      ariaLevel: 2,
      ariaExpanded: false,
      ariaBusy: true,
    } : undefined)
    const descriptors = buildA11yRowDescriptors(
      'grid-a',
      new Map([
        [3, [
          { column: 4, id: 'grid-a-r3-c4' },
          { column: 0, id: 'grid-a-r3-c0' },
          { column: 4, id: 'grid-a-r3-c4' },
          { column: 2, id: 'grid-a-r3-c2' },
        ]],
        [1, [{ column: 1, id: 'grid-a-r1-c1' }]],
      ]),
      getRowAriaAttributes,
    )

    expect(descriptors).toEqual([
      {
        row: 1,
        id: 'grid-a-row-1',
        owns: 'grid-a-r1-c1',
      },
      {
        row: 3,
        id: 'grid-a-row-3',
        owns: 'grid-a-r3-c0 grid-a-r3-c2 grid-a-r3-c4',
        ariaLabel: 'Expandable total',
        ariaLevel: 2,
        ariaExpanded: false,
        ariaBusy: true,
      },
    ])
    expect(getRowAriaAttributes).toHaveBeenCalledTimes(2)
  })
})
