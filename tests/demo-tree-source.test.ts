import { describe, expect, it } from 'vitest'
import { createDemoRowSource } from '../src/demo/demoData'

function treeSource(
  rowCount: number,
  toggledRows: readonly number[] = [],
  expandedByDefault = true,
) {
  return createDemoRowSource(rowCount, {
    treeEnabled: true,
    toggledRows: new Set(toggledRows),
    expandedByDefault,
  })
}

describe('demo tree row source', () => {
  it('keeps the full flat row set when tree mode is disabled', () => {
    const flat = createDemoRowSource(36, {
      treeEnabled: false,
      toggledRows: new Set(),
      expandedByDefault: true,
    })

    expect(flat.rowCount).toBe(36)
    expect(flat.getRowMeta?.(1)?.depth).toBe(0)
    expect(flat.getRowMeta?.(1)?.expandable).toBe(false)
  })

  it('exposes root, branch, and leaf metadata across three levels', () => {
    const source = treeSource(18)

    expect(source.getRowMeta?.(0)).toMatchObject({
      id: 0,
      depth: 0,
      parentId: undefined,
      expandable: true,
      expanded: true,
    })
    expect(source.getRowMeta?.(1)).toMatchObject({
      id: 1,
      depth: 1,
      parentId: 0,
      expandable: true,
      expanded: true,
    })
    expect(source.getRowMeta?.(2)).toMatchObject({
      id: 2,
      depth: 2,
      parentId: 1,
      expandable: false,
      expanded: false,
    })
    expect(source.getRowMeta?.(7)).toMatchObject({ id: 7, depth: 1, parentId: 0 })
    expect(source.getRowMeta?.(8)).toMatchObject({ id: 8, depth: 2, parentId: 7 })
    expect(source.getRowMeta?.(14)).toMatchObject({ id: 14, depth: 2, parentId: 13 })
  })

  it('collapses one branch without hiding its siblings and retains its state', () => {
    const branchCollapsed = treeSource(18, [7])

    expect(branchCollapsed.rowCount).toBe(13)
    expect(Array.from({ length: branchCollapsed.rowCount }, (_, index) => (
      branchCollapsed.getRow(index).id
    ))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 15, 16, 17])
    expect(branchCollapsed.getRowMeta?.(7)).toMatchObject({
      id: 7,
      expandable: true,
      expanded: false,
    })

    const rootCollapsed = treeSource(18, [0, 7])
    expect(rootCollapsed.rowCount).toBe(1)
    expect(treeSource(18, [7]).getRowMeta?.(7)?.expanded).toBe(false)
  })

  it('removes descendants when an expanded root is toggled closed', () => {
    const expanded = treeSource(36)
    const collapsed = treeSource(36, [0])

    expect(expanded.rowCount).toBe(36)
    expect(collapsed.rowCount).toBe(19)
    expect(collapsed.getRow(0).id).toBe(0)
    expect(collapsed.getRow(1).id).toBe(18)
    expect(collapsed.getRowMeta?.(0)?.expanded).toBe(false)
  })

  it('reveals branches and leaves one level at a time from a collapsed default', () => {
    const collapsed = treeSource(18, [], false)
    const rootExpanded = treeSource(18, [0], false)
    const firstBranchExpanded = treeSource(18, [0, 1], false)
    const fullyExpanded = treeSource(18, [0, 1, 7, 13], false)

    expect(collapsed.rowCount).toBe(1)
    expect(Array.from({ length: rootExpanded.rowCount }, (_, index) => (
      rootExpanded.getRow(index).id
    ))).toEqual([0, 1, 7, 13])
    expect(Array.from({ length: firstBranchExpanded.rowCount }, (_, index) => (
      firstBranchExpanded.getRow(index).id
    ))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 13])
    expect(fullyExpanded.rowCount).toBe(18)
  })

  it('handles expandable nodes in a partial final group', () => {
    const expanded = treeSource(22)
    const branchCollapsed = treeSource(22, [19])
    const rootExpanded = treeSource(22, [18], false)
    const branchExpanded = treeSource(22, [18, 19], false)
    const branchWithoutChildren = treeSource(2)

    expect(expanded.getRowMeta?.(18)).toMatchObject({
      id: 18,
      depth: 0,
      expandable: true,
      expanded: true,
    })
    expect(expanded.getRowMeta?.(19)).toMatchObject({
      id: 19,
      depth: 1,
      parentId: 18,
      expandable: true,
      expanded: true,
    })
    expect(expanded.getRowMeta?.(20)).toMatchObject({ id: 20, depth: 2, parentId: 19 })
    expect(branchCollapsed.rowCount).toBe(20)
    expect(branchCollapsed.getRow(19).id).toBe(19)
    expect(Array.from({ length: rootExpanded.rowCount }, (_, index) => (
      rootExpanded.getRow(index).id
    ))).toEqual([0, 18, 19])
    expect(Array.from({ length: branchExpanded.rowCount }, (_, index) => (
      branchExpanded.getRow(index).id
    ))).toEqual([0, 18, 19, 20, 21])
    expect(branchWithoutChildren.getRowMeta?.(1)).toMatchObject({
      id: 1,
      depth: 1,
      parentId: 0,
      expandable: false,
      expanded: false,
    })
  })

  it('indexes 100k collapsed rows by group without materializing descendants', () => {
    const source = treeSource(100_000, [], false)

    expect(source.rowCount).toBe(5_556)
    expect(source.getRow(source.rowCount - 1).id).toBe(99_990)
  })
})
