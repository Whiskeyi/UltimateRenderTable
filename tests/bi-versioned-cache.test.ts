import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LruCache,
  resolveViewportContentVersion,
  UltiGridInsight,
  type InsightColumnDefinition,
  type UltiGridInsightProps,
} from '../src/bi/UltiGridInsight'
import type { ConditionalFormatRule } from '../src/bi/conditionalFormatting'

const hookHarness = vi.hoisted(() => {
  let cursor = 0
  let slots: Array<{
    value: unknown
    dependencies: readonly unknown[] | undefined
  }> = []
  const dependenciesChanged = (
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ) => !previous || !next
    || previous.length !== next.length
    || previous.some((value, index) => !Object.is(value, next[index]))

  const memo = <T>(factory: () => T, dependencies: readonly unknown[] | undefined): T => {
    const index = cursor++
    const slot = slots[index]
    if (!slot || dependenciesChanged(slot.dependencies, dependencies)) {
      const value = factory()
      slots[index] = { value, dependencies }
      return value
    }
    return slot.value as T
  }

  return {
    begin() {
      cursor = 0
    },
    reset() {
      cursor = 0
      slots = []
    },
    useMemo: memo,
    useCallback<T>(callback: T, dependencies: readonly unknown[] | undefined) {
      return memo(() => callback, dependencies)
    },
  }
})

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useCallback: hookHarness.useCallback,
  useEffect: () => undefined,
  useMemo: hookHarness.useMemo,
  useRef: <T>(initialValue: T) => ({ current: initialValue }),
  useState: <T>(initialValue: T | (() => T)) => [
    typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue,
    () => undefined,
  ],
  useSyncExternalStore: (
    _subscribe: (notify: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => getSnapshot(),
}))

interface TestRow {
  id: string
  value: number
}

interface ViewportElementProps {
  getCell: (row: number, column: number) => {
    value: unknown
    text?: string
    meta?: unknown
    style?: CSSProperties
  }
  renderCell: (context: {
    cell: {
      value: unknown
      text?: string
      meta?: unknown
    }
    selected: boolean
    active: boolean
  }) => ReactNode
}

function renderInsight(props: UltiGridInsightProps<TestRow>): ViewportElementProps {
  hookHarness.begin()
  const root = UltiGridInsight(props) as ReactElement<{ children: ReactNode[] }>
  return (root.props.children[0] as ReactElement<ViewportElementProps>).props
}

function renderConditionalFormat(viewport: ViewportElementProps) {
  const cell = viewport.getCell(0, 0)
  const rendered = viewport.renderCell({ cell, selected: false, active: false })
  return (rendered as ReactElement<{ conditionalFormat?: { color?: string } }>).props
    .conditionalFormat
}

