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

test('aligns desktop ribbon icons, select chevrons, and group labels', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-scenario="spreadsheet"]').click()

  const metrics = await page.locator('.spreadsheet-ribbon-toolbar').evaluate((toolbar) => {
    const centers = (elements: Element[]) => elements.map((element) => {
      const bounds = element.getBoundingClientRect()
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    })
    const iconButtons = [...toolbar.querySelectorAll('.spreadsheet-command--icon')]
    const iconCenters = iconButtons.map((button) => ({
      control: centers([button])[0]!,
      icon: centers([button.querySelector('.spreadsheet-command-icon')!])[0]!,
    }))
    const selectLabels = [...toolbar.querySelectorAll(
      '.spreadsheet-font-select-row label, .spreadsheet-number-select',
    )]
    const chevrons = selectLabels.map((label) => ({
      control: centers([label])[0]!,
      icon: centers([label.querySelector(':scope > svg')!])[0]!,
    }))
    const labelBottoms = [...toolbar.querySelectorAll('.spreadsheet-ribbon-group > small')]
      .map((label) => label.getBoundingClientRect().bottom)
    return { iconCenters, chevrons, labelBottoms }
  })

  for (const pair of metrics.iconCenters) {
    expect(Math.abs(pair.control.x - pair.icon.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(pair.control.y - pair.icon.y)).toBeLessThanOrEqual(1)
  }
  for (const pair of metrics.chevrons) {
    expect(Math.abs(pair.control.y - pair.icon.y)).toBeLessThanOrEqual(1)
  }
  expect(Math.max(...metrics.labelBottoms) - Math.min(...metrics.labelBottoms)).toBeLessThanOrEqual(1)
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

  test('keeps ribbon touch targets and color menus stable while scrolling', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-scenario="spreadsheet"]').click()
    const ribbon = page.locator('.spreadsheet-ribbon')

    await ribbon.evaluate((element) => {
      element.scrollLeft = 240
    })
    await page.getByRole('tab', { name: '公式', exact: true }).click()
    await expect.poll(() => ribbon.evaluate((element) => element.scrollLeft)).toBe(0)
    await page.getByRole('tab', { name: '开始', exact: true }).click()

    const targets = await page.locator(
      '.spreadsheet-ribbon-toolbar button, .spreadsheet-ribbon-toolbar select, .spreadsheet-ribbon-toolbar input',
    ).evaluateAll((controls) => (
      controls
        .filter((control) => control.getBoundingClientRect().width > 0)
        .map((control) => {
          const bounds = control.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height }
        })
    ))
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44)
      expect(target.height).toBeGreaterThanOrEqual(44)
    }

    const colorTrigger = page.locator('.spreadsheet-color-menu-trigger').first()
    await colorTrigger.scrollIntoViewIfNeeded()
    const scrollBeforeOpen = await ribbon.evaluate((element) => element.scrollLeft)
    await colorTrigger.click()
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'true')
    const palette = page.locator('.spreadsheet-color-palette')
    await expect(palette).toBeVisible()
    const paletteBounds = await palette.boundingBox()
    expect(paletteBounds).not.toBeNull()
    expect(paletteBounds!.x).toBeGreaterThanOrEqual(0)
    expect(paletteBounds!.x + paletteBounds!.width).toBeLessThanOrEqual(320)
    expect(paletteBounds!.y).toBeGreaterThanOrEqual(0)
    expect(paletteBounds!.y + paletteBounds!.height).toBeLessThanOrEqual(640)
    const swatchSizes = await palette.getByRole('menuitemradio').evaluateAll((swatches) => (
      swatches.map((swatch) => {
        const bounds = swatch.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height }
      })
    ))
    for (const swatch of swatchSizes) {
      expect(swatch.width).toBeGreaterThanOrEqual(44)
      expect(swatch.height).toBeGreaterThanOrEqual(44)
    }
    expect(Math.abs(
      await ribbon.evaluate((element) => element.scrollLeft) - scrollBeforeOpen,
    )).toBeLessThanOrEqual(1)

    await page.locator('.spreadsheet-grid').click({ position: { x: 20, y: 80 } })
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await colorTrigger.click()
    await page.keyboard.press('Escape')
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await expect(colorTrigger).toBeFocused()
  })
})
