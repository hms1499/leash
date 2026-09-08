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

  // A real amount, not a spinner and not NaN. Anchored to its own label rather
  // than to `.num` first: the dominant figure moved to the top of the meter on
  // 2026-09-05 and a positional locator silently started asserting about a
  // different number.
  const remaining = page.getByText('Remaining today').locator('xpath=..').locator('.num')
  await expect(remaining).toContainText(/\d+\.\d{2,6}\s*\/\s*\d+\.\d{2,6}\s+USDC/, { timeout: 30_000 })

  // The wall is stated before money moves. When a ceiling applies, that is the
  // display figure and the line naming which of the three bounds produced it;
  // otherwise it is one of the other four state sentences.
  await expect(
    page.getByText(/limited by the|allowance is spent|Paused by the owner|holds no/),
  ).toBeVisible()

  // And nothing asked for a wallet.
  await expect(page.getByText('Connect wallet')).toBeVisible()
  await expect(page.getByRole('link', { name: /My accounts/ })).toBeVisible()
  await expect(page.getByText('Public view — connect the owner wallet to manage this account.')).toBeVisible()
  await expect(page.getByText('Recommended action')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Protection policy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Agent permissions' })).toBeVisible()
  await expect(page.getByText('Primary agent')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit protection' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Leash home' })).toHaveAttribute('href', '/')
})

/**
 * Spec §3 calls this one of two non-negotiable guards: a continuously running
 * SMIL animation is the most expensive thing on this page, and MiniPay runs
 * on phones. The guard was CSS until it was measured and found to do nothing,
 * so it is asserted here in a real browser rather than trusted.
 */
test('the meter stops animating when the OS asks it to', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(`/a/${ACCOUNT}`)
    const capacity = page.getByText('Maximum next direct payment').locator('xpath=..').locator('.num')
    await expect(capacity)
      .toContainText(/\d+\.\d{2,6}/, { timeout: 30_000 })
    await expect(page.locator('.meter animate')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

// Without this the test above passes even if the meter never animates at all.
test('the meter animates when the OS has not asked otherwise', async ({ page }) => {
  await page.goto(`/a/${ACCOUNT}`)
  const capacity = page.getByText('Maximum next direct payment').locator('xpath=..').locator('.num')
  await expect(capacity)
    .toContainText(/\d+\.\d{2,6}/, { timeout: 30_000 })
  await expect(page.locator('.meter animate')).toHaveCount(1)
})

test('the dashboard does not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto(`/a/${ACCOUNT}`)
  await expect(page.getByText('Account status', { exact: true })).toBeVisible()
  // Wait for the delayed operator lookup too: its address and the settled
  // activity row are the content most likely to overflow after first paint.
  await expect(page.getByRole('heading', { name: 'Funds and agent gas' }))
    .toBeVisible({ timeout: 30_000 })
  const meter = await page.getByTestId('spending-meter-card').boundingBox()
  expect(meter).not.toBeNull()
  expect(meter!.x).toBeGreaterThan(0)
  expect(meter!.width).toBeLessThan(375)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375)
})
