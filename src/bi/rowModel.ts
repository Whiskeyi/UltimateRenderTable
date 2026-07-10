import type { InsightRowId } from './types'

export type RowModelKind = 'flat' | 'tree'

export interface RowMeta {
  id: InsightRowId
  depth: number
  parentId: InsightRowId | undefined
  expandable: boolean
  expanded: boolean
  loading: boolean
  error: unknown
}

export interface InsightRowModel<TRow> {
  readonly kind: RowModelKind
  readonly version: number
  getRowCount(): number
  getRow(index: number): TRow | undefined
  getRowId(index: number): InsightRowId | undefined
  /** Pass a reusable target in render hot paths to avoid metadata allocations. */
  getRowMeta(index: number, target?: RowMeta): RowMeta | undefined
  findRowIndex(id: InsightRowId): number
  subscribe(listener: RowModelListener): () => void
}

export interface RowModelChange {
  version: number
  type: 'reset' | 'expand' | 'collapse' | 'loading' | 'loaded' | 'error'
  rowId?: InsightRowId
  index?: number
  count?: number
}

export type RowModelListener = (change: RowModelChange) => void

export interface FlatRowModelOptions<TRow> {
  getRowId: (row: TRow, index: number) => InsightRowId
}

export class FlatRowModel<TRow> implements InsightRowModel<TRow> {
  readonly kind = 'flat'
  version = 0

  private rows: readonly TRow[]
  private readonly resolveId: (row: TRow, index: number) => InsightRowId
  private idToIndex: Map<InsightRowId, number> | undefined
  private readonly listeners = new Set<RowModelListener>()

  constructor(rows: readonly TRow[], options: FlatRowModelOptions<TRow>) {
    this.rows = rows
    this.resolveId = options.getRowId
  }

  getRowCount(): number {
    return this.rows.length
  }

  getRow(index: number): TRow | undefined {
    return this.rows[index]
  }

  getRowId(index: number): InsightRowId | undefined {
    const row = this.rows[index]
    return row === undefined ? undefined : this.resolveId(row, index)
  }

  getRowMeta(index: number, target = createRowMeta()): RowMeta | undefined {
    const row = this.rows[index]
    if (row === undefined) return undefined
    target.id = this.resolveId(row, index)
    target.depth = 0
    target.parentId = undefined
    target.expandable = false
    target.expanded = false
    target.loading = false
    target.error = undefined
    return target
  }

  findRowIndex(id: InsightRowId): number {
    if (!this.idToIndex) this.idToIndex = this.createIndex()
    return this.idToIndex.get(id) ?? -1
  }

  replaceRows(rows: readonly TRow[]): void {
    this.rows = rows
    this.idToIndex = undefined
    this.version += 1
    this.emit({ version: this.version, type: 'reset', count: rows.length })
  }

  subscribe(listener: RowModelListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private createIndex(): Map<InsightRowId, number> {
    const indexById = new Map<InsightRowId, number>()
    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index]
      if (row !== undefined) indexById.set(this.resolveId(row, index), index)
    }
    return indexById
  }

  private emit(change: RowModelChange): void {
    this.listeners.forEach((listener) => listener(change))
  }
}

export interface TreeRowModelOptions<TRow> {
  getRowId: (row: TRow) => InsightRowId
  /** Cheap hint used to decide whether to show an expansion affordance. */
  hasChildren?: (row: TRow) => boolean
  /** Synchronous children are still materialized only on first expansion. */
  getChildren?: (row: TRow) => readonly TRow[] | undefined
  /** Invoked only when getChildren does not return a value. */
  loadChildren?: (row: TRow) => Promise<readonly TRow[]>
  defaultExpanded?: (row: TRow, depth: number) => boolean
}

type ChildState = 'unloaded' | 'loading' | 'loaded' | 'error'

interface TreeNode<TRow> {
  id: InsightRowId
  row: TRow
  parent: TreeNode<TRow> | undefined
  depth: number
  expandable: boolean
  expanded: boolean
  childState: ChildState
  children: TreeNode<TRow>[] | undefined
  loadingPromise: Promise<void> | undefined
  error: unknown
}

