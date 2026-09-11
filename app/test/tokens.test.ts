import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BRIGHT_GROUNDS, DARK_GROUNDS, PALETTE, contrastRatio, lightness } from '../lib/tokens.js'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/** WCAG AA: 4.5:1 for body text, 3:1 for non-text UI boundaries. */
const BODY = 4.5
const UI = 3

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#5C6E88', '#5C6E88')).toBeCloseTo(1, 5)
  })

  it('does not care which argument is lighter', () => {
    expect(contrastRatio('#E8EAED', '#0B0D10'))
      .toBeCloseTo(contrastRatio('#0B0D10', '#E8EAED'), 5)
  })
})

/**
 * Five grounds, not two.
 *
 * The old loop checked --bg and --panel. --well was never checked (it is
 * safe: darker than --bg, so everything clears by more), and neither bright
 * ground was -- which is how the "Wrong network" badge came to be drawn in
 * the colour behind it at exactly 1.00:1 on 2026-09-05, at the one moment an
 * owner most needed to read it.
 *
 * This asserts the rule rather than a list of pairs, so a sixth ground added
 * next year is caught here instead of by a person squinting at a screen.
 * docs/design-system.md §4.
 */
describe('the ground rule', () => {
  const foregrounds = ['text', 'dim', 'celo', 'ok', 'bad'] as const

  for (const ground of DARK_GROUNDS) {
    for (const fg of foregrounds) {
      it(`--${fg} reads on the dark ground --${ground}`, () => {
        expect(contrastRatio(PALETTE[fg], PALETTE[ground])).toBeGreaterThanOrEqual(BODY)
      })
    }
  }

  for (const ground of BRIGHT_GROUNDS) {
    it(`--bg reads on the bright ground --${ground}`, () => {
      expect(contrastRatio(PALETTE.bg, PALETTE[ground])).toBeGreaterThanOrEqual(BODY)
    })

    // The other half of the rule, and the half that was violated: on a bright
    // ground nothing but --bg is allowed, so this asserts they would fail.
    for (const fg of foregrounds) {
      it(`--${fg} is refused on the bright ground --${ground}`, () => {
        expect(contrastRatio(PALETTE[fg], PALETTE[ground])).toBeLessThan(BODY)
      })
    }
  }

  it('every ground is classified exactly once', () => {
    const all = [...DARK_GROUNDS, ...BRIGHT_GROUNDS]
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(5)
  })
})

/**
 * --line at rgba(255,255,255,.10) is 1.32:1 on --panel. That is right for a
 * divider and does nothing for a control border: Resume and Disconnect are
 * ghost buttons, and neither may be ambiguous. On a bright ground the border
 * switches to --bg through Button's onDangerBand, so this only has to hold
 * for the dark grounds.
 */
describe('control borders are visible on every dark ground', () => {
  for (const ground of DARK_GROUNDS) {
    it(`--line-control on --${ground}`, () => {
      expect(contrastRatio(PALETTE.lineControl, PALETTE[ground])).toBeGreaterThanOrEqual(UI)
    })
  }
})

describe('non-text boundaries clear AA UI contrast', () => {
  it('the primary button label reads on Celo yellow', () => {
    expect(contrastRatio(PALETTE.bg, PALETTE.celo)).toBeGreaterThanOrEqual(BODY)
  })

  it('the meter fill is visible against its own track', () => {
    expect(contrastRatio(PALETTE.meterFill, PALETTE.well)).toBeGreaterThanOrEqual(UI)
  })

  // Spec §3.1: the fill stops short of the cap line precisely so the line is
  // always drawn on the dark track. If someone lets them touch, these are the
  // ratios that would apply instead -- and --bad on the fill is 1.36.
  it('the cap line reads on the track in both states', () => {
    expect(contrastRatio(PALETTE.celo, PALETTE.well)).toBeGreaterThanOrEqual(UI)
    expect(contrastRatio(PALETTE.bad, PALETTE.well)).toBeGreaterThanOrEqual(UI)
  })
})

