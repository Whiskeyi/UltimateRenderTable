import type { MergedCellRange } from '@ultigrid/core'
import type { RowMeta } from './rowModel'

export interface AdjacentMergeColumn<TRow> {
  /** Zero-based data-column coordinate. */
  columnIndex: number
  /** Maps raw column values to stable grouping keys. */
  getKey?: (value: unknown, row: TRow, rowIndex: number) => unknown
  /** Defaults to Object.is. */
  equals?: (previous: unknown, current: unknown) => boolean
  /** Empty strings, null, and undefined do not merge by default. */
  mergeEmpty?: boolean
}

export interface AdjacentMergeOptions<TRow> {
  /** Ordered outer-to-inner; deeper runs continue only while every prefix matches. */
  columns: readonly (number | AdjacentMergeColumn<TRow>)[]
  /** Defaults to 2. */
  minRowSpan?: number
  /** Defaults to 100,000 and throws before a larger result is returned. */
  maxGeneratedRegions?: number
  /** Defaults to siblings; expandable, loading, and failed tree rows are boundaries. */
  treeBoundary?: 'siblings' | 'none'
}

interface AdjacentMergeSource<TRow> {
  rowCount: number
  columnCount: number
  getRow: (index: number) => TRow | undefined
  getColumnValue: (columnIndex: number, row: TRow, rowIndex: number) => unknown
  getRowMeta?: (index: number, target?: RowMeta) => RowMeta | undefined
}

interface RuntimeDimension<TRow> extends AdjacentMergeColumn<TRow> {
  blockers: RowInterval[]
  blockerCursor: number
}

interface RowInterval {
  start: number
  end: number
}

const DEFAULT_MAX_REGIONS = 100_000

export function buildAdjacentMerges<TRow>(
  source: AdjacentMergeSource<TRow>,
  options: AdjacentMergeOptions<TRow>,
  explicitMerges: readonly MergedCellRange[] = [],
): MergedCellRange[] {
  assertCount(source.rowCount, 'rowCount')
  assertCount(source.columnCount, 'columnCount')

  const minRowSpan = options.minRowSpan ?? 2
  if (!Number.isSafeInteger(minRowSpan) || minRowSpan < 2) {
    throw new RangeError(`minRowSpan must be an integer at least 2; received ${minRowSpan}`)
  }
  const maxGeneratedRegions = options.maxGeneratedRegions ?? DEFAULT_MAX_REGIONS
  if (!Number.isSafeInteger(maxGeneratedRegions) || maxGeneratedRegions <= 0) {
    throw new RangeError(
      `maxGeneratedRegions must be a positive safe integer; received ${maxGeneratedRegions}`,
    )
  }

  const dimensions = normalizeDimensions(options.columns, source.columnCount)
  if (dimensions.length === 0 || source.rowCount === 0) return []
  attachExplicitBlockers(dimensions, explicitMerges, source.rowCount)

  const result: MergedCellRange[] = []
  const reservedIds = new Set(
    explicitMerges.flatMap((merge) => merge.id === undefined ? [] : [merge.id]),
  )
  const runStarts = new Int32Array(dimensions.length)
  runStarts.fill(-1)
  let previousKeys = new Array<unknown>(dimensions.length)
  let currentKeys = new Array<unknown>(dimensions.length)
  let previousValid = new Uint8Array(dimensions.length)
  let currentValid = new Uint8Array(dimensions.length)
  const metaTargets = [createMetaTarget(), createMetaTarget()] as const
  let previousMeta: RowMeta | undefined
  let previousRowExists = false

  const closeRun = (depth: number, rowEnd: number) => {
    const rowStart = runStarts[depth]!
    runStarts[depth] = -1
    if (rowStart < 0 || rowEnd - rowStart + 1 < minRowSpan) return
    if (result.length >= maxGeneratedRegions) {
      throw new RangeError(
        `Adjacent merging generated more than ${maxGeneratedRegions.toLocaleString('en-US')} regions`,
      )
    }
    const columnIndex = dimensions[depth]!.columnIndex
    const baseId = `adjacent:${columnIndex}:${rowStart}:${rowEnd}`
    let id = baseId
    for (let suffix = 1; reservedIds.has(id); suffix += 1) id = `${baseId}:${suffix}`
    reservedIds.add(id)
    result.push({
      id,
      rowStart,
      rowEnd,
      columnStart: columnIndex,
      columnEnd: columnIndex,
    })
  }

  for (let rowIndex = 0; rowIndex < source.rowCount; rowIndex += 1) {
    const row = source.getRow(rowIndex)
    const currentMeta = options.treeBoundary === 'none' || !source.getRowMeta
      ? undefined
      : source.getRowMeta(rowIndex, metaTargets[rowIndex % 2])
    const treeContinues = previousRowExists
      && row !== undefined
      && sharesTreeBoundary(previousMeta, currentMeta, options.treeBoundary ?? 'siblings')
    const firstBlockedDepth = findFirstBlockedDepth(dimensions, rowIndex)
    const treeEligible = options.treeBoundary === 'none' || isTreeMergeable(currentMeta)
    let prefixContinues = treeContinues

    currentValid.fill(0)
    for (let depth = 0; depth < dimensions.length; depth += 1) {
      const dimension = dimensions[depth]!
      const blocked = depth >= firstBlockedDepth
      let key: unknown
      let valid = false

      if (row !== undefined && treeEligible && !blocked) {
        const value = source.getColumnValue(dimension.columnIndex, row, rowIndex)
        key = dimension.getKey ? dimension.getKey(value, row, rowIndex) : value
        valid = dimension.mergeEmpty === true || (!isEmpty(value) && !isEmpty(key))
      }

      currentKeys[depth] = key
      currentValid[depth] = valid ? 1 : 0
      const continues = prefixContinues
        && valid
        && previousValid[depth] === 1
        && (dimension.equals ?? Object.is)(previousKeys[depth], key)

      if (!continues) {
        closeRun(depth, rowIndex - 1)
        if (valid) runStarts[depth] = rowIndex
      }
      prefixContinues = continues
    }

    previousMeta = currentMeta
    previousRowExists = row !== undefined
    const keysToReuse = previousKeys
    previousKeys = currentKeys
    currentKeys = keysToReuse
    const validityToReuse = previousValid
    previousValid = currentValid
    currentValid = validityToReuse
  }

  for (let depth = 0; depth < dimensions.length; depth += 1) {
    closeRun(depth, source.rowCount - 1)
  }
  return result
}

