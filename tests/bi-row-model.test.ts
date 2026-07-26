import { describe, expect, it, vi } from 'vitest'
import { createRowMeta, FlatRowModel, TreeRowModel } from '../src/bi'

interface Row {
  id: string
  children?: readonly Row[]
}

describe('BI row models', () => {
  it('exposes versions through getter-only properties while preserving notifications', () => {
    const flatModel = new FlatRowModel([{ id: 'a' }], { getRowId: (row) => row.id })
    const treeModel = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
    })
    const flatVersions: number[] = []
    const treeVersions: number[] = []
    flatModel.subscribe((change) => flatVersions.push(change.version))
    treeModel.subscribe((change) => treeVersions.push(change.version))

    expect(Object.getOwnPropertyDescriptor(FlatRowModel.prototype, 'version')?.get)
      .toEqual(expect.any(Function))
    expect(Object.getOwnPropertyDescriptor(FlatRowModel.prototype, 'version')?.set).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(TreeRowModel.prototype, 'version')?.get)
      .toEqual(expect.any(Function))
    expect(Object.getOwnPropertyDescriptor(TreeRowModel.prototype, 'version')?.set).toBeUndefined()
    expect(Reflect.set(flatModel, 'version', 99)).toBe(false)
    expect(Reflect.set(treeModel, 'version', 99)).toBe(false)

    flatModel.replaceRows([{ id: 'b' }])
    treeModel.replaceRoots([{ id: 'next-root' }])

    expect(flatModel.version).toBe(1)
    expect(treeModel.version).toBe(1)
    expect(flatVersions).toEqual([1])
    expect(treeVersions).toEqual([1])
  })

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

  it('keeps the previous tree intact when replacement roots contain duplicate ids', () => {
    const model = new TreeRowModel<Row>([{ id: 'a' }, { id: 'b' }], {
      getRowId: (row) => row.id,
    })
    const version = model.version

    expect(() => model.replaceRoots([{ id: 'x' }, { id: 'x' }])).toThrow(
      'Tree row id must be unique: x',
    )
    expect(model.version).toBe(version)
    expect(Array.from({ length: model.getRowCount() }, (_, index) => model.getRowId(index))).toEqual([
      'a',
      'b',
    ])
    expect(model.hasRow('a')).toBe(true)
    expect(model.hasRow('x')).toBe(false)
    expect(model.findRowIndex('a')).toBe(0)
  })

  it('does not retain ghost children after a duplicate async batch fails', async () => {
    let attempt = 0
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren: async () => {
        attempt += 1
        return attempt === 1
          ? [{ id: 'duplicate' }, { id: 'duplicate' }]
          : [{ id: 'child' }]
      },
    })

    await expect(model.expand('root')).resolves.toBe(false)
    expect(model.getRowMeta(0)).toMatchObject({ expanded: false, loading: false })
    expect(model.getRowMeta(0)?.error).toBeInstanceOf(Error)
    expect(model.hasRow('duplicate')).toBe(false)
    expect(model.getRowCount()).toBe(1)

    await expect(model.toggle('root')).resolves.toBe(true)
    expect(model.getRowId(1)).toBe('child')
  })

  it('ignores children from a pending load after roots are replaced', async () => {
    let resolveChildren: ((rows: readonly Row[]) => void) | undefined
    const changes: string[] = []
    const model = new TreeRowModel<Row>([{ id: 'old-root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren: () => new Promise((resolve) => {
        resolveChildren = resolve
      }),
    })
    model.subscribe((change) => changes.push(change.type))

    const expansion = model.expand('old-root')
    model.replaceRoots([{ id: 'new-root' }])
    const resetIndex = changes.lastIndexOf('reset')
    resolveChildren?.([{ id: 'stale-child' }])

    await expect(expansion).resolves.toBe(false)
    expect(model.getRowId(0)).toBe('new-root')
    expect(model.hasRow('stale-child')).toBe(false)
    expect(changes.slice(resetIndex + 1)).toEqual([])
  })

  it('recovers from a loadChildren function that throws synchronously', async () => {
    let attempt = 0
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren: () => {
        attempt += 1
        if (attempt === 1) throw new Error('synchronous failure')
        return Promise.resolve([{ id: 'child' }])
      },
    })

    await expect(model.expand('root')).resolves.toBe(false)
    expect(model.getRowMeta(0)).toMatchObject({
      expanded: false,
      loading: false,
      error: new Error('synchronous failure'),
    })

    await expect(model.toggle('root')).resolves.toBe(true)
    expect(model.getRowId(1)).toBe('child')
  })

  it('clears a synchronous getChildren error after a successful retry', async () => {
    let attempt = 0
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      getChildren: () => {
        attempt += 1
        if (attempt === 1) throw new Error('once')
        return [{ id: 'child' }]
      },
    })

    await expect(model.expand('root')).resolves.toBe(false)
    expect(model.getRowMeta(0)?.error).toEqual(new Error('once'))

    await expect(model.toggle('root')).resolves.toBe(true)
    expect(model.getRowMeta(0)?.error).toBeUndefined()
    expect(model.getRowId(1)).toBe('child')
  })

  it('does not register synchronous children after getChildren replaces the roots', async () => {
    let model: TreeRowModel<Row>
    model = new TreeRowModel<Row>([{ id: 'old-root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      getChildren: () => {
        model.replaceRoots([{ id: 'new-root' }])
        return [{ id: 'ghost' }]
      },
    })

    await expect(model.expand('old-root')).resolves.toBe(false)
    expect(model.getRowCount()).toBe(1)
    expect(model.getRowId(0)).toBe('new-root')
    expect(model.hasRow('ghost')).toBe(false)
  })

  it('does not load or emit for a node replaced by its expand subscriber', async () => {
    const loadChildren = vi.fn(async () => [{ id: 'ghost' }])
    const changes: string[] = []
    const model = new TreeRowModel<Row>([{ id: 'old-root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren,
    })
    model.subscribe((change) => {
      changes.push(`${change.type}:${String(change.rowId ?? '')}`)
      if (change.type === 'expand') model.replaceRoots([{ id: 'new-root' }])
    })

    await expect(model.expand('old-root')).resolves.toBe(false)
    expect(loadChildren).not.toHaveBeenCalled()
    expect(changes).toEqual(['expand:old-root', 'reset:'])
    expect(model.getRowId(0)).toBe('new-root')
    expect(model.hasRow('ghost')).toBe(false)
  })

  it('does not call a stale loader after a loading subscriber replaces the roots', async () => {
    const loadChildren = vi.fn(async () => [{ id: 'ghost' }])
    const changes: string[] = []
    const model = new TreeRowModel<Row>([{ id: 'old-root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      loadChildren,
    })
    model.subscribe((change) => {
      changes.push(`${change.type}:${String(change.rowId ?? '')}`)
      if (change.type === 'loading') model.replaceRoots([{ id: 'new-root' }])
    })

    await expect(model.expand('old-root')).resolves.toBe(false)
    expect(loadChildren).not.toHaveBeenCalled()
    expect(changes).toEqual(['expand:old-root', 'loading:old-root', 'reset:'])
    expect(model.getRowId(0)).toBe('new-root')
  })

  it('returns false when a loaded subscriber replaces the expanded node', async () => {
    const model = new TreeRowModel<Row>([{ id: 'old-root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      getChildren: () => [{ id: 'old-child' }],
    })
    model.subscribe((change) => {
      if (change.type === 'loaded') model.replaceRoots([{ id: 'new-root' }])
    })

    await expect(model.expand('old-root')).resolves.toBe(false)
    expect(model.getRowCount()).toBe(1)
    expect(model.getRowId(0)).toBe('new-root')
    expect(model.hasRow('old-child')).toBe(false)
  })

  it('does not load default-expanded children collapsed by the insertion event', async () => {
    const loadChildren = vi.fn(async () => [] as readonly Row[])
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      getChildren: (row) => row.id === 'root' ? [{ id: 'child' }] : undefined,
      loadChildren,
      defaultExpanded: (_row, depth) => depth > 0,
    })
    model.subscribe((change) => {
      if (change.type === 'expand' && change.count === 1) model.collapse('root')
    })

    await expect(model.expand('root')).resolves.toBe(false)
    expect(model.isExpanded('root')).toBe(false)
    expect(model.getRowCount()).toBe(1)
    expect(model.getRowId(0)).toBe('root')
    expect(loadChildren).not.toHaveBeenCalled()
    await expect(model.expand('child')).resolves.toBe(false)
  })

  it('returns false when starting a default-expanded child collapses its parent', async () => {
    const loadChildren = vi.fn(async () => [] as readonly Row[])
    const model = new TreeRowModel<Row>([{ id: 'root' }], {
      getRowId: (row) => row.id,
      hasChildren: () => true,
      getChildren: (row) => row.id === 'root' ? [{ id: 'child' }] : undefined,
      loadChildren,
      defaultExpanded: (_row, depth) => depth > 0,
    })
    model.subscribe((change) => {
      if (change.type === 'expand' && change.rowId === 'child') model.collapse('root')
    })

    await expect(model.expand('root')).resolves.toBe(false)
    expect(model.isExpanded('root')).toBe(false)
    expect(model.getRowCount()).toBe(1)
    expect(model.getRowId(0)).toBe('root')
    expect(loadChildren).not.toHaveBeenCalled()
  })

  it('completes expansion when a row-model subscriber throws', async () => {
    const listenerError = new Error('listener failure')
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    const model = new TreeRowModel<Row>([{ id: 'root', children: [{ id: 'child' }] }], {
      getRowId: (row) => row.id,
      hasChildren: (row) => Boolean(row.children?.length),
      getChildren: (row) => row.children,
    })
    model.subscribe((change) => {
      if (change.type === 'loaded') throw listenerError
    })

    try {
      await expect(model.expand('root')).resolves.toBe(true)
      expect(model.getRowCount()).toBe(2)
      expect(model.getRowId(1)).toBe('child')
      expect(model.findRowIndex('child')).toBe(1)
      expect(reportError).toHaveBeenCalledWith(listenerError)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
