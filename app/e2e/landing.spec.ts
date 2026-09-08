import { test, expect } from '@playwright/test'

test('the wizard answers at /setup', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Set up a protected agent account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create your protected account' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Setup progress' })).toBeVisible()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await expect(page.getByText(/MCP configuration/i)).toHaveCount(0)
  await expect(page.locator('a button, button a')).toHaveCount(0)
})

test('the setup flow does not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Create your protected account' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(360)
})

test('the account directory explains its local scope before wallet connection', async ({ page }) => {
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { name: 'My protected accounts' })).toBeVisible()
  await expect(page.getByText(/Reopen accounts owned by this wallet/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect the owner wallet' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Leash home' })).toHaveAttribute('href', '/')
})

test('the account directory does not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { name: 'My protected accounts' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375)
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

  await expect(page.getByRole('heading', { name: 'Keep the budget and the hot key separate' })).toBeVisible()
  await expect(page.getByText(/Anything already here is outside the contract/)).toBeVisible()
  await expect(page.getByText('The contract has not been audited.', { exact: false })).toBeVisible()
  await expect(page.getByText(/mcpServers/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /create protected account/i }).first()).toBeVisible()
  const dashboardPreviews = page.getByRole('link', { name: 'View live dashboard' })
  await expect(dashboardPreviews).toHaveCount(2)
  await expect(dashboardPreviews.first()).toHaveAttribute('href', '#live-proof')
  await expect(page.getByRole('link', { name: 'Open full dashboard' })).toHaveAttribute(
    'href',
    '/a/0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  )
  await expect(page.locator('a button, button a')).toHaveCount(0)
})

test('the live dashboard preview stays on the homepage until the user opens the full view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'View live dashboard' }).first().click()

  await expect(page).toHaveURL(/\/#live-proof$/)
  await expect(page.getByRole('heading', { name: 'A real account, not a mockup' })).toBeInViewport()
})

test('the primary journey links landing, setup and the account directory without dead ends', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Create protected account' }).first().click()
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('link', { name: 'My accounts' })).toHaveAttribute('href', '/accounts')
  await page.getByRole('link', { name: 'Leash home' }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'My accounts' }).click()
  await expect(page).toHaveURL(/\/accounts$/)
  await page.getByRole('link', { name: 'Leash home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

/**
 * The order of the sections is the order a reader asks the questions, and it
 * is a product decision rather than an accident of when each was written:
 * what is it, when is it useful, where the money lives, is it real, what can
 * it do, how is it set up, and what remains outside the security boundary.
 *
 * Asserted here because only a rendered page can carry it. The unit suite runs
 * in the node environment and cannot see document order -- the same reason the
 * meter's display figure needed this file when it moved on 2026-09-05.
 */
test('the page tells its story in order as you scroll', async ({ page }) => {
  await page.goto('/')

  const headings = await page.locator('h1, h2').allTextContents()
  expect(headings.map((h) => h.trim())).toEqual([
    'Give an AI agent a wallet without trusting it.',
    'Built for agents that need to spend, not hold unlimited funds',
    'Keep the budget and the hot key separate',
    'A real account, not a mockup',
    'The controls a production agent wallet actually needs',
    'From owner wallet to ready agent in four stages',
    'Know exactly what is—and is not—protected',
    'Ready to give your agent a hard spending limit?',
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
