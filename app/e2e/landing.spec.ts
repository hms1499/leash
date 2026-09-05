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
 * The order of the sections is the order a reader asks the questions, and it
 * is a product decision rather than an accident of when each was written:
 * what is it, is it real, why bother, how, prove it, what breaks, how do I
 * use it. Implementation sits last because a wall of JSON is the first thing
 * that stops a non-developer reading.
 *
 * Asserted here because only a rendered page can carry it. The unit suite runs
 * in the node environment and cannot see document order -- the same reason the
 * meter's display figure needed this file when it moved on 2026-09-05.
 */
test('the page tells its story in order as you scroll', async ({ page }) => {
  await page.goto('/')

  const headings = await page.getByRole('heading').allTextContents()
  expect(headings.map((h) => h.trim())).toEqual([
    'Give an AI agent a wallet without trusting it.',
    'What an account looks like right now',
    'Why not just give the agent a wallet?',
    'How it works',
    'Proven on Celo mainnet',
    'Questions worth asking',
    'What your agent gets',
  ])
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