/**
 * The .field rule, asserted rather than trusted.
 *
 * Every input in the app drew its border in --line at 1.32:1 until
 * 2026-09-05, including the two that set how much an agent may spend. Found
 * by measuring a rendered page, which is the only place it could be found:
 * this suite runs in the node environment and no component-testing dependency
 * may be added (spec §2.2). So this asserts the CSS text, the same
 * arrangement the type scale keeps.
 *
 * The focus ring is the smaller half. An enabled input was not ringless -- it
 * fell back to Chrome's `auto 1px rgb(0,95,204)`, which is off-palette rather
 * than absent. The first reading here claimed it was missing; that reading
 * was taken on a *disabled* input, where focus never applies and an outline of
 * `none` means nothing. Recorded because the wrong version is the more
 * alarming one and would otherwise be repeated.
 */
/**
 * §4: bright grounds take only --bg. The primary button hovers by moving its
 * own ground, so the hover yellow is a second bright ground and has to clear
 * the same bar -- the rule is about what a reader can read, and a pointer
 * resting on a button does not suspend it.
 */
describe('the hover ground', () => {
  it('still takes the primary button label', () => {
    expect(contrastRatio(PALETTE.celoHover, PALETTE.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('is a step the eye can see', () => {
    // --celo to --celo-hover, against the ground the button sits on.
    const before = contrastRatio(PALETTE.celo, PALETTE.bg)
    const after = contrastRatio(PALETTE.celoHover, PALETTE.bg)
    expect(before - after).toBeGreaterThan(1)
  })
})

/**
 * The grounds, measured in the unit an eye actually uses on two adjacent
 * fills. §4 read them at 1.03-1.11 with `contrastRatio` and concluded a
 * surface could not be told from the page -- true of the numbers, wrong about
 * the tool: a contrast ratio is a foreground instrument and compresses to
 * nothing between dark neighbours.
 *
 * In L* the old grounds stood 4.1 and 1.2 apart, and they stand 8.2 and 2.8
 * apart now. The floor below is what stops a future edit from flattening them
 * back while every contrast assertion above stays green.
 */
describe('the grounds are separate surfaces', () => {
  it('lifts --panel clear of --bg', () => {
    expect(lightness(PALETTE.panel) - lightness(PALETTE.bg)).toBeGreaterThanOrEqual(6)
  })

  it('sinks --well below --bg, by less, because a well is a recess and not a card', () => {
    const step = lightness(PALETTE.bg) - lightness(PALETTE.well)
    expect(step).toBeGreaterThanOrEqual(2)
    expect(step).toBeLessThan(lightness(PALETTE.panel) - lightness(PALETTE.bg))
  })

  /** Still dark. A lift that ends in a light theme is a different product. */
  it('keeps every ground dark', () => {
    for (const g of DARK_GROUNDS) expect(lightness(PALETTE[g])).toBeLessThan(20)
  })
})

describe('the field treatment', () => {
  const field = /\.field\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''

  it('borders controls with --line-control, never the divider', () => {
    expect(field).toMatch(/border:\s*1px solid var\(--line-control\)/)
    expect(field).not.toMatch(/var\(--line\)/)
  })

  /**
   * The width moved to --ring-w on 2026-09-11 so that the input, the button
   * and the inline links cannot disagree about it (design-system.md §11).
   * This asserts the token is what draws the ring -- a literal `2px` here
   * would pass while the rest of the app moved to some other number, which is
   * the drift the token exists to stop. The value itself is asserted once, in
   * test/surface.test.ts.
   */
  it('rings focus in this palette rather than the browser default', () => {
    expect(css).toMatch(/\.field:focus-visible\s*\{[^}]*outline:\s*var\(--ring-w\) solid var\(--text\)/)
  })

  // :focus would ring a mouse user who never asked to see where focus is.
  it('rings the keyboard, not the pointer', () => {
    expect(css).not.toMatch(/\.field:focus\s*\{/)
  })
})

describe('globals.css does not drift from tokens.ts', () => {
  const cssVar: Record<keyof typeof PALETTE, string> = {
    bg: '--bg', panel: '--panel', well: '--well', text: '--text',
    dim: '--dim', celo: '--celo', ok: '--ok', bad: '--bad',
    meterFill: '--meter-fill', lineControl: '--line-control',
    celoHover: '--celo-hover',
  }

  for (const [name, value] of Object.entries(PALETTE)) {
    it(`${cssVar[name as keyof typeof PALETTE]} matches`, () => {
      const declared = new RegExp(
        `${cssVar[name as keyof typeof PALETTE]}\\s*:\\s*(#[0-9A-Fa-f]{6})`,
      ).exec(css)
      expect(declared?.[1]?.toUpperCase()).toBe(value.toUpperCase())
    })
  }
})
