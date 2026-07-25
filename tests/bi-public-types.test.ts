import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  defineInsightColumn,
  type AdjacentMergeOptions,
  type CellAddress,
  type CellRange,
  type InsightCellContext,
  type InsightColumnDefinition,
  type InsightColumnResizeChange,
  type InsightColumnResizeOptions,
  type InsightExcelExportOptions,
  type InsightMobileInteractionOptions,
  type ExcelExportProgress,
  type UltiGridInsightApi,
  type UltiGridInsightProps,
} from '../src/bi'
import type { TableCell } from '../src/core'
import { DEFAULT_EXPORT_CELL_LIMIT } from '../src/bi/UltiGridInsight'

interface Row {
  id: number
  label: string
  score: number
}

describe('UltiGridInsight public types', () => {
  function assertInvalidColumnTypes() {
    // @ts-expect-error Insight render/export contracts do not accept object-valued cells.
    defineInsightColumn<Row, { nested: string }>({
      id: 'invalid-object',
      getValue: () => ({ nested: 'unsupported' }),
    })

    const invalidDefinition = {
      id: 'invalid-definition',
      // @ts-expect-error Heterogeneous column collections retain the supported value boundary.
      getValue: () => ({ nested: 'unsupported' }),
    } satisfies InsightColumnDefinition<Row>
    void invalidDefinition
  }
  void assertInvalidColumnTypes

  it('uses a bounded client-side export default', () => {
    expect(DEFAULT_EXPORT_CELL_LIMIT).toBe(250_000)
  })

  it('allows virtualized cells to expose header semantics', () => {
    const columnHeader = {
      value: 'Revenue',
      ariaRole: 'columnheader',
    } satisfies TableCell<string>
    const rowHeader = {
      value: 'Region 1',
      ariaRole: 'rowheader',
    } satisfies TableCell<string>

    expect(columnHeader.ariaRole).toBe('columnheader')
    expect(rowHeader.ariaRole).toBe('rowheader')
  })

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

  it('keeps mobile and column-resize callbacks in data-column coordinates', () => {
    const columns: InsightColumnDefinition<Row>[] = [
      defineInsightColumn<Row, string>({
        id: 'label',
        getValue: (row) => row.label,
        minWidth: 96,
        maxWidth: 320,
      }),
    ]
    const columnResize = {
      isColumnResizable: (column, index) => column.id === 'label' && index === 0,
      minWidth: (_column, index) => 80 + index,
      touchActivationDelay: 320,
      getHandleAriaLabel: (column) => `Resize ${column.id}`,
    } satisfies InsightColumnResizeOptions<Row>
    const onColumnResize = (change: InsightColumnResizeChange) => {
      expectTypeOf(change.columnIndex).toEqualTypeOf<number>()
      expectTypeOf(change.columnId).toEqualTypeOf<string>()
    }
    const mobileInteraction = {
      mode: 'always',
      showCopyAction: true,
    } satisfies InsightMobileInteractionOptions
    const props = {
      rows: [{ id: 1, label: 'A', score: 98 }],
      columns,
      mobileInteraction,
      columnResize,
      columnLayoutVersion: 'schema-v2',
      onColumnResize,
    } satisfies UltiGridInsightProps<Row>

    expect(props.columnResize).toBe(columnResize)
    expect(props.mobileInteraction.mode).toBe('always')
  })

  it('exposes click and copy contracts entirely in data coordinates', () => {
    const address: CellAddress = { row: 0, column: 0 }
    const range: CellRange = {
      rowStart: 0,
      rowEnd: 0,
      columnStart: 0,
      columnEnd: 1,
    }
    const onCellClick: NonNullable<UltiGridInsightProps<Row>['onCellClick']> = (context) => {
      expectTypeOf(context).toMatchTypeOf<InsightCellContext<Row>>()
      expectTypeOf(context.row).toEqualTypeOf<Row>()
    }
    const onCopy: NonNullable<UltiGridInsightProps<Row>['onCopy']> = (copiedRange, tsv) => {
      expectTypeOf(copiedRange).toEqualTypeOf<CellRange>()
      expectTypeOf(tsv).toEqualTypeOf<string>()
    }
    const props = {
      rows: [{ id: 1, label: 'A', score: 98 }],
      columns: [defineInsightColumn<Row, string>({
        id: 'label',
        getValue: (row) => row.label,
      })],
      onCellClick,
      onCopy,
      copyCellLimit: 250_000,
    } satisfies UltiGridInsightProps<Row>

    expect(address).toEqual({ row: 0, column: 0 })
    expect(range.columnEnd).toBe(1)
    expect(props.copyCellLimit).toBe(250_000)
  })

  it('keeps the Core viewport implementation private', () => {
    expectTypeOf<UltiGridInsightApi>().not.toHaveProperty('viewport')
    expectTypeOf<UltiGridInsightApi['getActiveCell']>()
      .returns.toEqualTypeOf<{ row: number; column: number } | null>()
    expectTypeOf<UltiGridInsightApi['focus']>().returns.toBeVoid()
  })

  it('exposes cancellable Excel export options through the package API', () => {
    const onProgress = (progress: ExcelExportProgress) => {
      expectTypeOf(progress.phase)
        .toEqualTypeOf<'materializing' | 'serializing' | 'complete'>()
    }
    const options = {
      signal: new AbortController().signal,
      onProgress,
      yieldEveryRows: 250,
    } satisfies InsightExcelExportOptions

    expectTypeOf<Parameters<UltiGridInsightApi['exportExcel']>[2]>()
      .toEqualTypeOf<InsightExcelExportOptions | undefined>()
    expect(options.yieldEveryRows).toBe(250)
  })
})
