import { test, expect } from '@playwright/test'

/**
 * The reach-and-read checks: how big a control is under a thumb, and where
 * focus is when the page changes under a reader.
 *
 * Measured on a phone, because that is where the first answer differs. MiniPay runs
 * this on one (spec §2.1), and controls set at --t-data (13px) with px-4 py-2
 * came out ~36px tall -- over WCAG 2.2's 24 CSS px floor and under the 44pt
 * iOS asks for. `Address` was worse: its copy button and its Celoscan `↗` had
 * no padding at all, so both drew about seventeen pixels.
 *
 * These assert the rendered box rather than the class list. A class can be
 * present and beaten by a more specific rule, and it was the measurement that
 * found the defect in the first place.
 */

const PHONE = { width: 375, height: 760 }
/** Apple HIG. The web floor is WCAG 2.2's 24 CSS px; this is the stricter one,
 *  and it is the one a thumb actually needs. */
const MIN = 44

test('every control on the setup wizard is at least 44px tall on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Create your protected account' })).toBeVisible()

  const controls = page.locator('button:visible, a[href]:visible')
  const count = await controls.count()
  expect(count).toBeGreaterThan(0)

  const short: string[] = []
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i)
    const box = await control.boundingBox()
    if (!box) continue
    // A link inside a sentence is prose, not a target: WCAG 2.2 exempts an
    // inline control whose position is determined by the flow of the text.
    const inline = await control.evaluate((node) => {
      const display = getComputedStyle(node).display
      return display === 'inline' && node.parentElement?.tagName !== 'LI'
    })
    if (inline) continue
    if (box.height < MIN) short.push(`${await control.innerText()} — ${box.height.toFixed(1)}px`)
  }
  expect(short, `controls under ${MIN}px:\n${short.join('\n')}`).toEqual([])
})

test('the address copy button and its explorer link are reachable by thumb', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/')

  // The landing renders Address in read-only form with the explorer link; the
  // dashboard adds the copy button. Both shapes are covered from the two pages
  // that render them with no wallet connected.
  const explorer = page.getByRole('link', { name: /Open address .* on Celoscan/ }).first()
  await expect(explorer).toBeVisible()
  const link = await explorer.boundingBox()
  expect(link).not.toBeNull()
  expect(link!.height).toBeGreaterThanOrEqual(MIN)
  expect(link!.width).toBeGreaterThanOrEqual(MIN)

  // The copy button is the other half of `Address`, and it only renders where
  // a wallet is connected -- which this suite deliberately never does. Its
  // target comes from `.tap-tall`, whose ::after box is asserted against the
  // stylesheet instead.
  const extended = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'tap-tall'
    document.body.append(probe)
    const height = getComputedStyle(probe, '::after').height
    probe.remove()
    return height
  })
  expect(extended).toBe(`${MIN}px`)
})

test('the enlarged targets did not widen the page on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  for (const path of ['/', '/setup', '/accounts']) {
    await page.goto(path)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(PHONE.width)
  }
})

/**
 * Every panel below the stepper is replaced wholesale on a step change, and
 * focus stayed on the button that caused it. A screen reader was told nothing
 * about a screen that had entirely changed.
 */
test('the wizard step heading can take focus, and does not take it on load', async ({ page }) => {
  await page.goto('/setup')
  const first = page.getByRole('heading', { name: 'Create your protected account' })
  await expect(first).toBeVisible()

  // Focus is not stolen on load: the reader is wherever they meant to be.
  await expect(first).not.toBeFocused()

  // Step 2 is locked until an account exists, so the reachable change is the
  // one the wizard makes on its own. Driving it through the stepper needs a
  // wallet; asserting the contract that the heading can hold focus is what is
  // testable with none, and it is the half that was missing.
  await expect(first).toHaveAttribute('tabindex', '-1')
  await expect(first).toHaveAttribute('id', 'stage-heading')
  await first.focus()
  await expect(first).toBeFocused()
})
