export interface GridBounds {
  /** Inclusive row bounds. */
  readonly rowStart: number
  readonly rowEnd: number
  /** Inclusive column bounds. */
  readonly columnStart: number
  readonly columnEnd: number
}

export interface MergeRegion<T = unknown> extends GridBounds {
  readonly id: string
  readonly data?: T
}

export interface MergeIndexOptions {
  /** Maximum entries per packed R-tree node. Defaults to 16. */
  maxEntries?: number
}

type RTreeNode<T> = LeafNode<T> | BranchNode<T>

interface LeafNode<T> extends GridBounds {
  readonly leaf: true
  readonly entries: readonly MergeRegion<T>[]
}

interface BranchNode<T> extends GridBounds {
  readonly leaf: false
  readonly entries: readonly RTreeNode<T>[]
}

/**
 * Sparse two-dimensional index for merged cells.
 *
 * Mutations update only an id Map and mark the packed R-tree dirty. The next
 * spatial query bulk-builds it once, which makes loading many merges cheap and
 * represents a merge spanning 10k columns as one rectangle (never 10k cells).
 * Prefer replaceAll for bulk changes; interleaving each set with a query would
 * intentionally rebuild the packed tree for every query.
 */
export class MergeIndex<T = unknown> {
  private readonly regions = new Map<string, MergeRegion<T>>()
  private readonly maxEntries: number
  private root: RTreeNode<T> | undefined
  private dirty = false

  constructor(
    initial?: Iterable<MergeRegion<T>>,
    options: MergeIndexOptions = {},
  ) {
    const maxEntries = options.maxEntries ?? 16
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 4) {
      throw new RangeError(`maxEntries must be an integer at least 4; received ${maxEntries}`)
    }
    this.maxEntries = maxEntries
    if (initial) this.replaceAll(initial)
  }

  get size(): number {
    return this.regions.size
  }

  get(id: string): MergeRegion<T> | undefined {
    return this.regions.get(id)
  }

  has(id: string): boolean {
    return this.regions.has(id)
  }

  set(region: MergeRegion<T>): void {
    assertRegion(region)
    const stableRegion = Object.freeze({ ...region }) as MergeRegion<T>
    this.regions.set(region.id, stableRegion)
    this.root = undefined
    this.dirty = true
  }

  remove(id: string): boolean {
    const removed = this.regions.delete(id)
    if (removed) {
      // Release stale tree nodes (and their region/data references) eagerly.
      this.root = undefined
      this.dirty = this.regions.size > 0
    }
    return removed
  }

  clear(): void {
    this.regions.clear()
    this.root = undefined
    this.dirty = false
  }

  /** Batch replacement; the spatial tree is built lazily on the next query. */
  replaceAll(regions: Iterable<MergeRegion<T>>): void {
    // Validate into a temporary Map so a malformed batch cannot leave the id
    // Map and the previous spatial tree describing different datasets.
    const nextRegions = new Map<string, MergeRegion<T>>()
    for (const region of regions) {
      assertRegion(region)
      nextRegions.set(region.id, Object.freeze({ ...region }) as MergeRegion<T>)
    }

    this.regions.clear()
    for (const [id, region] of nextRegions) this.regions.set(id, region)
    this.root = undefined
    this.dirty = this.regions.size > 0
  }

  values(): IterableIterator<MergeRegion<T>> {
    return this.regions.values()
  }

  /** Returns the first region containing the point, or undefined. */
  getAt(row: number, column: number): MergeRegion<T> | undefined {
    assertCoordinate(row, 'row')
    assertCoordinate(column, 'column')
    const root = this.ensureTree()
    if (!root || !containsPoint(root, row, column)) return undefined

    const stack: RTreeNode<T>[] = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.leaf) {
        for (const region of node.entries) {
          if (containsPoint(region, row, column)) return region
        }
      } else {
        for (const child of node.entries) {
          if (containsPoint(child, row, column)) stack.push(child)
        }
      }
    }
    return undefined
  }

  /**
   * Returns every region intersecting inclusive `bounds`.
   * If `output` is supplied it is cleared and reused to avoid allocations.
   */
  query(bounds: GridBounds, output: MergeRegion<T>[] = []): MergeRegion<T>[] {
    assertBounds(bounds)
    output.length = 0
    const root = this.ensureTree()
    if (!root || !intersects(root, bounds)) return output

    const stack: RTreeNode<T>[] = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.leaf) {
        for (const region of node.entries) {
          if (intersects(region, bounds)) output.push(region)
        }
      } else {
        for (const child of node.entries) {
          if (intersects(child, bounds)) stack.push(child)
        }
      }
    }
    return output
  }

  private ensureTree(): RTreeNode<T> | undefined {
    if (!this.dirty) return this.root
    this.root = buildPackedTree([...this.regions.values()], this.maxEntries)
    this.dirty = false
    return this.root
  }
}

