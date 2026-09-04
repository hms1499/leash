import { test, expect } from '@playwright/test'

test('the wizard answers at /setup', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByText('Step 1 — Connect')).toBeVisible()
})

/**
 * The judge's path, one step earlier than the dashboard spec: open the
 * submitted link and understand what this is, with no wallet, and see that the
 * numbers are real rather than illustrative.
 */
test('the landing page explains itself and shows live mainnet numbers', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: /wallet without trusting it/i }),
  ).toBeVisible()

  await expect(page.getByText('Live on Celo mainnet')).toBeVisible()
  await expect(page.locator('.num').filter({ hasText: /\d+\.\d{6}/ }).first())
    .toBeVisible({ timeout: 30_000 })

  // The proof rows are links a reader can actually open.
  await expect(page.locator('a[href^="https://celoscan.io/tx/"]').first()).toBeVisible()

  await expect(page.getByRole('link', { name: /build your own/i }).first()).toBeVisible()
})

/**
 * 2026-09-01 spec §4 requires mobile-first for the MiniPay in-app browser.
 * Nothing tested it until now. A page that scrolls sideways on a phone is the
 * failure this catches.
 */
test('the landing page does not scroll sideways on a phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } })
  const page = await context.newPage()
  try {
    await page.goto('/')
    await expect(page.getByText('Live on Celo mainnet')).toBeVisible({ timeout: 30_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  } finally {
    await context.close()
  }
})
