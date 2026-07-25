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
