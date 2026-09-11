import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMNS, GUTTER, CONTAINER, PAGE_GUTTER, METER_MAX, columnWidth } from '../lib/layout.js'
import { PAGE, GRID, PANEL_GRID } from '../components/ui/page.js'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/**
 * The same arrangement PALETTE, SCALE and RADIUS keep with globals.css.
 * docs/design-system.md §3.
 */
describe('globals.css does not drift from layout.ts', () => {
  it.each([
    ['--columns', String(COLUMNS)],
    ['--gutter', GUTTER],
    ['--container', CONTAINER],
    ['--page-gutter', PAGE_GUTTER],
    ['--meter-max', METER_MAX],
  ])('%s is %s', (name, value) => {
    expect(css).toContain(`${name}: ${value};`)
  })
})

describe('the grid', () => {
  /** Twelve because it divides by 2, 3, 4 and 6. Ten or sixteen do not. */
  it('divides by two, three, four and six', () => {
    for (const n of [2, 3, 4, 6]) expect(COLUMNS % n).toBe(0)
  })

  /**
   * The gutter is §3's step 6. A grid that invents its own spacing value is a
   * second spacing system fighting the first, which §3 refused once already.
   */
  it('uses a step from the spacing scale, not a number of its own', () => {
    expect([8, 12, 24, 48]).toContain(parseInt(GUTTER, 10))
  })

  it('is what PAGE and GRID actually spend', () => {
    // max-w-5xl is Tailwind's 1024px, and px-4 its 16px.
    expect(PAGE).toContain('max-w-5xl')
    expect(PAGE).toContain('px-4')
    expect(GRID).toContain(`grid-cols-${COLUMNS}`)
    // gap-6 is 24px, the gutter above.
    expect(GRID).toContain('gap-6')
  })

  /**
   * Measured at 1440px on 2026-09-11, the landing's three-up cards gave each
   * card 235px and ran its body text at 21 characters a line. A column has to
   * be wide enough that three of them hold a readable card.
   */
  it('gives a column enough width to be worth spanning', () => {
    expect(columnWidth()).toBeGreaterThan(50)
  })

  /**
   * The same twelve inside a panel, at a different gutter on purpose: §14 asks
   * a container's padding to sit one step above the gap between its children,
   * and a `Panel` at `p-6` holds rows at `gap-3`. What has to carry across is
   * the division, not the gutter -- a panel's own padding already broke any
   * alignment between the two grids.
   */
  it('divides a panel by the same twelve, at the panel gap step', () => {
    expect(PANEL_GRID).toContain(`grid-cols-${COLUMNS}`)
    expect(PANEL_GRID).toContain('gap-3')
    expect(PANEL_GRID).not.toContain('gap-6')
  })

  /**
   * Measured 2026-09-11: a third of the page is 229px at 768 and its body runs
   * at 21 characters a line -- the figure this grid exists to fix. Half the
   * page at 768 is 35ch, and a third at 1024 is 31ch. So a prose card is
   * allowed to be a third only from `lg`, and e2e/measure.spec.ts probes the
   * rendered page at 768 to say so.
   */
  it('does not let a prose card go three-up before lg', () => {
    for (const file of ['CoreCapabilities', 'UseCaseGrid']) {
      const src = readFileSync(new URL(`../components/landing/${file}.tsx`, import.meta.url), 'utf8')
      expect(src, `${file} spans a third of the page at md, where it measures 21ch`)
        .not.toContain('md:col-span-4')
      expect(src).toContain('lg:col-span-4')
    }
  })
})

/**
 * §3 held every screen at 768px because Meter had rendered 1888px wide on an
 * unconstrained dashboard. Meter is an SVG with a viewBox, so it magnified
 * rather than reflowed, and the 2px gap §3.1 spends a rule on magnified with
 * it. That is a fact about one component; enforcing it at the page also
 * decided the width of every card grid in the app.
 */
describe('the meter carries its own width', () => {
  const meter = readFileSync(new URL('../components/Meter.tsx', import.meta.url), 'utf8')

  it('caps itself rather than relying on the page', () => {
    expect(meter).toContain("maxWidth: 'var(--meter-max)'")
  })

  it('is narrower than the container, or the cap does nothing', () => {
    expect(parseInt(METER_MAX, 10)).toBeLessThan(parseInt(CONTAINER, 10))
  })
})
