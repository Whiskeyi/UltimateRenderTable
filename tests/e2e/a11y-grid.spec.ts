import { expect, test } from '@playwright/test'

test('exposes pane-spanning cells as logical treegrid rows', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-scenario="gallery"]').click()
  await page.locator('#component-gallery-tab-tree').click()

  const treegrid = page.getByRole('treegrid')
  await expect(treegrid).toBeVisible()
  const rowgroup = treegrid.locator(':scope > .ultigrid-a11y-rowgroup')
  await expect(rowgroup).toHaveAttribute('role', 'rowgroup')

  const rows = rowgroup.locator(':scope > [role="row"]')
  await expect.poll(() => rows.count()).toBeGreaterThan(2)
  const ownership = await rows.evaluateAll((elements) => elements.map((element) => ({
    rowIndex: element.getAttribute('aria-rowindex'),
    level: element.getAttribute('aria-level'),
    expanded: element.getAttribute('aria-expanded'),
    owns: element.getAttribute('aria-owns')?.split(/\s+/).filter(Boolean) ?? [],
  })))

  const ownedIds = ownership.flatMap(({ owns }) => owns)
  expect(new Set(ownedIds).size).toBe(ownedIds.length)
  for (const { owns } of ownership) {
    expect(owns.length).toBeGreaterThan(0)
    const columns = await Promise.all(owns.map(async (id) => {
      const cell = page.locator(`[id="${id}"]`)
      await expect(cell).toHaveAttribute('role', /^(gridcell|columnheader|rowheader)$/)
      expect(await cell.getAttribute('aria-level')).toBeNull()
      expect(await cell.getAttribute('aria-expanded')).toBeNull()
      return Number(await cell.getAttribute('aria-colindex'))
    }))
    expect(columns).toEqual([...columns].sort((left, right) => left - right))
  }

  expect(ownership[0]).toMatchObject({ rowIndex: '1', level: null, expanded: null })
  expect(ownership[1]).toMatchObject({ rowIndex: '2', level: '1', expanded: 'true' })

  const expandedRowCount = await rows.count()
  const treeToggles = treegrid.getByRole('button')
  await expect(treeToggles).toHaveCount(6)
  const firstRootToggle = treeToggles.first()
  await expect(firstRootToggle).toHaveAttribute('aria-expanded', 'true')
  await firstRootToggle.click()
  await expect(firstRootToggle).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => rows.count()).toBeLessThan(expandedRowCount)
  await firstRootToggle.click()
  await expect(firstRootToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(rows).toHaveCount(expandedRowCount)

  const session = await page.context().newCDPSession(page)
  const { nodes } = await session.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const treegridNode = nodes.find((node) => node.role?.value === 'treegrid')
  expect(treegridNode).toBeDefined()

  const descendants = new Set<string>()
  const pending = [...(treegridNode?.childIds ?? [])]
  while (pending.length > 0) {
    const nodeId = pending.pop()!
    if (descendants.has(nodeId)) continue
    descendants.add(nodeId)
    pending.push(...(byId.get(nodeId)?.childIds ?? []))
  }
  const accessibleRows = [...descendants]
    .map((nodeId) => byId.get(nodeId))
    .filter((node) => node?.role?.value === 'row')
  expect(accessibleRows.length).toBeGreaterThan(2)
  for (const row of accessibleRows) {
    const childRoles = (row?.childIds ?? [])
      .map((nodeId) => byId.get(nodeId)?.role?.value)
      .filter(Boolean)
    expect(childRoles.some((role) => (
      role === 'gridcell' || role === 'columnheader' || role === 'rowheader'
    ))).toBe(true)
  }
})

