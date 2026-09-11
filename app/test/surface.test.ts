import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RADIUS, FOCUS, MOTION } from '../lib/surface.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

/**
 * The same arrangement tokens.test.ts and type.test.ts keep: lib/surface.ts is
 * the assertion, globals.css is the runtime, and this fails when they
 * disagree. docs/design-system.md §10–§13.
 */

describe('the three corners', () => {
  for (const [name, value] of Object.entries(RADIUS)) {
    it(`--r-${name} is ${value} in globals.css`, () => {
      expect(css).toContain(`--r-${name}: ${value};`)
    })
  }

  // §10's whole content is that there is no fourth. A design with one radius
  // on everything cannot say that a status dot and a submit button are
  // different kinds of object; a design with five has stopped saying anything.
  it('declares exactly three, and they are the three named here', () => {
    const declared = [...css.matchAll(/--r-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(declared).toEqual(Object.keys(RADIUS).sort())
  })
})

describe('the one focus ring', () => {
  it('is the width lib/surface.ts records', () => {
    expect(css).toContain(`--ring-w: ${FOCUS.width};`)
  })

  it('has both offsets, and only those two', () => {
    expect(css).toContain(`--ring-gap: ${FOCUS.offset};`)
    expect(css).toContain(`--ring-inset: ${FOCUS.inset};`)
    const declared = [...css.matchAll(/--ring-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(declared).toEqual(['gap', 'inset', 'w'])
  })

  /**
   * Measured 2026-09-05, an enabled input fell back to Chrome's own
   * `auto 1px rgb(0,95,204)`. Present, so never an accessibility hole, but a
   * pixel of browser blue in a dark terminal UI. The floor is what stops a
   * future edit from calling that good enough again.
   */
  it('is at least 2px, because 1px was the defect', () => {
    expect(parseInt(FOCUS.width, 10)).toBeGreaterThanOrEqual(2)
  })

  it('draws both classes from the width token rather than a literal', () => {
    for (const selector of ['.focus-ring:focus-visible', '.focus-ring-inset:focus-visible']) {
      const block = css.slice(css.indexOf(selector))
      expect(block.slice(0, block.indexOf('}'))).toContain('var(--ring-w)')
    }
  })

  /**
   * Tailwind ships `ring` and `ring-inset` as box-shadow utilities. A class of
   * ours under either name would be emitted alongside it and paint a shadow
   * this design does not have (§13), on the one control state where a reader
   * most needs to see the truth.
   */
  it('does not use a selector Tailwind already owns', () => {
    expect(css).not.toMatch(/^\.ring(-inset)?[\s:{]/m)
  })
})

describe('motion', () => {
  for (const [name, value] of Object.entries(MOTION)) {
    it(`--m-${name} is ${value} in globals.css`, () => {
      expect(css).toContain(`--m-${name}: ${value};`)
    })
  }

  it('declares exactly two durations', () => {
    const declared = [...css.matchAll(/--m-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(declared).toEqual(Object.keys(MOTION).sort())
  })

  it('is slower for the meter than for a state the reader caused', () => {
    expect(parseInt(MOTION.slow, 10)).toBeGreaterThan(parseInt(MOTION.fast, 10))
  })

  /**
   * The guard is blanket and global on purpose. The alternative is
   * remembering the media query at every call site, which is exactly how the
   * focus ring came to be written out by hand fourteen times.
   */
  it('honours prefers-reduced-motion for every transition, not per component', () => {
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(guard).toContain('transition-duration: 1ms !important')
    expect(guard).toContain('animation-duration: 1ms !important')
  })
})

/**
 * §13: this app has no layer above the page, and that is a decision rather
 * than an omission. Depth is a change of ground (--well < --bg < --panel), so
 * a soft grey shadow would be both invisible on #0B0D10 and the one ornament
 * the direction in §1 refuses. Measured 2026-09-11: zero of each.
 *
 * A ratchet whose recorded debt is zero is a ban. If a real overlay is ever
 * needed it is <dialog>, which lives in the browser's top layer and still
 * needs no z-index -- and if that turns out to be wrong, §9 says change the
 * document first and this test second.
 */
describe('no elevation', () => {
  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`
      if (statSync(join(ROOT, rel)).isDirectory()) {
        if (entry.startsWith('.')) continue
        sources(rel, found)
      } else if (entry.endsWith('.tsx')) {
        found.push(rel)
      }
    }
    return found
  }

  const FILES = [...sources('app'), ...sources('components')].sort()

  it.each([
    ['shadows', /(?<![\w-])(?:drop-)?shadow-[a-z0-9[]|boxShadow|box-shadow/],
    ['stacking order', /(?<![\w-])z-(?:\d|\[)|zIndex|z-index/],
  ])('has no %s', (_what, pattern) => {
    const offenders = FILES
      .filter((f) => pattern.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
