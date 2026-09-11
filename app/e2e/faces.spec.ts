import { test, expect, type Page } from '@playwright/test'
import { allowedFaces, DECLARED_EXCEPTIONS } from '../lib/type.js'

/**
 * What the eye receives, rather than what the source says.
 *
 * test/scaleUsage.test.ts counts class names and test/type.test.ts checks the
 * tokens agree with each other. Neither can see a face produced by an inline
 * style, a font-weight utility or a family switch, and measured in Chromium on
 * 2026-09-11 the landing page rendered 17 distinct faces against a scale of
 * six steps. Every source test was green throughout.
 *
 * This began as a ceiling -- no more than N faces per route -- which stopped
 * the drift growing without saying what any of it was. Once lib/type.ts
 * carried weight and family as well as size, the stronger assertion became
 * available: **every face on the page is one of the declared steps.** A count
 * would have accepted 36px mono at 400, 500 and 600 as three faces for one
 * rank; this does not accept any of them but the one the scale names.
 *
 * The exceptions are declared in lib/type.ts and each is a decision.
 */

const ROUTES = [
  '/',
  '/setup',
  '/accounts',
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982',
]

async function faces(page: Page): Promise<Map<string, string>> {
  return new Map(await page.evaluate(() => {
    const seen = new Map<string, string>()
    for (const el of document.querySelectorAll('*')) {
      // <style> and <script> hold text nodes and paint nothing. Counting them
      // reported 16px sans 400 as the app's most-used face.
      // <title> lives in <head> and paints nothing either.
      if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'TITLE'].includes(el.tagName)) continue
      // Only elements that draw text themselves. A wrapper inherits a face it
      // never paints, and counting it would report ranks nobody can see.
      //
      // Any direct text-node child, not just the first: testing
      // `firstChild.nodeType === 3` skipped every element that opens with a
      // <span> or <strong> and then sets its own text.
      let draws = false
      for (const node of el.childNodes) {
        if (node.nodeType === 3 && node.textContent?.trim()) { draws = true; break }
      }
      if (!draws) continue
      const cs = getComputedStyle(el)
      const mono = cs.fontFamily.toLowerCase().includes('mono')
      const face = `${cs.fontSize} ${mono ? 'mono' : 'sans'} ${cs.fontWeight}`
      if (!seen.has(face)) seen.set(face, `<${el.tagName}> ${(el.textContent || '').trim().slice(0, 40)}`)
    }
    return [...seen.entries()]
  }))
}

for (const route of ROUTES) {
  test(`${route} renders only faces the scale declares`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(route)
    await page.waitForLoadState('networkidle')

    const allowed = allowedFaces()
    const found = await faces(page)
    const strays = [...found.entries()]
      .filter(([face]) => !allowed.has(face))
      .map(([face, where]) => `${face}   ${where}`)

    expect(strays, `${route} draws faces the scale does not define:\n${strays.join('\n')}\n\n`
      + `declared: ${[...allowed].sort().join(', ')}\n`
      + `exceptions: ${Object.entries(DECLARED_EXCEPTIONS).map(([f, why]) => `${f} (${why})`).join(', ')}\n\n`
      + 'Add the face to a step in lib/type.ts, or put the call site on one. '
      + 'docs/design-system.md §2.').toEqual([])
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