/**
 * Incrementally flattened tree model. Root rows and node lookup are O(1); child
 * rows do not exist until first expansion. Expand/collapse mutations update the
 * visible array in place so virtualizers keep a stable model instance.
 */
export class TreeRowModel<TRow> implements InsightRowModel<TRow> {
  readonly kind = 'tree'
  version = 0

  private readonly options: TreeRowModelOptions<TRow>
  private readonly nodesById = new Map<InsightRowId, TreeNode<TRow>>()
  private readonly listeners = new Set<RowModelListener>()
  private roots: TreeNode<TRow>[] = []
  private visible: TreeNode<TRow>[] = []

  constructor(rows: readonly TRow[], options: TreeRowModelOptions<TRow>) {
    this.options = options
    this.reset(rows, false)
  }

  getRowCount(): number {
    return this.visible.length
  }

  getRow(index: number): TRow | undefined {
    return this.visible[index]?.row
  }

  getRowId(index: number): InsightRowId | undefined {
    return this.visible[index]?.id
  }

  getRowMeta(index: number, target = createRowMeta()): RowMeta | undefined {
    const node = this.visible[index]
    if (!node) return undefined
    target.id = node.id
    target.depth = node.depth
    target.parentId = node.parent?.id
    target.expandable = node.expandable
    target.expanded = node.expanded
    target.loading = node.childState === 'loading'
    target.error = node.error
    return target
  }

  findRowIndex(id: InsightRowId): number {
    const node = this.nodesById.get(id)
    return node ? this.visible.indexOf(node) : -1
  }

  hasRow(id: InsightRowId): boolean {
    return this.nodesById.has(id)
  }

  isExpanded(id: InsightRowId): boolean {
    return this.nodesById.get(id)?.expanded ?? false
  }

  async expand(id: InsightRowId): Promise<boolean> {
    const node = this.nodesById.get(id)
    if (!node || !node.expandable) return false
    if (node.expanded && node.childState === 'loaded') return true

    node.expanded = true
    this.bump({ type: 'expand', rowId: id, index: this.visible.indexOf(node) })

    if (node.childState !== 'loaded') await this.ensureChildren(node)
    if (!node.expanded || node.childState !== 'loaded') return false

    const nodeIndex = this.visible.indexOf(node)
    if (nodeIndex < 0 || this.visible[nodeIndex + 1]?.parent === node) return true

    const additions: TreeNode<TRow>[] = []
    this.collectExpandedDescendants(node, additions)
    insertItems(this.visible, nodeIndex + 1, additions)
    if (additions.length > 0) {
      this.bump({ type: 'expand', rowId: id, index: nodeIndex + 1, count: additions.length })
      // A default-expanded child starts its own lazy load only after becoming visible.
      for (let index = 0; index < additions.length; index += 1) {
        const child = additions[index]
        if (child?.expanded && child.childState !== 'loaded') void this.expand(child.id)
      }
    }
    return true
  }

  collapse(id: InsightRowId): boolean {
    const node = this.nodesById.get(id)
    if (!node || !node.expanded) return false
    node.expanded = false

    const index = this.visible.indexOf(node)
    let removeCount = 0
    if (index >= 0) {
      for (let cursor = index + 1; cursor < this.visible.length; cursor += 1) {
        const candidate = this.visible[cursor]
        if (!candidate || candidate.depth <= node.depth) break
        removeCount += 1
      }
      removeItems(this.visible, index + 1, removeCount)
    }

    this.bump({ type: 'collapse', rowId: id, index, count: removeCount })
    return true
  }

  async toggle(id: InsightRowId): Promise<boolean> {
    return this.isExpanded(id) ? this.collapse(id) : this.expand(id)
  }

  replaceRoots(rows: readonly TRow[]): void {
    this.reset(rows, true)
  }

