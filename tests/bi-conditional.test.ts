import { describe, expect, it } from 'vitest'
import type { InsightCellContext, ConditionalFormatRule } from '../src/bi'
import {
  compileConditionalFormatting,
  createConditionalFormatResult,
} from '../src/bi/conditionalFormatting'

interface Row {
  id: number
  score: number
}

function context(value: number): InsightCellContext<Row, number> {
  return {
    row: { id: 1, score: value },
    rowId: 1,
    rowIndex: 0,
    columnId: 'score',
    columnIndex: 0,
    value,
  }
}

describe('compileConditionalFormatting', () => {
  it('evaluates ordered rules into a reusable, stable result', () => {
    const rules: ConditionalFormatRule<Row, number>[] = [
      {
        id: 'positive-background',
        kind: 'background',
        color: '#eef2ff',
        when: { operator: 'greaterThan', value: 0 },
      },
      {
        id: 'high-score-text',
        kind: 'text',
        style: { color: '#4338ca', fontWeight: 700 },
        when: { operator: 'greaterThanOrEqual', value: 80 },
      },
      {
        id: 'excellent-icon',
        kind: 'icon',
        icon: { name: 'sparkles', position: 'trailing' },
        when: { operator: 'greaterThan', value: 95 },
      },
    ]
    const formatter = compileConditionalFormatting(rules)
    const reusable = createConditionalFormatResult()

    expect(formatter.evaluateInto(context(98), reusable)).toBe(reusable)
    expect(reusable).toMatchObject({
      backgroundColor: '#eef2ff',
      color: '#4338ca',
      fontWeight: 700,
      icon: { name: 'sparkles' },
      matchedRuleCount: 3,
      lastMatchedRuleId: 'excellent-icon',
    })

    formatter.evaluateInto(context(-1), reusable)
    expect(reusable.backgroundColor).toBeUndefined()
    expect(reusable.color).toBeUndefined()
    expect(reusable.icon).toBeUndefined()
    expect(reusable.matchedRuleCount).toBe(0)
  })

  it('quantizes color scales at compile time and calculates signed data bars', () => {
    const formatter = compileConditionalFormatting<Row, number>([
      {
        id: 'scale',
        kind: 'colorScale',
        domain: [-100, 100],
        colors: ['#000000', '#ffffff'],
      },
      {
        id: 'bar',
        kind: 'dataBar',
        domain: [-100, 100],
        axis: 0,
        color: '#16a34a',
        negativeColor: '#dc2626',
      },
    ])

    const result = formatter.evaluate(context(-50))
    expect(result.backgroundColor).toBe('rgb(64 64 64)')
    expect(result.dataBarOffset).toBeCloseTo(0.25)
    expect(result.dataBarRatio).toBeCloseTo(0.25)
    expect(result.dataBarNegative).toBe(true)
    expect(result.dataBarColor).toBe('#dc2626')
  })

  it('honors priority and stopIfTrue', () => {
    const formatter = compileConditionalFormatting<Row, number>([
      { id: 'late', kind: 'background', color: 'red', priority: 10 },
      {
        id: 'first',
        kind: 'background',
        color: 'green',
        priority: -1,
        stopIfTrue: true,
      },
    ])

    const result = formatter.evaluate(context(1))
    expect(result.backgroundColor).toBe('green')
    expect(result.matchedRuleCount).toBe(1)
  })
})