test('keeps frozen-only snapshots and pane-spanning merge content visible', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-scenario="gallery"]').click()
  await page.locator('#component-gallery-tab-virtualization').click()
  await page.getByTestId('gallery-editor-toggle-virtualization').click()

  await page.locator('.component-gallery__editor').fill(`
import { useCallback, useState } from 'react'
import { UltiGridViewport } from '@ultigrid/core'

let customRenderCount = 0
let contentMountCount = 0

function StatefulContent() {
  const [mount] = useState(() => ++contentMountCount)
  const [clicks, setClicks] = useState(0)
  return (
    <button
      type="button"
      data-merge-content
      data-mount-count={mount}
      data-click-count={clicks}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setClicks((count) => count + 1)}
    >
      Pane-spanning content
    </button>
  )
}

export default function Demo() {
  const handleViewport = useCallback((snapshot) => {
    const output = document.querySelector('[data-viewport-snapshot]')
    if (output) {
      output.textContent = [
        snapshot.rowStart,
        snapshot.rowEnd,
        snapshot.columnStart,
        snapshot.columnEnd,
        snapshot.visibleCellCount,
      ].join(':')
    }
  }, [])
  const getCell = useCallback((row) => row === 0 ? ({
    value: 'anchor',
    className: 'stateful-merge',
    style: { color: 'rgb(1, 2, 3)' },
  }) : 'anchor', [])
  const renderCell = useCallback(({ row }) => row === 0 ? (
    <span data-render-count={++customRenderCount}><StatefulContent /></span>
  ) : 'Row ' + row, [])

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateRows: '86px 140px', height: '100%' }}>
      <div>
        <output data-viewport-snapshot>pending</output>
        <div style={{ height: 70, width: 150 }}>
          <UltiGridViewport
            rowCount={2}
            columnCount={2}
            defaultRowHeight={32}
            defaultColumnWidth={60}
            frozen={{ top: 2, left: 2 }}
            getCell={getCell}
            onViewportChange={handleViewport}
          />
        </div>
      </div>
      <div style={{ height: 140, width: 120 }}>
        <UltiGridViewport
          rowCount={120}
          columnCount={1}
          defaultRowHeight={40}
          defaultColumnWidth={120}
          frozen={{ top: 1 }}
          getCell={getCell}
          mergedCells={[{ id: 'cross-pane', rowStart: 0, rowEnd: 100, columnStart: 0, columnEnd: 0 }]}
          defaultSelection={{ rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 }}
          renderCell={renderCell}
        />
      </div>
    </div>
  )
}
  `.trim())

  await expect(page.locator('[data-viewport-snapshot]')).toHaveText('0:1:0:1:4')
  const content = page.locator('[data-merge-content]')
  await expect(content).toBeVisible()
  await expect(content).toHaveCount(1)
  await expect(content).toHaveAttribute('data-mount-count', '1')
  const initialRenderCount = await content.locator('..').getAttribute('data-render-count')
  expect(Number(initialRenderCount)).toBeGreaterThan(0)
  await content.click()
  await expect(content).toHaveAttribute('data-click-count', '1')

  const mergeGrid = page.locator('.ultigrid-root').filter({ has: content })
  const semanticCell = mergeGrid.locator('.ultigrid-cell--merged').filter({ has: content })
  const mergeFragments = mergeGrid.locator('.ultigrid-cell--merged')
  await expect(mergeFragments).toHaveCount(2)
  const hiddenFragment = mergeGrid.locator('.ultigrid-cell--merged[aria-hidden="true"]')
  await expect(hiddenFragment).toHaveCount(1)
  expect(await hiddenFragment.getAttribute('id')).toBeNull()
  await expect(semanticCell).toHaveClass(/stateful-merge/)
  await expect(semanticCell).toHaveCSS('color', 'rgb(1, 2, 3)')
  await expect(semanticCell).toHaveAttribute('aria-rowspan', '101')
  const semanticCellId = await semanticCell.getAttribute('id')
  expect(semanticCellId).toBeTruthy()
  await expect(mergeGrid).toHaveAttribute('aria-activedescendant', semanticCellId!)

  const geometry = await content.evaluate((element) => {
    const cell = element.closest('.ultigrid-cell')!.getBoundingClientRect()
    const pane = element.closest('.ultigrid-viewport')!.getBoundingClientRect()
    return {
      cell: { left: cell.left, top: cell.top, right: cell.right, bottom: cell.bottom },
      pane: { left: pane.left, top: pane.top, right: pane.right, bottom: pane.bottom },
    }
  })
  expect(geometry.cell.top).toBeGreaterThanOrEqual(geometry.pane.top - 1)
  expect(geometry.cell.bottom).toBeLessThanOrEqual(geometry.pane.bottom + 1)

  const mergeScroller = page.locator('.ultigrid-root')
    .filter({ has: content })
    .locator(':scope > .ultigrid-scroller')
  await mergeScroller.evaluate((element) => {
    element.scrollTop = 1_200
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => mergeScroller.evaluate((element) => element.scrollTop)).toBe(1_200)
  await expect(content).toBeVisible()
  await expect(content).toHaveCount(1)
  await expect(content).toHaveAttribute('data-mount-count', '1')
  await expect(content).toHaveAttribute('data-click-count', '1')
  await expect(content.locator('..')).toHaveAttribute('data-render-count', initialRenderCount!)
  const scrolledGeometry = await content.evaluate((element) => {
    const cell = element.closest('.ultigrid-cell')!.getBoundingClientRect()
    const pane = element.closest('.ultigrid-viewport')!.getBoundingClientRect()
    return {
      cell: { top: cell.top, bottom: cell.bottom },
      pane: { top: pane.top, bottom: pane.bottom },
    }
  })
  expect(scrolledGeometry.cell.top).toBeGreaterThanOrEqual(scrolledGeometry.pane.top - 1)
  expect(scrolledGeometry.cell.bottom).toBeLessThanOrEqual(scrolledGeometry.pane.bottom + 1)

  await mergeScroller.evaluate((element) => {
    element.scrollTop = 4_020
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => mergeScroller.evaluate((element) => element.scrollTop)).toBe(4_020)
  await expect(content).toBeVisible()
  await expect(content).toHaveCount(1)
  await expect(content).toHaveAttribute('data-mount-count', '1')
  await expect(content).toHaveAttribute('data-click-count', '1')
  await expect(content.locator('..')).toHaveAttribute('data-render-count', initialRenderCount!)
})
