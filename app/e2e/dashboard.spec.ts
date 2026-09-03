import { test, expect } from '@playwright/test'

const ACCOUNT = process.env.LEASH_E2E_ACCOUNT ?? '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

/**
 * The judge's path: open the submitted link in a browser with no wallet and
 * see a live account. If this breaks, the demo link is dead for anyone who
 * does not already hold a Celo wallet.
 */
test('the dashboard renders live numbers with no wallet connected', async ({ page }) => {
  await page.goto(`/a/${ACCOUNT}`)

  await expect(page.getByText('Remaining today')).toBeVisible()

  // A real amount, not a spinner and not NaN.
  const amount = page.locator('.num').first()
  await expect(amount).toContainText(/\d+\.\d{6}\s*\/\s*\d+\.\d{6}\s+USDC/, { timeout: 30_000 })

  // The wall is stated before money moves.
  await expect(
    page.getByText(/will be refused|allowance is spent|Paused by the owner/),
  ).toBeVisible()

  // And nothing asked for a wallet.
  await expect(page.getByText('Connect wallet')).toBeVisible()
})

/**
 * Spec §3 calls this one of two non-negotiable guards: a continuously running
 * feTurbulence is the most expensive thing on this page, and MiniPay runs on
 * phones. The guard was CSS until it was measured and found to do nothing, so
 * it is asserted here in a real browser rather than trusted.
 */
test('the meter stops animating when the OS asks it to', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(`/a/${ACCOUNT}`)
    await expect(page.locator('.num').first())
      .toContainText(/\d+\.\d{6}/, { timeout: 30_000 })
    await expect(page.locator('.meter-turbulence animate')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

// Without this the test above passes even if the meter never animates at all.
test('the meter animates when the OS has not asked otherwise', async ({ page }) => {
  await page.goto(`/a/${ACCOUNT}`)
  await expect(page.locator('.num').first())
    .toContainText(/\d+\.\d{6}/, { timeout: 30_000 })
  await expect(page.locator('.meter-turbulence animate')).toHaveCount(1)
})