  subscribe(listener: RowModelListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private reset(rows: readonly TRow[], notify: boolean): void {
    this.nodesById.clear()
    this.roots = this.materialize(rows, undefined)
    this.visible = this.roots.slice()

    if (notify) {
      this.version += 1
      this.emit({ version: this.version, type: 'reset', count: this.visible.length })
    }

    // Eagerly requested expansion still uses the same lazy-loading path.
    for (let index = 0; index < this.roots.length; index += 1) {
      const root = this.roots[index]
      if (root?.expanded) void this.expand(root.id)
    }
  }

  private materialize(
    rows: readonly TRow[],
    parent: TreeNode<TRow> | undefined,
  ): TreeNode<TRow>[] {
    const nodes = new Array<TreeNode<TRow>>(rows.length)
    const depth = parent ? parent.depth + 1 : 0

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (row === undefined) continue
      const id = this.options.getRowId(row)
      if (this.nodesById.has(id)) {
        throw new Error(`Tree row id must be unique: ${String(id)}`)
      }

      const expandable = this.options.hasChildren
        ? this.options.hasChildren(row)
        : Boolean(this.options.getChildren || this.options.loadChildren)
      const node: TreeNode<TRow> = {
        id,
        row,
        parent,
        depth,
        expandable,
        expanded: expandable && (this.options.defaultExpanded?.(row, depth) ?? false),
        childState: expandable ? 'unloaded' : 'loaded',
        children: expandable ? undefined : [],
        loadingPromise: undefined,
        error: undefined,
      }
      nodes[index] = node
      this.nodesById.set(id, node)
    }
    return nodes
  }

  private async ensureChildren(node: TreeNode<TRow>): Promise<void> {
    if (node.childState === 'loaded') return
    if (node.loadingPromise) return node.loadingPromise

    const synchronous = this.options.getChildren?.(node.row)
    if (synchronous !== undefined) {
      node.children = this.materialize(synchronous, node)
      node.childState = 'loaded'
      node.expandable = node.children.length > 0
      if (!node.expandable) node.expanded = false
      this.bump({ type: 'loaded', rowId: node.id, count: node.children.length })
      return
    }

    if (!this.options.loadChildren) {
      node.children = []
      node.childState = 'loaded'
      node.expandable = false
      node.expanded = false
      this.bump({ type: 'loaded', rowId: node.id, count: 0 })
      return
    }

    node.childState = 'loading'
    node.error = undefined
    this.bump({ type: 'loading', rowId: node.id })

    const pending = this.options
      .loadChildren(node.row)
      .then((rows) => {
        node.children = this.materialize(rows, node)
        node.childState = 'loaded'
        node.expandable = node.children.length > 0
        if (!node.expandable) node.expanded = false
        this.bump({ type: 'loaded', rowId: node.id, count: node.children.length })
      })
      .catch((error: unknown) => {
        node.childState = 'error'
        node.error = error
        this.bump({ type: 'error', rowId: node.id })
      })
      .finally(() => {
        node.loadingPromise = undefined
      })

    node.loadingPromise = pending
    return pending
  }

  private collectExpandedDescendants(
    parent: TreeNode<TRow>,
    output: TreeNode<TRow>[],
  ): void {
    const children = parent.children
    if (!children || children.length === 0) return

    // Iterative traversal avoids overflowing on deeply nested Insight hierarchies.
    const stack: TreeNode<TRow>[] = []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child) stack.push(child)
    }

    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) continue
      output.push(node)
      if (!node.expanded || node.childState !== 'loaded' || !node.children) continue
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index]
        if (child) stack.push(child)
      }
    }
  }

  private bump(change: Omit<RowModelChange, 'version'>): void {
    this.version += 1
    this.emit({ ...change, version: this.version })
  }

  private emit(change: RowModelChange): void {
    this.listeners.forEach((listener) => listener(change))
  }
}

export function createRowMeta(): RowMeta {
  return {
    id: '',
    depth: 0,
    parentId: undefined,
    expandable: false,
    expanded: false,
    loading: false,
    error: undefined,
  }
}

function insertItems<T>(target: T[], at: number, additions: readonly T[]): void {
  const count = additions.length
  if (count === 0) return
  const previousLength = target.length
  target.length = previousLength + count
  for (let index = previousLength - 1; index >= at; index -= 1) {
    target[index + count] = target[index] as T
  }
  for (let index = 0; index < count; index += 1) {
    target[at + index] = additions[index] as T
  }
}

function removeItems<T>(target: T[], at: number, count: number): void {
  if (count <= 0) return
  const end = at + count
  for (let index = end; index < target.length; index += 1) {
    target[index - count] = target[index] as T
  }
  target.length = Math.max(at, target.length - count)
}