function normalizeDimensions<TRow>(
  columns: readonly (number | AdjacentMergeColumn<TRow>)[],
  columnCount: number,
): RuntimeDimension<TRow>[] {
  const byColumn = new Map<number, RuntimeDimension<TRow>>()
  const result: RuntimeDimension<TRow>[] = []
  for (const entry of columns) {
    const dimension = typeof entry === 'number' ? { columnIndex: entry } : entry
    const columnIndex = dimension.columnIndex
    if (!Number.isSafeInteger(columnIndex) || columnIndex < 0 || columnIndex >= columnCount) {
      throw new RangeError(
        `Adjacent merge column must be within 0..${Math.max(-1, columnCount - 1)}; received ${columnIndex}`,
      )
    }
    if (byColumn.has(columnIndex)) {
      throw new RangeError(`Adjacent merge column ${columnIndex} is configured more than once`)
    }
    const runtime = { ...dimension, blockers: [], blockerCursor: 0 }
    byColumn.set(columnIndex, runtime)
    result.push(runtime)
  }
  return result
}

function attachExplicitBlockers<TRow>(
  dimensions: RuntimeDimension<TRow>[],
  explicitMerges: readonly MergedCellRange[],
  rowCount: number,
): void {
  for (const merge of explicitMerges) {
    const rowStart = Math.max(0, Math.min(merge.rowStart, merge.rowEnd))
    const rowEnd = Math.min(rowCount - 1, Math.max(merge.rowStart, merge.rowEnd))
    if (rowStart > rowEnd) continue
    const columnStart = Math.min(merge.columnStart, merge.columnEnd)
    const columnEnd = Math.max(merge.columnStart, merge.columnEnd)
    let firstDepth = -1
    for (let depth = 0; depth < dimensions.length; depth += 1) {
      const columnIndex = dimensions[depth]!.columnIndex
      if (columnIndex >= columnStart && columnIndex <= columnEnd) {
        firstDepth = depth
        break
      }
    }
    if (firstDepth < 0) continue
    for (let depth = firstDepth; depth < dimensions.length; depth += 1) {
      dimensions[depth]!.blockers.push({ start: rowStart, end: rowEnd })
    }
  }

  for (const dimension of dimensions) {
    dimension.blockers = coalesceIntervals(dimension.blockers)
  }
}

function coalesceIntervals(intervals: RowInterval[]): RowInterval[] {
  if (intervals.length < 2) return intervals
  intervals.sort((left, right) => left.start - right.start || left.end - right.end)
  const result: RowInterval[] = []
  for (const interval of intervals) {
    const previous = result[result.length - 1]
    if (!previous || interval.start > previous.end + 1) result.push({ ...interval })
    else previous.end = Math.max(previous.end, interval.end)
  }
  return result
}

function findFirstBlockedDepth<TRow>(
  dimensions: RuntimeDimension<TRow>[],
  rowIndex: number,
): number {
  for (let depth = 0; depth < dimensions.length; depth += 1) {
    const dimension = dimensions[depth]!
    while (
      dimension.blockers[dimension.blockerCursor]
      && dimension.blockers[dimension.blockerCursor]!.end < rowIndex
    ) {
      dimension.blockerCursor += 1
    }
    const interval = dimension.blockers[dimension.blockerCursor]
    if (interval && interval.start <= rowIndex && rowIndex <= interval.end) return depth
  }
  return dimensions.length
}

function sharesTreeBoundary(
  previous: RowMeta | undefined,
  current: RowMeta | undefined,
  boundary: 'siblings' | 'none',
): boolean {
  if (boundary === 'none') return true
  if (!previous && !current) return true
  return Boolean(
    previous
    && current
    && isTreeMergeable(previous)
    && isTreeMergeable(current)
    && previous.depth === current.depth
    && Object.is(previous.parentId, current.parentId),
  )
}

function isTreeMergeable(meta: RowMeta | undefined): boolean {
  return !meta || (!meta.expandable && !meta.loading && meta.error == null)
}

function isEmpty(value: unknown): boolean {
  return value === '' || value === null || value === undefined
}

function createMetaTarget(): RowMeta {
  return {
    id: 0,
    depth: 0,
    parentId: undefined,
    expandable: false,
    expanded: false,
    loading: false,
    error: undefined,
  }
}

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer; received ${value}`)
  }
}
