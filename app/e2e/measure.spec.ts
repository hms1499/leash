import { test, expect } from '@playwright/test'

/**
 * The measure: how many characters a reader crosses before returning to the
 * left margin. §2 caps prose at about 68 and nothing enforced it.
 *
 * It cost nothing while the page was 768px wide, because no column was wide
 * enough to break it. Widening the container to 1024 (§3) stretched two
 * dashboard paragraphs to **109 characters** the moment it landed -- they had
 * never needed a cap and so had never been given one. PROSE carries the
 * max-width itself now, and this is what says so.
 *
 * Measured at 1920 rather than 1024: a max-width that is missing shows up at
 * the widest viewport, and that is the one nobody develops at.
 *
 * The ceiling is 70 and the rule is 68. `ch` in CSS is the width of a "0",
 * which in a proportional face is narrower than the average letter, so this
 * probe reads a little high -- a paragraph capped at 68ch measures 69.
 */

const WIDE = { width: 1920, height: 1080 }
/** §2 says ~68. Two characters of probe slack, and no more. */
const MAX = 70

const ROUTES = [
  '/',
  '/setup',
  '/accounts',
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982',
]

for (const route of ROUTES) {
  test(`${route} holds every prose line to the measure`, async ({ page }) => {
    await page.setViewportSize(WIDE)
    await page.goto(route)
    await page.waitForLoadState('networkidle')

    const over = await page.evaluate((max) => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
      document.body.appendChild(probe)
      const out: string[] = []
      for (const el of document.querySelectorAll('p,li,dd')) {
        const text = (el.textContent || '').trim()
        // A fragment cannot run long enough to break the measure.
        if (text.length < 60) continue
        const cs = getComputedStyle(el)
        // Mono is what a reader looks at, not what they read (§1). An address
        // and a .mcp.json block are not prose and have no measure.
        if (cs.fontFamily.toLowerCase().includes('mono')) continue
        probe.style.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
        probe.textContent = '0'.repeat(50)
        const zero = probe.getBoundingClientRect().width / 50
        const ch = Math.round(el.getBoundingClientRect().width / zero)
        if (ch > max) out.push(`${ch}ch  ${text.slice(0, 56)}`)
      }
      probe.remove()
      return out
    }, MAX)

    expect(over, `${route} runs prose past ${MAX} characters:\n${over.join('\n')}\n\n`
      + 'docs/design-system.md §2 caps the measure at ~68. PROSE in '
      + 'components/ui/prose.ts carries it; an element that sets its own face '
      + 'by hand does not get it.').toEqual([])
  })
}

/**
 * The other end of the measure, and the one that made §16 necessary.
 *
 * A max-width is the failure everybody expects; the one that actually shipped
 * was the opposite. Measured 2026-09-11, the landing's three-up cards gave
 * each body **21 characters a line** -- at 1440px while the page was capped at
 * 768, and again at 768 once it was not, because a third of the page is 229px
 * either way. Below about 30ch a reader spends more time returning to the left
 * margin than reading.
 *
 * 768 is where it is checked because that is `md`, the first width at which a
 * span is allowed to be anything but the full twelve. A block that goes
 * three-up here fails; the same block at `lg` does not.
 */
const NARROW = { width: 768, height: 1024 }
/** §16. 30ch is the floor; the probe reads about one character high. */
const MIN = 31

for (const route of ROUTES) {
  test(`${route} holds every prose line above the floor at md`, async ({ page }) => {
    await page.setViewportSize(NARROW)
    await page.goto(route)
    await page.waitForLoadState('networkidle')

    const under = await page.evaluate((min) => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
      document.body.appendChild(probe)
      const out: string[] = []
      for (const el of document.querySelectorAll('p,li,dd')) {
        const text = (el.textContent || '').trim()
        // A phrase that cannot fill two lines has no measure to break: the
        // wizard's "Controls policy and recovery" is a label, not a paragraph.
        if (text.length < 60) continue
        const cs = getComputedStyle(el)
        if (cs.fontFamily.toLowerCase().includes('mono')) continue
        probe.style.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
        probe.textContent = '0'.repeat(50)
        const zero = probe.getBoundingClientRect().width / 50
        const box = el.getBoundingClientRect()
        // An element the layout has collapsed (a closed <details>, a branch
        // rendered but hidden) measures 0 and is not a narrow column.
        if (box.width === 0) continue
        const ch = Math.round(box.width / zero)
        if (ch < min) out.push(`${ch}ch  ${text.slice(0, 56)}`)
      }
      probe.remove()
      return out
    }, MIN)

    expect(under, `${route} runs prose under ${MIN} characters at 768px:\n${under.join('\n')}\n\n`
      + 'docs/design-system.md §16: a span widens only where a measurement '
      + 'says it may, and a third of the page does not hold prose until lg.').toEqual([])
  })
}
