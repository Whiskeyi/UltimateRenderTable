import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDemoColumnGetter } from '../src/demo/demoData'

const SCENARIOS = ['analysis', 'conditional'] as const
const SAMPLE_COLUMN_COUNT = 12

function getScenarioSignature(scenario: (typeof SCENARIOS)[number]) {
  const getColumn = createDemoColumnGetter(scenario, 'en-US')
  return Array.from({ length: SAMPLE_COLUMN_COUNT }, (_, index) => {
    const column = getColumn(index)
    const rendererKinds = [
      column.renderContent ? 'custom-dom' : 'text',
      column.image ? 'image' : null,
      column.conditionalRules?.length
        ? `rules:${column.conditionalRules.map((rule) => rule.kind).join(',')}`
        : null,
    ].filter(Boolean)

    return `${column.id}[${rendererKinds.join('+')}]`
  })
}

describe('demo scenario columns', () => {
  it('uses a distinct column id and renderer composition for every scenario', () => {
    const signatures = SCENARIOS.map(getScenarioSignature)

    expect(new Set(signatures.map((signature) => signature.join('|'))).size).toBe(SCENARIOS.length)
    expect(signatures.map((signature) => signature.slice(0, 3))).toEqual([
      [
        'dimension[custom-dom]',
        'product[custom-dom]',
        'revenue[custom-dom+rules:dataBar,text]',
      ],
      [
        'entity[custom-dom]',
        'revenue-bar[text+rules:dataBar]',
        'attainment-scale[text+rules:colorScale]',
      ],
    ])
  })

  it('folds the former conditional-format scene into the analytics report', () => {
    const getColumn = createDemoColumnGetter('analysis', 'zh-CN')
    const signalColumns = Array.from({ length: 8 }, (_, index) => getColumn(index + 10))

    expect(signalColumns.map((column) => column.id)).toEqual([
      'revenue-bar',
      'attainment-scale',
      'variance-icon',
      'margin-text',
      'risk-background',
      'sla-bar',
      'quality-icon',
      'rule-legend',
    ])
    expect(new Set(signalColumns.flatMap((column) => (
      column.conditionalRules?.map((rule) => rule.kind) ?? []
    )))).toEqual(new Set(['dataBar', 'colorScale', 'icon', 'text', 'background']))
  })

  it('reuses business analytics with a tree column composition when enabled', () => {
    const getColumn = createDemoColumnGetter('analysis', 'en-US', { treeEnabled: true })

    expect(Array.from({ length: 3 }, (_, index) => getColumn(index).id)).toEqual([
      'dimension',
      'node-type',
      'owner',
    ])
  })

  it('renders collapsed tree rows from their logical index', () => {
    const getColumn = createDemoColumnGetter('analysis', 'en-US', { treeEnabled: true })
    const dimension = getColumn(0)
    const row = { id: 13, index: 13 }
    const value = dimension.getValue(row, 8)
    const content = dimension.renderContent?.({
      row,
      rowId: row.id,
      rowIndex: 8,
      columnId: dimension.id,
      columnIndex: 0,
      value,
      displayValue: String(value),
      selected: false,
      active: false,
    })
    const markup = renderToStaticMarkup(content)

    expect(markup).toContain('demo-tree-node--depth-1')
    expect(markup).toContain('<i>P</i>')
    expect(markup).toContain('<small>Partners</small>')
  })

  it('groups flat analysis dimensions into contiguous runs', () => {
    const getColumn = createDemoColumnGetter('analysis', 'en-US')
    const region = getColumn(0)
    const product = getColumn(1)
    const row = (index: number) => ({ id: index, index })

    expect(region.getValue(row(0), 0)).toBe(region.getValue(row(7), 7))
    expect(region.getValue(row(8), 8)).not.toBe(region.getValue(row(7), 7))
    expect(product.getValue(row(0), 0)).toBe(product.getValue(row(3), 3))
    expect(product.getValue(row(4), 4)).not.toBe(product.getValue(row(3), 3))
  })
})
