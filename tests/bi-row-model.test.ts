import { describe, expect, it } from 'vitest'
import { createRowMeta, FlatRowModel, TreeRowModel } from '../src/bi'

interface Row {
  id: string
  children?: readonly Row[]
}

describe('BI row models', () => {
  it('keeps flat rows allocation-light and builds the id index lazily', () => {
    const rows = [{ id: 'a' }, { id: 'b' }] as const
    const model = new FlatRowModel(rows, { getRowId: (row) => row.id })
    const target = createRowMeta()

    expect(model.getRowCount()).toBe(2)
    expect(model.getRowMeta(1, target)).toBe(target)
    expect(target).toMatchObject({ id: 'b', depth: 0, expandable: false })
    expect(model.findRowIndex('b')).toBe(1)
  })

  it('incrementally expands, collapses, and restores loaded tree branches', async () => {
    const rows: readonly Row[] = [
      {
        id: 'root',
        children: [
          { id: 'child-a', children: [{ id: 'grandchild' }] },
          { id: 'child-b' },
        ],
      },
    ]
    const model = new TreeRowModel(rows, {
      getRowId: (row) => row.id,
      hasChildren: (row) => Boolean(row.children?.length),
      getChildren: (row) => row.children,
    })

    await model.expand('root')
    expect(model.getRowCount()).toBe(3)
    expect(model.getRowId(1)).toBe('child-a')

    await model.expand('child-a')
    expect(model.getRowCount()).toBe(4)
    expect(model.getRowId(2)).toBe('grandchild')

    expect(model.collapse('root')).toBe(true)
    expect(model.getRowCount()).toBe(1)

    await model.expand('root')
    expect(Array.from({ length: model.getRowCount() }, (_, index) => model.getRowId(index))).toEqual([
      'root',
      'child-a',
      'grandchild',
      'child-b',
    ])
  })

  it('loads children on demand and does not reveal them after a concurrent collapse', async () => {
    let resolveChildren: ((rows: readonly Row[]) => void) | undefined
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren: () =>
        new Promise((resolve) => {
          resolveChildren = resolve
        }),
    })

    const expansion = model.expand('root')
    expect(model.getRowMeta(0)?.loading).toBe(true)
    model.collapse('root')
    resolveChildren?.([{ id: 'lazy-child' }])
    expect(await expansion).toBe(false)
    expect(model.getRowCount()).toBe(1)

    await model.expand('root')
    expect(model.getRowId(1)).toBe('lazy-child')
  })
})
