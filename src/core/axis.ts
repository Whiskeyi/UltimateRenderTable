export interface AxisOptions {
  count: number
  defaultSize: number
  overrides?: Iterable<readonly [index: number, size: number]>
  containerSize?: number
  stretch?: boolean
}

/**
 * Size/offset index for one table axis.
 *
 * Custom sizes stay sparse in a Map while a typed segment tree stores only
 * their delta from the default size. This keeps mutations and prefix lookups
 * at O(log count), including for 100k+ items. The shared tree traversal also
 * makes `indexAtOffset(getOffset(i)) === i` stable for fractional pixel sizes.
 */
export class Axis {
  private _count: number
  private _defaultSize: number
  private _containerSize: number
  private _stretch: boolean
  private readonly customSizes = new Map<number, number>()
  private treeCapacity: number
  private deltaTree: Float64Array

  constructor(options: AxisOptions) {
    this._count = assertCount(options.count)
    this._defaultSize = assertSize(options.defaultSize, 'defaultSize')
    this._containerSize = assertContainerSize(options.containerSize ?? 0)
    this._stretch = options.stretch ?? false
    this.treeCapacity = segmentTreeCapacity(this._count)
    this.deltaTree = new Float64Array(this.treeCapacity * 2)

    if (options.overrides) {
      for (const [index, size] of options.overrides) {
        this.assertIndex(index)
        const checkedSize = assertSize(size, `size at index ${index}`)
        if (checkedSize !== this._defaultSize) {
          this.customSizes.set(index, checkedSize)
        }
      }
      this.rebuildTree()
    }
  }

  get count(): number {
    return this._count
  }

  get defaultSize(): number {
    return this._defaultSize
  }

  get containerSize(): number {
    return this._containerSize
  }

  get stretch(): boolean {
    return this._stretch
  }

  get overrideCount(): number {
    return this.customSizes.size
  }

  /** Natural content size before optional container stretching. */
  get contentSize(): number {
    return this._count * this._defaultSize + this.deltaTree[1]!
  }

  /** Effective size, including optional stretch-to-container space. */
  get totalSize(): number {
    return this.contentSize + this.stretchExtra * this._count
  }

  getSize(index: number): number {
    this.assertIndex(index)
    return (this.customSizes.get(index) ?? this._defaultSize) + this.stretchExtra
  }

  getCustomSize(index: number): number | undefined {
    this.assertIndex(index)
    return this.customSizes.get(index)
  }

  /** Offset before index. `index === count` returns the total size. */
  getOffset(index: number): number {
    this.assertBoundary(index)
    if (index === this._count) return this.totalSize
    return this.prefixOffset(index, this._defaultSize + this.stretchExtra)
  }

  /**
   * Returns the item containing offset. Exact boundaries belong to the item
   * on their right. Values outside the axis are clamped; an empty axis is -1.
   */
  indexAtOffset(offset: number): number {
    if (this._count === 0) return -1
    if (Number.isNaN(offset)) return 0
    if (offset <= 0) return 0
    if (offset >= this.totalSize || offset === Number.POSITIVE_INFINITY) {
      return this._count - 1
    }

    const baseSize = this._defaultSize + this.stretchExtra
    let node = 1
    let rangeStart = 0
    let rangeEnd = this.treeCapacity
    let prefix = 0

    while (node < this.treeCapacity) {
      const midpoint = (rangeStart + rangeEnd) / 2
      const leftNode = node * 2
      const leftItemCount = Math.max(0, Math.min(midpoint, this._count) - rangeStart)
      const leftSize = this.deltaTree[leftNode]! + baseSize * leftItemCount
      const nextPrefix = prefix + leftSize

      // Exact boundaries move right, matching the half-open cell intervals.
      if (offset < nextPrefix) {
        node = leftNode
        rangeEnd = midpoint
      } else {
        node = leftNode + 1
        rangeStart = midpoint
        prefix = nextPrefix
      }
    }

    return Math.min(rangeStart, this._count - 1)
  }

  setSize(index: number, size: number): void {
    this.assertIndex(index)
    const checkedSize = assertSize(size, `size at index ${index}`)
    const previousSize = this.customSizes.get(index) ?? this._defaultSize
    if (previousSize === checkedSize) return

    if (checkedSize === this._defaultSize) {
      this.customSizes.delete(index)
    } else {
      this.customSizes.set(index, checkedSize)
    }

    this.setTreeDelta(index, checkedSize - this._defaultSize)
  }