describe('Insight versioned row caches', () => {
  beforeEach(() => hookHarness.reset())

  it('retains recently-read entries when the bounded cache evicts', () => {
    const cache = new LruCache<number, string>(2)
    cache.set(0, 'leading')
    cache.set(1, 'middle')
    expect(cache.get(0)).toBe('leading')

    cache.set(2, 'trailing')

    expect(cache.get(0)).toBe('leading')
    expect(cache.get(1)).toBeUndefined()
    expect(cache.get(2)).toBe('trailing')
  })

  it('invalidates cached rows from a stable source when contentVersion changes', () => {
    const rows: TestRow[] = [{ id: 'row-1', value: 1 }]
    const columns: InsightColumnDefinition<TestRow>[] = [{
      id: 'value',
      getValue: (row) => row.value,
    }]
    const baseProps = {
      rows,
      columns,
      showHeader: false,
      showRowNumbers: false,
    } satisfies Omit<UltiGridInsightProps<TestRow>, 'contentVersion'>

    expect(renderInsight({ ...baseProps, contentVersion: 1 }).getCell(0, 0).value).toBe(1)
    rows[0] = { id: 'row-1', value: 2 }
    expect(renderInsight({ ...baseProps, contentVersion: 1 }).getCell(0, 0).value).toBe(1)
    expect(renderInsight({ ...baseProps, contentVersion: 2 }).getCell(0, 0).value).toBe(2)
  })

  it('invalidates a stable lazy-column getter when contentVersion changes', () => {
    const rows = [{ id: 'row-1', value: 1 }]
    let currentColumn: InsightColumnDefinition<TestRow> = {
      id: 'old',
      getValue: (row) => row.value,
    }
    const getColumn = () => currentColumn
    const baseProps = {
      rows,
      columnCount: 1,
      getColumn,
      showHeader: false,
      showRowNumbers: false,
    } satisfies Omit<UltiGridInsightProps<TestRow>, 'contentVersion'>

    const first = renderInsight({ ...baseProps, contentVersion: 1 })
    expect(first.getCell(0, 0).meta).toMatchObject({
      column: { id: 'old' },
    })

    currentColumn = {
      id: 'new',
      getValue: (row) => row.value,
    }
    const staleEpoch = renderInsight({ ...baseProps, contentVersion: 1 })
    expect(staleEpoch.getCell(0, 0).meta).toMatchObject({
      column: { id: 'old' },
    })

    const nextEpoch = renderInsight({ ...baseProps, contentVersion: 2 })
    expect(nextEpoch.getCell(0, 0).meta).toMatchObject({
      column: { id: 'new' },
    })
  })

  it('refreshes stable lazy-column surface styles for a new layout version', () => {
    const rows = [{ id: 'row-1', value: 1 }]
    const column: InsightColumnDefinition<TestRow> = {
      id: 'value',
      getValue: (row) => row.value,
      visualStyle: { color: '#991b1b' },
    }
    const baseProps = {
      rows,
      columnCount: 1,
      getColumn: () => column,
      showHeader: false,
      showRowNumbers: false,
    } satisfies Omit<UltiGridInsightProps<TestRow>, 'columnLayoutVersion'>

    const first = renderInsight({ ...baseProps, columnLayoutVersion: 1 })
    expect(first.getCell(0, 0).style?.color).toBe('#991b1b')

    column.visualStyle = { color: '#166534' }
    const staleLayout = renderInsight({ ...baseProps, columnLayoutVersion: 1 })
    expect(staleLayout.getCell(0, 0).style?.color).toBe('#991b1b')

    const nextLayout = renderInsight({ ...baseProps, columnLayoutVersion: 2 })
    expect(nextLayout.getCell(0, 0).style?.color).toBe('#166534')
  })

  it('recompiles stable column and global conditional rules for a new contentVersion', () => {
    const rows = [{ id: 'row-1', value: 1 }]
    const columnRule: ConditionalFormatRule<TestRow, number> = {
      id: 'column-text',
      kind: 'text',
      style: { color: '#991b1b' },
    }
    const globalRule: ConditionalFormatRule<TestRow> = {
      id: 'global-text',
      kind: 'text',
      style: { color: '#1d4ed8' },
    }
    const conditionalRules = [globalRule]
    const column: InsightColumnDefinition<TestRow> = {
      id: 'value',
      getValue: (row) => row.value,
      conditionalRules: [columnRule],
    }
    const getColumn = () => column
    const baseProps = {
      rows,
      columnCount: 1,
      getColumn,
      conditionalRules,
      showHeader: false,
      showRowNumbers: false,
    } satisfies Omit<UltiGridInsightProps<TestRow>, 'contentVersion'>

    const first = renderInsight({ ...baseProps, contentVersion: 'v1' })
    expect(renderConditionalFormat(first)?.color).toBe('#991b1b')

    columnRule.style.color = '#166534'
    globalRule.style.color = '#7e22ce'
    const staleEpoch = renderInsight({ ...baseProps, contentVersion: 'v1' })
    expect(renderConditionalFormat(staleEpoch)?.color).toBe('#991b1b')

    const nextEpoch = renderInsight({ ...baseProps, contentVersion: 'v2' })
    expect(renderConditionalFormat(nextEpoch)?.color).toBe('#166534')

    column.conditionalRules = []
    const globalOnlyEpoch = renderInsight({ ...baseProps, contentVersion: 'v3' })
    expect(renderConditionalFormat(globalOnlyEpoch)?.color).toBe('#7e22ce')

    column.conditionalRules = [columnRule]
    columnRule.style.color = '#0f766e'
    const nextLayout = renderInsight({
      ...baseProps,
      contentVersion: 'v3',
      columnLayoutVersion: 1,
    })
    expect(renderConditionalFormat(nextLayout)?.color).toBe('#0f766e')
  })

  it('combines explicit contentVersion with rowModel version changes', () => {
    expect(resolveViewportContentVersion('schema-v1', 2))
      .not.toBe(resolveViewportContentVersion('schema-v1', 3))
    expect(resolveViewportContentVersion(undefined, 3)).toBe(3)
    expect(resolveViewportContentVersion('schema-v1', undefined)).toBe('schema-v1')
    expect(resolveViewportContentVersion(1, 3))
      .not.toBe(resolveViewportContentVersion('1', 3))
  })
})
