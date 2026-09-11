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

/**
 * Measured at 375px on 2026-09-11: the meter's three stats were laid out
 * `grid-cols-2`, so the third sat alone on its own row and its 11px .16em
 * label wrapped onto two lines. Three stats go in one column on a phone.
 */
test('the meter stacks its three stats in one column on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/a/0xA73DB76f20c5ede3ABE883565D22905760F83982')
  await page.waitForLoadState('networkidle')
  const lefts = await page.locator('[data-testid="meter-stat"]').evaluateAll(
    (els) => els.map((el) => Math.round(el.getBoundingClientRect().left)),
  )
  expect(lefts.length).toBe(3)
  expect(new Set(lefts).size, `stat left edges: ${lefts.join(', ')}`).toBe(1)
})

/**
 * "Recent activity" was the one section heading rendered outside its panel.
 * At 375px it started at the page gutter while the panel's content started
 * 24px further in, and the misalignment was plainly visible.
 */
test('every section heading aligns with the content it titles', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/a/0xA73DB76f20c5ede3ABE883565D22905760F83982')
  await page.waitForLoadState('networkidle')
  const heading = await page.getByRole('heading', { name: 'Recent activity' }).boundingBox()
  const feed = await page.locator('[data-testid="feed-body"]').boundingBox()
  expect(heading).not.toBeNull()
  expect(feed).not.toBeNull()
  expect(Math.round(heading!.x)).toBe(Math.round(feed!.x))
})

/**
 * The landing's own targets. §2.1 asks for 44px on a phone and `reach` had
 * only ever checked the wizard and the dashboard, so the header nav, the
 * "My accounts" link and the footer were never measured: all of them drew a
 * 20px-tall box, found on 2026-09-11 by measuring the rendered page.
 *
 * `.tap-tall` extends the hit area with a pseudo-element rather than by
 * growing the box, so nothing reflows -- which is why this reads
 * `elementFromPoint` at the edge of the intended target instead of a
 * bounding box. A box says what the layout does; only a hit test says what a
 * thumb lands on.
 */
test('every standalone link on the landing takes a 44px thumb', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const missed = await page.evaluate(() => {
    const out: string[] = []
    const links = [
      ...document.querySelectorAll('header a'),
      ...document.querySelectorAll('footer a, nav[aria-label="Footer"] a'),
    ] as HTMLElement[]
    for (const el of links) {
      const box = el.getBoundingClientRect()
      if (box.width === 0) continue
      const x = box.left + box.width / 2
      // 22px above and below the centre is the edge of a 44px target.
      for (const dy of [-21, 21]) {
        const y = box.top + box.height / 2 + dy
        if (y < 0 || y > window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (hit !== el && !el.contains(hit)) {
          out.push(`${(el.textContent || '').trim().slice(0, 24)} misses at ${dy > 0 ? 'bottom' : 'top'}`)
        }
      }
    }
    return out
  })

  expect(missed, 'a link on the landing answers a thumb only where its text is.\n'
    + 'design-system.md §15 and spec §2.1: 44px on a phone. `.tap-tall` in '
    + 'globals.css lifts a small target without changing the layout.').toEqual([])
})
