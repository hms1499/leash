import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PALETTE, contrastRatio, DARK_GROUNDS, BRIGHT_GROUNDS } from '../lib/tokens.js'

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

describe('globals.css does not drift from tokens.ts', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  const cssVar: Record<keyof typeof PALETTE, string> = {
    bg: '--bg', panel: '--panel', well: '--well', text: '--text',
    dim: '--dim', celo: '--celo', ok: '--ok', bad: '--bad',
    meterFill: '--meter-fill', lineControl: '--line-control',
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
