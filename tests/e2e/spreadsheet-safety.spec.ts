import { expect, test } from '@playwright/test'

async function openSpreadsheet(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-scenario="spreadsheet"]').click()
  await expect(page.locator('.spreadsheet-formula-input')).toBeVisible()
}

async function selectAddress(page: import('@playwright/test').Page, address: string) {
  const nameBox = page.locator('.spreadsheet-name-box')
  await nameBox.fill(address)
  await nameBox.press('Enter')
}

test('preserves workbook edits across scenarios and localizes only untouched seed cells', async ({ page }) => {
  await openSpreadsheet(page)
  const formulaBar = page.locator('.spreadsheet-formula-input')

  await expect(formulaBar).toHaveValue('462400')
  await formulaBar.fill('913579')
  await formulaBar.press('Enter')

  await page.locator('[data-scenario="intro"]').click()
  await page.locator('[data-scenario="spreadsheet"]').click()
  await expect(formulaBar).toHaveValue('913579')
  await expect(page.getByText('2026 销售计划与实际跟踪')).toBeVisible()

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(formulaBar).toHaveValue('913579')
  await expect(page.getByText('2026 Sales Plan & Actual Tracker')).toBeVisible()
  await expect(page.getByText('2026 销售计划与实际跟踪')).toHaveCount(0)
})

test('rejects overflow paste and never deletes a cut when clipboard writing fails', async ({ page }) => {
  await openSpreadsheet(page)
  const formulaBar = page.locator('.spreadsheet-formula-input')

  await selectAddress(page, 'Z200')
  await expect(formulaBar).toHaveValue('')
  await page.locator('.spreadsheet-grid').evaluate((grid) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', '1\t2\n3\t4')
    grid.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }))
  })
  await expect(page.locator('.spreadsheet-autosave').filter({
    hasText: /无法从 Z200 粘贴 2 × 2/,
  })).toBeVisible()
  await expect(formulaBar).toHaveValue('')

  await selectAddress(page, 'E3')
  await expect(formulaBar).toHaveValue('462400')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    })
    document.execCommand = () => false
  })
  await page.getByRole('button', { name: '剪切', exact: true }).click()
  await expect(page.locator('.spreadsheet-autosave').filter({
    hasText: /剪切已取消/,
  })).toBeVisible()
  await expect(formulaBar).toHaveValue('462400')
})

test('keeps formula references unchanged when moving a cell with cut and paste', async ({ page }) => {
  await openSpreadsheet(page)
  await page.evaluate(() => {
    let text = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (next: string) => {
          text = next
          return Promise.resolve()
        },
        readText: () => Promise.resolve(text),
      },
    })
  })

  const formulaBar = page.locator('.spreadsheet-formula-input')
  await selectAddress(page, 'E15')
  await expect(formulaBar).toHaveValue('=SUM(E3:E14)')
  await page.getByRole('button', { name: '剪切', exact: true }).click()

  await selectAddress(page, 'J20')
  await page.getByRole('button', { name: '粘贴', exact: true }).click()
  await expect(formulaBar).toHaveValue('=SUM(E3:E14)')
})

test('confirms reset data loss and keeps the accepted reset undoable', async ({ page }) => {
  await openSpreadsheet(page)
  const formulaBar = page.locator('.spreadsheet-formula-input')

  await formulaBar.fill('913579')
  await formulaBar.press('Enter')
  await selectAddress(page, 'E3')
  await expect(formulaBar).toHaveValue('913579')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '重置工作表', exact: true }).click()
  await expect(formulaBar).toHaveValue('913579')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重置工作表', exact: true }).click()
  await expect(formulaBar).toHaveValue('462400')

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(formulaBar).toHaveValue('913579')
})
