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
  '/': 13,
  '/setup': 7,
  '/accounts': 6,
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982': 10,
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
