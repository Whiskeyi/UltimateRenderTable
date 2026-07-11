import { describe, expect, it } from 'vitest'
import { buildAdjacentMerges, type AdjacentMergeOptions } from '../src/bi/adjacentMerge'
import type { RowMeta } from '../src/bi/rowModel'

interface Row {
  outer: unknown
  inner?: unknown
}

function createSource(rows: readonly Row[], metas?: readonly RowMeta[]) {
  return {
    rowCount: rows.length,
    columnCount: 2,
    getRow: (index: number) => rows[index],
    getColumnValue: (columnIndex: number, row: Row) => (
      columnIndex === 0 ? row.outer : row.inner
    ),
    getRowMeta: metas
      ? (index: number, target?: RowMeta) => {
          const meta = metas[index]
          if (!meta) return undefined
          if (!target) return meta
          Object.assign(target, meta)
          return target
        }
      : undefined,
  }
}

function ranges(rows: readonly Row[], options: AdjacentMergeOptions<Row>) {
  return buildAdjacentMerges(createSource(rows), options).map((merge) => ({
    rowStart: merge.rowStart,
    rowEnd: merge.rowEnd,
    column: merge.columnStart,
  })).sort((left, right) => left.column - right.column || left.rowStart - right.rowStart)
}

function rowMeta(
  id: string,
  parentId: string | undefined,
  depth: number,
  expandable = false,
): RowMeta {
  return {
    id,
    parentId,
    depth,
    expandable,
    expanded: false,
    loading: false,
    error: undefined,
  }
}

