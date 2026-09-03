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