function buildPackedTree<T>(
  regions: MergeRegion<T>[],
  maxEntries: number,
): RTreeNode<T> | undefined {
  if (regions.length === 0) return undefined
  if (regions.length <= maxEntries) return makeLeaf(regions)

  let level: RTreeNode<T>[] = spatialGroups(regions, maxEntries).map(makeLeaf)
  while (level.length > maxEntries) {
    level = spatialGroups(level, maxEntries).map(makeBranch)
  }
  return level.length === 1 ? level[0] : makeBranch(level)
}

/** Sort-Tile-Recursive packing gives good locality on both grid dimensions. */
function spatialGroups<T extends GridBounds>(items: T[], maxEntries: number): T[][] {
  if (items.length <= maxEntries) return [items]

  const groupCount = Math.ceil(items.length / maxEntries)
  const sliceCount = Math.ceil(Math.sqrt(groupCount))
  const sliceCapacity = Math.ceil(items.length / sliceCount / maxEntries) * maxEntries
  const sorted = [...items].sort(compareRowCenter)
  const groups: T[][] = []

  for (let sliceStart = 0; sliceStart < sorted.length; sliceStart += sliceCapacity) {
    const slice = sorted.slice(sliceStart, sliceStart + sliceCapacity).sort(compareColumnCenter)
    for (let index = 0; index < slice.length; index += maxEntries) {
      groups.push(slice.slice(index, index + maxEntries))
    }
  }
  return groups
}

function makeLeaf<T>(entries: MergeRegion<T>[]): LeafNode<T> {
  return { leaf: true, entries, ...boundsOf(entries) }
}

function makeBranch<T>(entries: RTreeNode<T>[]): BranchNode<T> {
  return { leaf: false, entries, ...boundsOf(entries) }
}

function boundsOf(entries: readonly GridBounds[]): GridBounds {
  let rowStart = Number.POSITIVE_INFINITY
  let rowEnd = Number.NEGATIVE_INFINITY
  let columnStart = Number.POSITIVE_INFINITY
  let columnEnd = Number.NEGATIVE_INFINITY

  for (const entry of entries) {
    rowStart = Math.min(rowStart, entry.rowStart)
    rowEnd = Math.max(rowEnd, entry.rowEnd)
    columnStart = Math.min(columnStart, entry.columnStart)
    columnEnd = Math.max(columnEnd, entry.columnEnd)
  }
  return { rowStart, rowEnd, columnStart, columnEnd }
}

function compareRowCenter(a: GridBounds, b: GridBounds): number {
  return a.rowStart + a.rowEnd - (b.rowStart + b.rowEnd)
}

function compareColumnCenter(a: GridBounds, b: GridBounds): number {
  return a.columnStart + a.columnEnd - (b.columnStart + b.columnEnd)
}

function intersects(a: GridBounds, b: GridBounds): boolean {
  return a.rowStart <= b.rowEnd
    && a.rowEnd >= b.rowStart
    && a.columnStart <= b.columnEnd
    && a.columnEnd >= b.columnStart
}

function containsPoint(bounds: GridBounds, row: number, column: number): boolean {
  return row >= bounds.rowStart
    && row <= bounds.rowEnd
    && column >= bounds.columnStart
    && column <= bounds.columnEnd
}

function assertRegion(region: MergeRegion<unknown>): void {
  if (typeof region.id !== 'string' || region.id.length === 0) {
    throw new TypeError('merge region id must be a non-empty string')
  }
  assertBounds(region)
}

function assertBounds(bounds: GridBounds): void {
  assertCoordinate(bounds.rowStart, 'rowStart')
  assertCoordinate(bounds.rowEnd, 'rowEnd')
  assertCoordinate(bounds.columnStart, 'columnStart')
  assertCoordinate(bounds.columnEnd, 'columnEnd')
  if (bounds.rowStart > bounds.rowEnd) {
    throw new RangeError('rowStart must be less than or equal to rowEnd')
  }
  if (bounds.columnStart > bounds.columnEnd) {
    throw new RangeError('columnStart must be less than or equal to columnEnd')
  }
}

function assertCoordinate(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer; received ${value}`)
  }
}
