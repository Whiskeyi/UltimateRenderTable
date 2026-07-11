import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  defineInsightColumn,
  type AdjacentMergeOptions,
  type InsightColumnDefinition,
  type UltiGridInsightProps,
} from '../src/bi'

interface Row {
  id: number
  label: string
  score: number
}

describe('UltiGridInsight public types', () => {
  it('keeps heterogeneous column value types while exposing one collection', () => {
    const label = defineInsightColumn<Row, string>({
      id: 'label',
      header: 'Label',
      getValue: (row) => row.label,
      formatValue: (value) => value.toUpperCase(),
    })
    const score = defineInsightColumn<Row, number>({
      id: 'score',
      header: 'Score',
      getValue: (row) => row.score,
      formatValue: (value) => value.toFixed(1),
    })
    const columns: InsightColumnDefinition<Row>[] = [label, score]
    const props = {
      rows: [{ id: 1, label: 'A', score: 98 }],
      columns,
      getRowId: (row: Row) => row.id,
    } satisfies UltiGridInsightProps<Row>

    expect(props.columns).toHaveLength(2)
    expectTypeOf(label.getValue).returns.toEqualTypeOf<string>()
    expectTypeOf(score.getValue).returns.toEqualTypeOf<number>()
  })

  it('types ordered adjacent-merge dimensions against the row model', () => {
    const columns: InsightColumnDefinition<Row>[] = [
      defineInsightColumn<Row, string>({
        id: 'label',
        getValue: (row) => row.label,
      }),
      defineInsightColumn<Row, number>({
        id: 'score',
        getValue: (row) => row.score,
      }),
    ]
    const mergeAdjacent = {
      columns: [
        0,
        {
          columnIndex: 1,
          getKey: (_value, row) => `${row.label}:${row.score}`,
        },
      ],
      treeBoundary: 'siblings',
    } satisfies AdjacentMergeOptions<Row>
    const props = {
      rows: [{ id: 1, label: 'A', score: 98 }],
      columns,
      getRowId: (row: Row) => row.id,
      mergeAdjacent,
    } satisfies UltiGridInsightProps<Row>

    expect(props.mergeAdjacent.columns).toHaveLength(2)
    expectTypeOf(mergeAdjacent).toMatchTypeOf<AdjacentMergeOptions<Row>>()
  })
})
