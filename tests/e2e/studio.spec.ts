import { expect, test } from '@playwright/test'

test('opens on the overview and switches between every top-level scenario', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  const scenarios = ['intro', 'gallery', 'analysis', 'spreadsheet']
  await expect(page.locator('[data-scenario="intro"]')).toHaveAttribute('aria-pressed', 'true')

  for (const scenario of scenarios) {
    const trigger = page.locator(`[data-scenario="${scenario}"]`)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-pressed', 'true')
  }

  expect(consoleErrors).toEqual([])
})

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test('keeps the default overview readable without clipped half-width cards', async ({ page }) => {
    await page.goto('/')
    const content = page.locator('.repository-intro__content')
    const sections = page.locator('.repository-intro__section')
    await expect(sections).toHaveCount(2)

    const contentBox = await content.boundingBox()
    expect(contentBox).not.toBeNull()
    for (const section of await sections.all()) {
      const box = await section.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(contentBox!.width - 2)
      const overflow = await section.evaluate((element) => (
        element.scrollWidth - element.clientWidth
      ))
      expect(overflow).toBeLessThanOrEqual(1)
    }

    const documentOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))
    expect(documentOverflow).toBeLessThanOrEqual(1)
  })

  test('keeps spreadsheet ribbon groups separate while allowing horizontal scroll', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-scenario="spreadsheet"]').click()
    const ribbon = page.locator('.spreadsheet-ribbon')
    await expect(ribbon).toBeVisible()

    const groupMetrics = await page.locator('.spreadsheet-ribbon-group').evaluateAll((groups) => (
      groups.map((group) => {
        const bounds = group.getBoundingClientRect()
        return {
          left: bounds.left,
          right: bounds.right,
          clientWidth: group.clientWidth,
          scrollWidth: group.scrollWidth,
        }
      })
    ))
    for (let index = 0; index < groupMetrics.length - 1; index += 1) {
      expect(groupMetrics[index]!.right).toBeLessThanOrEqual(groupMetrics[index + 1]!.left + 1)
      expect(groupMetrics[index]!.scrollWidth - groupMetrics[index]!.clientWidth)
        .toBeLessThanOrEqual(1)
    }
    expect(await ribbon.evaluate((element) => element.scrollWidth))
      .toBeGreaterThan(await ribbon.evaluate((element) => element.clientWidth))
  })
})