describe('adjacent Insight merges', () => {
  it('nests deeper runs inside matching outer prefixes', () => {
    const rows: Row[] = [
      { outer: 'A', inner: 'x' },
      { outer: 'A', inner: 'x' },
      { outer: 'A', inner: 'y' },
      { outer: 'A', inner: 'y' },
      { outer: 'B', inner: 'x' },
      { outer: 'B', inner: 'x' },
    ]

    expect(ranges(rows, { columns: [0, 1] })).toEqual([
      { rowStart: 0, rowEnd: 3, column: 0 },
      { rowStart: 4, rowEnd: 5, column: 0 },
      { rowStart: 0, rowEnd: 1, column: 1 },
      { rowStart: 2, rowEnd: 3, column: 1 },
      { rowStart: 4, rowEnd: 5, column: 1 },
    ])
  })

  it('does not join equal values separated by another run', () => {
    const rows: Row[] = ['A', 'A', 'B', 'A', 'A'].map((outer) => ({ outer }))

    expect(ranges(rows, { columns: [0] })).toEqual([
      { rowStart: 0, rowEnd: 1, column: 0 },
      { rowStart: 3, rowEnd: 4, column: 0 },
    ])
  })

  it('skips empty values by default and supports stable custom keys', () => {
    const rows: Row[] = ['', '', null, null, 'North', 'NORTH'].map((outer) => ({ outer }))

    expect(ranges(rows, {
      columns: [{
        columnIndex: 0,
        getKey: (value) => typeof value === 'string' ? value.toLowerCase() : value,
      }],
    })).toEqual([{ rowStart: 4, rowEnd: 5, column: 0 }])
    expect(ranges(rows.slice(0, 4), {
      columns: [{ columnIndex: 0, mergeEmpty: true }],
    })).toEqual([
      { rowStart: 0, rowEnd: 1, column: 0 },
      { rowStart: 2, rowEnd: 3, column: 0 },
    ])
  })

  it('lets explicit rectangles split the intersected hierarchy depth', () => {
    const rows = Array.from({ length: 6 }, (): Row => ({ outer: 'A', inner: 'x' }))
    const explicit = [{
      id: 'adjacent:0:0:5',
      rowStart: 2,
      rowEnd: 3,
      columnStart: 1,
      columnEnd: 1,
    }]
    const generated = buildAdjacentMerges(createSource(rows), { columns: [0, 1] }, explicit)

    expect(generated.map((merge) => ({
      id: merge.id,
      rowStart: merge.rowStart,
      rowEnd: merge.rowEnd,
      column: merge.columnStart,
    })).sort((left, right) => left.column - right.column || left.rowStart - right.rowStart)).toEqual([
      { id: 'adjacent:0:0:5:1', rowStart: 0, rowEnd: 5, column: 0 },
      { id: 'adjacent:1:0:1', rowStart: 0, rowEnd: 1, column: 1 },
      { id: 'adjacent:1:4:5', rowStart: 4, rowEnd: 5, column: 1 },
    ])

    const outerBlocker = [{
      rowStart: 2,
      rowEnd: 3,
      columnStart: 0,
      columnEnd: 0,
    }]
    expect(buildAdjacentMerges(createSource(rows), { columns: [0, 1] }, outerBlocker)
      .map((merge) => [merge.columnStart, merge.rowStart, merge.rowEnd])
      .sort((left, right) => left[0]! - right[0]! || left[1]! - right[1]!)).toEqual([
        [0, 0, 1],
        [0, 4, 5],
        [1, 0, 1],
        [1, 4, 5],
      ])
  })

  it('keeps sibling groups separate and treats expandable rows as barriers', () => {
    const rows = Array.from({ length: 7 }, (): Row => ({ outer: 'same' }))
    const metas = [
      rowMeta('a-1', 'a', 1),
      rowMeta('a-2', 'a', 1),
      rowMeta('b-1', 'b', 1),
      rowMeta('b-2', 'b', 1),
      rowMeta('root', undefined, 0, true),
      rowMeta('c-1', 'c', 1),
      rowMeta('c-2', 'c', 1),
    ]

    const generated = buildAdjacentMerges(createSource(rows, metas), { columns: [0] })
    expect(generated.map((merge) => [merge.rowStart, merge.rowEnd])).toEqual([
      [0, 1],
      [2, 3],
      [5, 6],
    ])
    expect(buildAdjacentMerges(createSource(rows, metas), {
      columns: [0],
      treeBoundary: 'none',
    })).toHaveLength(1)
  })

  it('treats loading and failed tree rows as barriers', () => {
    const rows = Array.from({ length: 8 }, (): Row => ({ outer: 'same' }))
    const loading = { ...rowMeta('loading', 'a', 1), loading: true }
    const failed = { ...rowMeta('failed', 'a', 1), error: new Error('failed') }
    const metas = [
      rowMeta('a-1', 'a', 1),
      rowMeta('a-2', 'a', 1),
      loading,
      rowMeta('a-3', 'a', 1),
      rowMeta('a-4', 'a', 1),
      failed,
      rowMeta('a-5', 'a', 1),
      rowMeta('a-6', 'a', 1),
    ]

    expect(buildAdjacentMerges(createSource(rows, metas), { columns: [0] })
      .map((merge) => [merge.rowStart, merge.rowEnd])).toEqual([
        [0, 1],
        [3, 4],
        [6, 7],
      ])
  })

  it('uses custom equality and honors the minimum row span', () => {
    const rows: Row[] = ['Alpha', 'ALPHA', 'b', 'B', 'b'].map((outer) => ({ outer }))

    expect(ranges(rows, {
      columns: [{
        columnIndex: 0,
        equals: (previous, current) => (
          String(previous).toLowerCase() === String(current).toLowerCase()
        ),
      }],
      minRowSpan: 3,
    })).toEqual([{ rowStart: 2, rowEnd: 4, column: 0 }])
  })

  it('fails instead of silently truncating generated regions', () => {
    const rows: Row[] = ['A', 'A', 'B', 'B', 'C', 'C'].map((outer) => ({ outer }))

    expect(() => buildAdjacentMerges(createSource(rows), {
      columns: [0],
      maxGeneratedRegions: 2,
    })).toThrow(/more than 2 regions/)
  })

  it('scans a 100k-row source exactly once without materializing row keys', () => {
    const row = { outer: 'same' }
    let reads = 0
    const generated = buildAdjacentMerges({
      rowCount: 100_000,
      columnCount: 1,
      getRow: () => {
        reads += 1
        return row
      },
      getColumnValue: (_columnIndex, current) => current.outer,
    }, { columns: [0] })

    expect(reads).toBe(100_000)
    expect(generated).toMatchObject([{
      rowStart: 0,
      rowEnd: 99_999,
      columnStart: 0,
      columnEnd: 0,
    }])
  })

  it('rejects duplicate and out-of-range dimension columns', () => {
    const source = createSource([{ outer: 'A' }])
    expect(() => buildAdjacentMerges(source, { columns: [0, 0] })).toThrow(/more than once/)
    expect(() => buildAdjacentMerges(source, { columns: [2] })).toThrow(/within 0..1/)
  })
})
