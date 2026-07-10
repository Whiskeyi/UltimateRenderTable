import { describe, expect, it } from 'vitest'
import { createDemoRowSource } from '../src/demo/demoData'

describe('demo tree row source', () => {
  it('removes descendants when an expanded root is toggled closed', () => {
    const expanded = createDemoRowSource(36, 'tree', new Set(), true)
    const collapsed = createDemoRowSource(36, 'tree', new Set([0]), true)

    expect(expanded.rowCount).toBe(36)
    expect(collapsed.rowCount).toBe(19)
    expect(collapsed.getRow(0).id).toBe(0)
    expect(collapsed.getRow(1).id).toBe(18)
    expect(collapsed.getRowMeta?.(0)?.expanded).toBe(false)
  })

  it('adds only the toggled branch when roots default to collapsed', () => {
    const collapsed = createDemoRowSource(36, 'tree', new Set(), false)
    const firstExpanded = createDemoRowSource(36, 'tree', new Set([0]), false)

    expect(collapsed.rowCount).toBe(2)
    expect(collapsed.getRow(1).id).toBe(18)
    expect(firstExpanded.rowCount).toBe(19)
    expect(firstExpanded.getRow(17).id).toBe(17)
    expect(firstExpanded.getRow(18).id).toBe(18)
  })
})
