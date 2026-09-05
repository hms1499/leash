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

  // A scale whose steps are not strictly descending has two steps doing one
  // job, which is how the app ended up with text-sm carrying 39 uses.
  it('descends strictly', () => {
    const sizes = Object.values(SCALE).map((s) => px(s.size))
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1])
    }
  })

  it('has exactly six steps', () => {
    expect(Object.keys(SCALE)).toHaveLength(6)
  })

  // The hero is text-3xl sm:text-4xl today. A flat --t-title would shrink it
  // on desktop, which is a regression dressed as a system.
  it('keeps the title responsive at the sm breakpoint', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*?--t-title\s*:\s*36px/)
  })
})
