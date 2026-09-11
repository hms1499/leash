import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RADIUS, FOCUS, MOTION, EASE } from '../lib/surface.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

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

/** Every component and route in the app. Shared by the usage ratchets below. */
const FILES = [...sources('app'), ...sources('components')].sort()

/**
 * The same arrangement tokens.test.ts and type.test.ts keep: lib/surface.ts is
 * the assertion, globals.css is the runtime, and this fails when they
 * disagree. docs/design-system.md §10–§13.
 */

describe('the four corners', () => {
  for (const [name, value] of Object.entries(RADIUS)) {
    it(`--r-${name} is ${value} in globals.css`, () => {
      expect(css).toContain(`--r-${name}: ${value};`)
    })
  }

  // §10's whole content is that there is no fourth. A design with one radius
  // on everything cannot say that a status dot and a submit button are
  // different kinds of object; a design with five has stopped saying anything.
  it('declares exactly four, and they are the four named here', () => {
    const declared = [...css.matchAll(/--r-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(declared).toEqual(Object.keys(RADIUS).sort())
  })

  /**
   * The first version of §10 grepped `rounded*` classes and `border-radius`
   * in CSS and concluded there were three radii. It never counted inline
   * numeric `borderRadius`, and there were four more: Panel at 8, the meter
   * card at 8, STATUS_BOX at 6, McpHandoff's well at 4. The most-used
   * container in the product was at a value the rule said did not exist.
   *
   * A ratchet at zero, so the next inline literal fails here rather than
   * being found by a re-measurement a month later.
   */
  it('has no inline numeric borderRadius left anywhere', () => {
    const offenders = FILES
      .map((f) => ({ f, hits: [...readFileSync(join(ROOT, f), 'utf8')
        .matchAll(/borderRadius:\s*\d/g)].length }))
      .filter(({ hits }) => hits > 0)
      .map(({ f, hits }) => `${f}: ${hits}`)
    expect(offenders).toEqual([])
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
   * §12 was written as a ceiling: it named two durations for an app that had
   * zero CSS transitions, so both tokens described movement that did not
   * exist. They are spent now, and these say on what -- a rule that names
   * three cases and is spent on none of them is not a rule, it is a note.
   */
  it('spends --m-fast on the states §12 named, from the token', () => {
    for (const rule of ['.motion-reveal {', '.motion-control {', '.motion-press {']) {
      const at = css.indexOf(rule)
      expect(at, `${rule} is missing from globals.css`).toBeGreaterThan(-1)
      expect(css.slice(at, css.indexOf('}', at))).toContain('var(--m-fast)')
    }
  })

  /**
   * §12: "--m-slow has exactly one user." A second thing at 400ms competes
   * with the meter for the eye, and the meter is the instrument. One is also
   * the floor -- it was zero until the fill was given the transition the
   * token was named for.
   */
  it('spends --m-slow on the meter, and on nothing else', () => {
    expect([...css.matchAll(/var\(--m-slow\)/g)]).toHaveLength(1)
    const at = css.indexOf('.meter-fill {')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(at, css.indexOf('}', at))).toContain('transition: width var(--m-slow)')
  })

  /**
   * A press is the one piece of a consumer app's feel that survives §1: it
   * says the control took the press, which is information, where a shadow
   * lifting says the control floats, which §13 refuses. It is also the case a
   * reader notices by its absence -- a wallet confirmation can take seconds,
   * and until it opens the only thing that answered the finger is this.
   *
   * A file-level ratchet rather than a per-tag one: a JSX opening tag can
   * carry an arrow function, so `>` is not a reliable end of it. The coarse
   * version still catches the case that matters, which is a new file with a
   * hand-rolled control in it -- the way the focus ring reached ten files.
   */
  it('has no file with a raw control that does not take a press', () => {
    const offenders = FILES
      .filter((f) => {
        const src = readFileSync(join(ROOT, f), 'utf8')
        // Comments stripped first: Label.tsx names `<button>` in prose,
        // explaining which component owns one, and that is documentation
        // rather than a control.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        return /<(?:button|summary)[\s>]/.test(code) && !code.includes('motion-press')
      })
    expect(offenders, 'a <button> or <summary> here answers a press with nothing. '
      + 'Use ui/Button, or add `motion-press`. docs/design-system.md §12.').toEqual([])
  })

  /**
   * One curve, for the same reason there are two durations and not five: a
   * second easing is a second opinion about how this interface moves, and
   * whoever writes it is deciding for the whole app from inside one file.
   */
  it('has one easing curve, and every user of it takes the token', () => {
    expect(css).toContain(`--ease-settle: ${EASE};`)
    const declared = [...css.matchAll(/--ease-([a-z]+):/g)].map((m) => m[1])
    expect(declared).toEqual(['settle'])
    // Nothing left on a hand-written curve or on the browser's own keywords.
    for (const rule of ['.motion-reveal {', '.motion-press {', '.meter-fill {']) {
      const at = css.indexOf(rule)
      expect(css.slice(at, css.indexOf('}', at))).toContain('var(--ease-settle)')
    }
    expect(css).not.toMatch(/transition:[^;]*\bease-(?:in|out)\b/)
  })

  /**
   * §4 puts the hover in globals.css because it has to: an inline style beats
   * any rule a stylesheet can write, which is what kept Button and ActionLink
   * from having one at all. A `hover:` utility at a call site would be a
   * second answer to the same question, decided by whoever wrote that line --
   * the shape the focus ring had before §11.
   */
  it('has no component deciding its own hover', () => {
    const offenders = FILES
      .map((f) => ({ f, hits: [...readFileSync(join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        .matchAll(/(?<![\w-])hover[:-]|:hover/g)].length }))
      .filter(({ hits }) => hits > 0)
      .map(({ f, hits }) => `${f}: ${hits}`)
    expect(offenders, 'the hover is one rule in globals.css. docs/design-system.md §4.')
      .toEqual([])
  })

  /**
   * Two classes and the meter are the whole vocabulary. A duration written
   * inline at a call site is how the focus ring reached fourteen copies, and
   * it also escapes `lib/surface.ts` -- the file these tests read to know what
   * the app is allowed to spend.
   */
  it('has no component writing a duration of its own', () => {
    const offenders = FILES
      .map((f) => ({ f, hits: [...readFileSync(join(ROOT, f), 'utf8')
        .matchAll(/transitionDuration|animationDuration|(?<![\w-])(?:duration|animate|active:scale)-\[?/g)].length }))
      .filter(({ hits }) => hits > 0)
      .map(({ f, hits }) => `${f}: ${hits}`)
    expect(offenders).toEqual([])
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
 * §4's bright-ground rule, and how it is delivered.
 *
 * The rule itself is asserted in tokens.test.ts against the palette. This is
 * the other half: a control on a bright band has to *receive* it. It used to
 * arrive as an `onDangerBand` prop, one component at a time, and measured on
 * 2026-09-11 two of the four controls on that band had never been handed it --
 * `AccountSwitcher`'s "My accounts" and `ConnectButton` -- so both drew
 * `--text` on `--bad` at 2.44 against a 4.5 bar, on the screen a reader opens
 * because something is wrong. Found by reading the rendered page, which is
 * where it could be found: the palette was never the thing that was broken.
 */
describe('the bright band', () => {
  it('is declared by whatever paints it', () => {
    const header = readFileSync(join(ROOT, 'components/ui/AppHeader.tsx'), 'utf8')
    expect(header).toContain("className={danger ? 'on-bright' : undefined}")
  })

  it('gives every control inside it the only foreground §4 allows', () => {
    for (const rule of ['.on-bright .control-ghost,', '.on-bright .control-primary {', '.on-bright .control-text {']) {
      expect(css, `${rule} is missing from globals.css`).toContain(rule)
    }
    const ghost = css.slice(css.indexOf('.on-bright .control-ghost,'))
    expect(ghost.slice(0, ghost.indexOf('}'))).toContain('color: var(--bg)')
  })

  /**
   * A control that writes its own border cannot be reached by that rule --
   * which is exactly how the switcher came to be wrong. The three that remain
   * are the wizard's stepper and its two recipient choices: their border is
   * conditional on which one is selected, and none of them sits on a bright
   * band. The number may fall. It may not rise.
   */
  it('has no new control drawing its own border', () => {
    const debt: Record<string, number> = {
      'app/setup/page.tsx': 3,
      // A status pill, not a control -- §10: a pill in this UI means status.
      // It borrows the control border only for its visibility, and it sits on
      // a panel, never on a bright band.
      'components/landing/ProtectionModel.tsx': 1,
    }
    const counted = FILES
      .map((f) => ({ f, hits: [...readFileSync(join(ROOT, f), 'utf8')
        .matchAll(/(?<!--)\bborder(?:Color)?:[^,\n]*--line-control/g)].length }))
      .filter(({ hits }) => hits > 0)
    expect(counted.filter(({ f, hits }) => hits > (debt[f] ?? 0))
      .map(({ f, hits }) => `${f}: ${debt[f] ?? 0} → ${hits}`)).toEqual([])
    expect(counted.filter(({ f, hits }) => hits < (debt[f] ?? 0))
      .map(({ f, hits }) => `${f}: ${debt[f] ?? 0} → ${hits}`)).toEqual([])
  })
})

/**
 * §17: the mark is filled geometry in `currentColor` and carries no stroke.
 *
 * Both halves are load-bearing. A hex here would be a second place where a
 * colour has to be remembered, and the first place anyone forgets is the
 * bright band -- the defect §4 was just fixed for. A stroke has a width that
 * does not scale with the type step the mark is set at, so the wordmark and a
 * hero would carry two different line weights.
 */
describe('the mark', () => {
  const mark = readFileSync(join(ROOT, 'components/ui/Mark.tsx'), 'utf8')

  it('takes its colour from whatever it sits in', () => {
    expect(mark).toContain('fill="currentColor"')
    expect(mark.match(/#[0-9A-Fa-f]{3,8}/g)).toBeNull()
  })

  it('is drawn in fill, not in stroke', () => {
    expect(mark).not.toMatch(/stroke[-A-Za-z]*[=:]/)
  })

  /** Height, not width: the mark is measured the way the type beside it is. */
  it('is set by its height', () => {
    expect(mark).toContain("height: size")
    expect(mark).toContain("width: 'auto'")
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
  it.each([
    ['shadows', /(?<![\w-])(?:drop-)?shadow-[a-z0-9[]|boxShadow|box-shadow/],
    ['stacking order', /(?<![\w-])z-(?:\d|\[)|zIndex|z-index/],
  ])('has no %s', (_what, pattern) => {
    const offenders = FILES
      .filter((f) => pattern.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
