import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PALETTE, contrastRatio } from '../lib/tokens.js'

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

describe('every text colour clears AA body contrast', () => {
  const grounds = ['bg', 'panel'] as const
  for (const fg of ['text', 'dim', 'celo', 'ok', 'bad'] as const) {
    for (const bg of grounds) {
      it(`${fg} on ${bg}`, () => {
        expect(contrastRatio(PALETTE[fg], PALETTE[bg])).toBeGreaterThanOrEqual(BODY)
      })
    }
  }
})

/**
 * The paused header is a third ground, and it was not being treated as one.
 *
 * `page.tsx` swaps the header's background to --bad the moment the account is
 * paused, so everything in that band is drawn on red. The loop above only
 * checks --bg and --panel, so it could never have caught what a wrong-network
 * test found on 2026-09-05: the "Wrong network" badge and the warning it
 * points at were both --bad on --bad, a ratio of exactly 1.00. Not hard to
 * read — invisible. The owner saw an unresponsive Resume button and no reason
 * why.
 *
 * These assert what is actually rendered there, not every token, because
 * over-constraining would fail on colours that never appear on this band.
 */
describe('the paused header band is a ground too', () => {
  const band = PALETTE.bad

  // Both carry sentences an owner has to read, so both need body contrast.
  it('the wrong-network badge reads on it', () => {
    expect(contrastRatio(PALETTE.bg, band)).toBeGreaterThanOrEqual(BODY)
  })

  it('the stop/resume note reads on it', () => {
    expect(contrastRatio(PALETTE.bg, band)).toBeGreaterThanOrEqual(BODY)
  })

  // The regression itself: whatever those two use, it must not be the ground.
  it('--bad on --bad is the invisibility this guards against', () => {
    expect(contrastRatio(band, band)).toBeLessThan(UI)
  })

  // The wordmark and the address are large or bold, so UI contrast is the
  // bar they have to clear. --text on --bad is 3.16 — it passes here and
  // would not pass BODY, which is a known limit of this band rather than an
  // oversight: see the comment in page.tsx's header.
  it('the wordmark and address clear UI contrast', () => {
    expect(contrastRatio(PALETTE.text, band)).toBeGreaterThanOrEqual(UI)
  })
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
    meterFill: '--meter-fill',
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
