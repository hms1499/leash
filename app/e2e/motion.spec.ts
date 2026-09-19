import { test, expect, type Page } from '@playwright/test'

const ACCOUNT = process.env.LEASH_E2E_ACCOUNT ?? '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'

/**
 * §12's landing exception, asserted where it runs.
 *
 * The owner chose entrance motion for `/` on 2026-09-19. These hold it to what
 * was agreed: it plays on the landing, it ends with everything visible, it
 * does not reach the dashboard, and a reader who asked the OS for less motion
 * gets none of it. CSS animations only -- the meter's SMIL is a separate
 * mount decision and has its own guard in dashboard.spec.ts.
 */
function landingAnimations(page: Page) {
  return page.evaluate(() => document.getAnimations()
    .map((a) => (a as CSSAnimation).animationName)
    .filter((name) => typeof name === 'string' && name.startsWith('landing-')))
}

test('the landing enters, and ends with every line of the hero visible', async ({ page }) => {
  await page.goto('/')
  const names = await landingAnimations(page)
  expect(names).toContain('landing-enter')
  expect(names).toContain('landing-blink')
  // Entrance is finite: the last step starts at 4 beats and runs --m-enter.
  await expect(async () => {
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.landing-stagger > *')]
      .filter((el) => Number(getComputedStyle(el).opacity) < 1)
      .map((el) => el.textContent?.trim().slice(0, 30)))
    expect(hidden).toEqual([])
  }).toPass({ timeout: 5_000 })
})

test('the live panel marks each new block as it arrives', async ({ page }) => {
  await page.goto('/')
  const tick = page.locator('.landing-tick')
  await expect(tick).toContainText(/\d/, { timeout: 30_000 })
  const first = await tick.innerText()
  // Celo makes a block a second and the tail polls every four.
  await expect(tick).not.toHaveText(first, { timeout: 20_000 })
  await expect(page.locator('.landing-live')).toBeVisible()
})

test('a reader who asked for less motion gets none of it', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await landingAnimations(page)).toEqual([])
    expect(await page.getByRole('heading', { level: 1 })
      .evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  } finally {
    await context.close()
  }
})

test('the dashboard carries none of the landing motion', async ({ page }) => {
  await page.goto(`/a/${ACCOUNT}`)
  await expect(page.getByText('Remaining today')).toBeVisible()
  expect(await landingAnimations(page)).toEqual([])
})
