import { test, expect, type Page } from '@playwright/test'

/**
 * What the eye receives, rather than what the source says.
 *
 * test/scaleUsage.test.ts counts class names. It cannot see a face produced
 * by an inline style, a font-weight utility or a family switch, and measured
 * in Chromium on 2026-09-11 the landing page rendered 17 distinct faces
 * against a scale of six steps. That gap is the defect; the class count was
 * green throughout.
 *
 * A ratchet, like the others in this repo: the numbers may fall and may not
 * rise. The failure message prints the full list, so lowering an entry is a
 * matter of reading the output rather than guessing.
 */

/** Distinct `${size} ${mono|sans} ${weight}` triples rendered on the route. */
const CEILING: Record<string, number> = {
  // Measured in Chromium at 1280px. The first figures, before any call site
  // moved, were 17 / 9 / 6 / 12.
  '/': 12,
  '/setup': 7,
  '/accounts': 6,
  // 11, not 10. This is the one entry that has ever risen, and it rose
  // because --t-display appeared on a screen that was missing it: the figure
  // used to render for `ceiling` alone, and this account is paused. A ratchet
  // exists to stop drift, not to stop a scale step from being used where the
  // design system says it belongs. See §7.
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982': 11,
}

async function faces(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Set<string>()
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,div,a,button,li,summary,label')) {
      // Only elements that draw text themselves. A wrapper inherits a face it
      // never paints, and counting it would report ranks nobody can see.
      //
      // Any direct text-node child, not just the first one. Testing
      // `firstChild.nodeType === 3` skipped every element that opens with a
      // <span> or <strong> and then sets its own text -- and it hid a
      // mutation test: wrapping the hero's first word in a 17px span removed
      // the h1 from the count as it added the span, so the total never moved.
      let draws = false
      for (const node of el.childNodes) {
        if (node.nodeType === 3 && node.textContent?.trim()) { draws = true; break }
      }
      if (!draws) continue
      const cs = getComputedStyle(el)
      const mono = cs.fontFamily.toLowerCase().includes('mono')
      seen.add(`${cs.fontSize} ${mono ? 'mono' : 'sans'} ${cs.fontWeight}`)
    }
    return [...seen].sort()
  })
}

for (const [route, ceiling] of Object.entries(CEILING)) {
  test(`${route} renders no more type faces than its recorded ceiling`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const found = await faces(page)
    expect(found.length, `${route} renders ${found.length} faces:\n${found.join('\n')}\n\n`
      + 'docs/design-system.md §2 defines seven steps. Lower the ceiling in '
      + 'this file when a route is cleaned up, so the list stays honest.')
      .toBeLessThanOrEqual(ceiling)
  })
}

/**
 * §2: --t-display appears at most once per screen, and is only ever a number.
 * §7: the landing carries none at all -- "nothing here is a number".
 *
 * Measured 2026-09-11, Hero.tsx rendered at 44px, which is the display step.
 * Meter.tsx:26-34 meanwhile declines to render a 44px figure on that screen,
 * citing §7, because "a 44px figure in LiveProof would outrank the headline it
 * is supposed to support" -- a precaution that is only coherent if the
 * headline is not itself at 44px. The component was protecting a rule the
 * hero broke.
 */
const DISPLAY_ELEMENTS: Record<string, number> = {
  '/': 0,
  '/setup': 0,
  '/accounts': 0,
  // The account is paused on mainnet, so this asserts exactly what the
  // five-band change did: the figure is there in a refusing state, and there
  // is still only one of it.
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982': 1,
}

for (const [route, allowed] of Object.entries(DISPLAY_ELEMENTS)) {
  test(`${route} renders ${allowed} element(s) at the display step`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const count = await page.evaluate(() => {
      const display = getComputedStyle(document.documentElement)
        .getPropertyValue('--t-display').trim()
      let n = 0
      for (const el of document.querySelectorAll('*')) {
        let draws = false
        for (const node of el.childNodes) {
          if (node.nodeType === 3 && node.textContent?.trim()) { draws = true; break }
        }
        if (!draws) continue
        if (getComputedStyle(el).fontSize === display) n++
      }
      return n
    })
    expect(count).toBe(allowed)
  })
}