  setSizes(entries: Iterable<readonly [index: number, size: number]>): void {
    for (const [index, size] of entries) this.setSize(index, size)
  }

  resetSize(index: number): void {
    this.setSize(index, this._defaultSize)
  }

  clearOverrides(): void {
    if (this.customSizes.size === 0) return
    this.customSizes.clear()
    this.deltaTree.fill(0)
  }

  setDefaultSize(size: number): void {
    const checkedSize = assertSize(size, 'defaultSize')
    if (checkedSize === this._defaultSize) return
    this._defaultSize = checkedSize

    // Overrides equal to the new default no longer need sparse storage.
    for (const [index, customSize] of this.customSizes) {
      if (customSize === checkedSize) this.customSizes.delete(index)
    }
    this.rebuildTree()
  }

  setCount(count: number): void {
    const checkedCount = assertCount(count)
    if (checkedCount === this._count) return
    this._count = checkedCount
    for (const index of this.customSizes.keys()) {
      if (index >= checkedCount) this.customSizes.delete(index)
    }
    this.treeCapacity = segmentTreeCapacity(checkedCount)
    this.deltaTree = new Float64Array(this.treeCapacity * 2)
    this.rebuildTree()
  }

  setContainerSize(size: number): void {
    this._containerSize = assertContainerSize(size)
  }

  setStretch(stretch: boolean): void {
    this._stretch = stretch
  }

  *overrides(): IterableIterator<readonly [index: number, size: number]> {
    yield* this.customSizes
  }

  private get stretchExtra(): number {
    const contentSize = this.contentSize
    if (!this._stretch || this._count === 0 || contentSize >= this._containerSize) {
      return 0
    }
    return (this._containerSize - contentSize) / this._count
  }

  /** Prefix traversal mirrors indexAtOffset's accumulation order exactly. */
  private prefixOffset(endExclusive: number, baseSize: number): number {
    let node = 1
    let rangeStart = 0
    let rangeEnd = this.treeCapacity
    let sum = 0

    while (node < this.treeCapacity) {
      const midpoint = (rangeStart + rangeEnd) / 2
      if (endExclusive < midpoint) {
        node *= 2
        rangeEnd = midpoint
        continue
      }

      const leftNode = node * 2
      const leftItemCount = Math.max(0, Math.min(midpoint, this._count) - rangeStart)
      sum += this.deltaTree[leftNode]! + baseSize * leftItemCount
      if (endExclusive === midpoint) return sum
      node = leftNode + 1
      rangeStart = midpoint
    }
    return sum
  }

  private setTreeDelta(index: number, delta: number): void {
    let cursor = this.treeCapacity + index
    this.deltaTree[cursor] = delta
    cursor >>= 1
    while (cursor > 0) {
      this.deltaTree[cursor] = this.deltaTree[cursor * 2]! + this.deltaTree[cursor * 2 + 1]!
      cursor >>= 1
    }
  }

  private rebuildTree(): void {
    this.deltaTree.fill(0)

    for (const [index, size] of this.customSizes) {
      const delta = size - this._defaultSize
      this.deltaTree[this.treeCapacity + index] = delta
    }

    for (let node = this.treeCapacity - 1; node > 0; node -= 1) {
      this.deltaTree[node] = this.deltaTree[node * 2]! + this.deltaTree[node * 2 + 1]!
    }
  }

  private assertIndex(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this._count) {
      throw new RangeError(`index ${index} is outside [0, ${this._count})`)
    }
  }

  private assertBoundary(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index > this._count) {
      throw new RangeError(`boundary ${index} is outside [0, ${this._count}]`)
    }
  }
}

function assertCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative safe integer; received ${count}`)
  }
  return count
}

function assertSize(size: number, label: string): number {
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`${label} must be a finite number greater than 0; received ${size}`)
  }
  return size
}

function assertContainerSize(size: number): number {
  if (!Number.isFinite(size) || size < 0) {
    throw new RangeError(`containerSize must be a finite number at least 0; received ${size}`)
  }
  return size
}

function segmentTreeCapacity(count: number): number {
  if (count <= 1) return 1
  return 2 ** Math.ceil(Math.log2(count))
}
