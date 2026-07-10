import { describe, expect, it } from 'vitest'
import { createDemoColumnGetter } from '../src/demo/demoData'

const SCENARIOS = ['analysis', 'tree', 'conditional', 'merged'] as const
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
        'product[text]',
        'revenue[custom-dom+rules:dataBar,text]',
      ],
      [
        'dimension[custom-dom]',
        'node-type[custom-dom]',
        'owner[text+image]',
      ],
      [
        'entity[custom-dom]',
        'revenue-bar[text+rules:dataBar]',
        'attainment-scale[text+rules:colorScale]',
      ],
      [
        'section[custom-dom]',
        'period-1[custom-dom]',
        'period-2[custom-dom]',
      ],
    ])
  })
})
