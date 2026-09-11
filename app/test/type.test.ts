import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SCALE } from '../lib/type.js'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/**
 * The same arrangement PALETTE keeps with globals.css, for the same reason:
 * the CSS is what runs and this module is what the tests can reason about.
 * Six sizes doing six jobs is the whole point of the scale, so a seventh
 * appearing in the CSS without appearing here is a drift worth failing on.
 */
describe('globals.css does not drift from type.ts', () => {
  for (const [name, step] of Object.entries(SCALE)) {
    it(`--t-${name} matches`, () => {
      const declared = new RegExp(`--t-${name}\\s*:\\s*([0-9.]+px)`).exec(css)
      expect(declared?.[1]).toBe(step.size)
    })

    it(`--t-${name}-line matches`, () => {
      const declared = new RegExp(`--t-${name}-line\\s*:\\s*([0-9.]+)`).exec(css)
      expect(declared?.[1]).toBe(step.line)
    })
  }
})

describe('the scale', () => {
  const px = (v: string) => Number(v.replace('px', ''))

  /**
   * Descends, with exactly one tie.
   *
   * --t-subhead and --t-body are both 14px and are separated by family, not
   * size: §1 makes mono what a reader looks at and sans what they read, and a
   * card title is looked at. That is the only pair allowed to tie, and it has
   * to be adjacent -- a tie anywhere else is two steps doing one job, which is
   * how the app ended up with text-sm carrying 39 uses.
   */
  it('descends, tying only at subhead and body', () => {
    const entries = Object.entries(SCALE)
    const ties: string[] = []
    for (let i = 1; i < entries.length; i++) {
      const [prevName, prev] = entries[i - 1]
      const [name, step] = entries[i]
      const a = px(prev.size)
      const b = px(step.size)
      expect(b).toBeLessThanOrEqual(a)
      if (b === a) ties.push(`${prevName}/${name}`)
    }
    expect(ties).toEqual(['subhead/body'])
  })

  /**
   * §2's rule is that a seventh step means one of the six is doing two jobs.
   * Measured 2026-09-11, --t-heading was: it carried section titles *and* the
   * title of every block below one, because 16 call sites wrote
   * `text-sm font-semibold` rather than find a rank that did not exist.
   */
  it('has exactly seven steps', () => {
    expect(Object.keys(SCALE)).toHaveLength(7)
  })

  // The hero is text-3xl sm:text-4xl today. A flat --t-title would shrink it
  // on desktop, which is a regression dressed as a system.
  it('keeps the title responsive at the sm breakpoint', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*?--t-title\s*:\s*36px/)
  })
})
