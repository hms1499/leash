import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The scale tests next door assert that globals.css matches lib/type.ts. That
 * is the whole rule only if the app then uses the scale, and measured
 * 2026-09-10 it largely did not.
 *
 * docs/design-system.md §2 records `text-sm` at 39 uses as the defect the six
 * steps were introduced to fix. There are 120 raw sizes now, 53 of them in
 * one file. §3 says `mt-1` and `mt-8/10/14/16` "are removed"; `mt-1` alone
 * appears 17 times. The suite stayed green through all of it, because nothing
 * looked at how the tokens were used -- and §9 of that document asks for
 * exactly this: change the rule first and the code second, so the two never
 * drift.
 *
 * This is a ratchet, not a cliff. Every count below is a debt that exists
 * today, recorded so it cannot grow and so a reader can see its size. Fail on
 * more, fail on a file that is not listed, and fail on a listed file that has
 * been cleaned up without lowering its number -- the last one is what keeps
 * the list honest as the debt is paid down.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** §2. Six steps, and none of them is a Tailwind size utility. */
const RAW_TYPE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g

/**
 * §3, the four steps: 2 inside a control, 3 between related items, 6 between
 * blocks, 12 between sections.
 *
 * Margins and gaps only. Padding is deliberately not policed here: `PAGE` is
 * itself `px-4`, and §3 lists `p-4` among the measurements of the problem
 * without putting it among the four steps -- so a test banning it would be
 * asserting a rule that document does not make. Reading `4` as an error there
 * is a judgement for a person, not for a regex.
 */
const OFF_SCALE_GAP = /(?<![\w-])(?:m[trblxy]?|gap(?:-[xy])?|space-[xy])-(\d+)(?![\w.[])/g
const STEPS = new Set(['0', '2', '3', '6', '12'])

/**
 * §14, padding. The comment above says padding was deliberately not policed,
 * because §3's four steps were never claimed to govern it and reading `4` as
 * an error was left to a person. §14 makes the judgement the regex was
 * missing: the four steps govern padding too, and `4` is legal on the
 * horizontal axis only.
 *
 * That one exception is not a compromise, it is the measurement. `PAGE` is
 * `px-4` and §3 spends a paragraph on why the gutter is 16px and not 24, and
 * `Button` is `px-4 py-2` because a control is wider than it is tall. Both
 * are deliberate; `p-4` on a panel is the thing that drifted, at 11 uses.
 *
 * Group 1 is the axis and the value together, so `keep` can tell `px-4` from
 * `p-4` -- which is the whole rule.
 */
const OFF_SCALE_PAD = /(?<![\w-])p([trblxy]?-\d+)(?![\w.[])/g
const HORIZONTAL = new Set(['x', 'l', 'r'])

function offScalePad(token: string): boolean {
  const [, axis, value] = token.match(/^([trblxy]?)-(\d+)$/) ?? []
  if (value === undefined) return false
  if (STEPS.has(value)) return false
  return !(value === '4' && HORIZONTAL.has(axis))
}

/**
 * §11, the focus ring. Measured 2026-09-11 it was written out by hand at 14
 * call sites in 10 files, every one of them correct and none of them the
 * reason the next one would be. `.focus-ring` in globals.css is now the
 * declaration; Button, ActionLink and BrandLink moved onto it, and these are
 * what is left.
 *
 * Matching `focus-visible:outline-2` rather than the whole three-utility
 * string: the width is the part that must not be re-decided, and a call site
 * that writes only two of the three is the same debt.
 */
const HAND_ROLLED_RING = /(focus-visible:outline-2)/g

/** The debt on 2026-09-10. These numbers may fall. They may not rise. */
const RAW_TYPE_DEBT: Record<string, number> = {
  'app/a/[address]/page.tsx': 2,
  'app/setup/page.tsx': 30,
  'components/AccountsPage.tsx': 5,
  'components/AgentAccessPanel.tsx': 6,
  'components/AgentPanel.tsx': 7,
  'components/DashboardOverview.tsx': 3,
  'components/Feed.tsx': 4,
  'components/LimitsDrawer.tsx': 7,
  'components/McpHandoff.tsx': 7,
  'components/landing/HowItWorks.tsx': 1,
  'components/landing/LiveProof.tsx': 5,
}

const OFF_SCALE_GAP_DEBT: Record<string, number> = {
  // 44 on 2026-09-10. One `mt-5` left when the two competing alert regions
  // below the stepper became one `mt-6`.
  'app/setup/page.tsx': 43,
  'components/AccountsPage.tsx': 3,
  'components/AgentAccessPanel.tsx': 3,
  'components/AgentPanel.tsx': 3,
  'components/DashboardOverview.tsx': 5,
  'components/Feed.tsx': 1,
  'components/LimitsDrawer.tsx': 5,
  'components/McpHandoff.tsx': 4,
  'components/Meter.tsx': 2,
  'components/landing/CoreCapabilities.tsx': 1,
  'components/landing/Hero.tsx': 2,
  'components/landing/LiveProof.tsx': 1,
  'components/landing/ProtectionModel.tsx': 4,
  'components/landing/SecurityBoundary.tsx': 2,
  'components/landing/SiteHeader.tsx': 1,
  'components/landing/UseCaseGrid.tsx': 2,
  'components/ui/Section.tsx': 1,
}

/** §14. 38 off-scale paddings on 2026-09-11, `p-4` the largest share at 11. */
const OFF_SCALE_PAD_DEBT: Record<string, number> = {
  'app/a/[address]/page.tsx': 1,
  'app/setup/page.tsx': 13,
  'components/AccountsPage.tsx': 2,
  'components/AgentAccessPanel.tsx': 1,
  'components/AgentPanel.tsx': 2,
  'components/DashboardOverview.tsx': 2,
  'components/LimitsDrawer.tsx': 3,
  'components/McpHandoff.tsx': 1,
  'components/landing/CoreCapabilities.tsx': 1,
  'components/landing/FinalCta.tsx': 3,
  'components/landing/Hero.tsx': 3,
  'components/landing/SecurityBoundary.tsx': 2,
  'components/landing/SiteFooter.tsx': 1,
  'components/landing/UseCaseGrid.tsx': 1,
  'components/ui/Section.tsx': 2,
}

/** §11. What is left after the three ui/ primitives moved to `.focus-ring`. */
const HAND_ROLLED_RING_DEBT: Record<string, number> = {
  // 14 on 2026-09-11. Button, ActionLink and BrandLink account for the three
  // that are gone; these are the call sites no primitive owns yet.
  'app/setup/page.tsx': 3,
  'components/AccountSwitcher.tsx': 1,
  'components/Feed.tsx': 1,
  'components/LimitsDrawer.tsx': 1,
  'components/landing/SecurityBoundary.tsx': 1,
  'components/landing/SiteFooter.tsx': 2,
}

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      // .next-dev holds a build of the same components; counting it would
      // double every number here.
      if (entry.startsWith('.')) continue
      sources(rel, found)
    } else if (entry.endsWith('.tsx')) {
      found.push(rel)
    }
  }
  return found
}

const FILES = [...sources('app'), ...sources('components')].sort()

function count(file: string, pattern: RegExp, keep: (value: string) => boolean): number {
  const src = readFileSync(join(ROOT, file), 'utf8')
  return [...src.matchAll(pattern)].filter((m) => keep(m[1])).length
}

describe.each([
  ['raw Tailwind type sizes', RAW_TYPE, RAW_TYPE_DEBT, () => true],
  ['off-scale margins and gaps', OFF_SCALE_GAP, OFF_SCALE_GAP_DEBT, (v: string) => !STEPS.has(v)],
  ['off-scale padding', OFF_SCALE_PAD, OFF_SCALE_PAD_DEBT, offScalePad],
  ['hand-written focus rings', HAND_ROLLED_RING, HAND_ROLLED_RING_DEBT, () => true],
] as const)('%s', (what, pattern, debt, keep) => {
  it('has found every file the debt list names', () => {
    // A renamed or deleted file must take its entry with it, or the ratchet
    // silently stops watching whatever replaced it.
    expect(Object.keys(debt).filter((f) => !FILES.includes(f))).toEqual([])
  })

  it(`introduces no new ${what}`, () => {
    const grown = FILES
      .map((file) => ({ file, now: count(file, new RegExp(pattern), keep), was: debt[file] ?? 0 }))
      .filter(({ now, was }) => now > was)
      .map(({ file, now, was }) => `${file}: ${was} → ${now}`)

    expect(grown, `${what} increased:\n${grown.join('\n')}\n\n`
      + 'docs/design-system.md §2, §3, §11 and §14 define the rules these bypass.').toEqual([])
  })

  it('has a debt list that still matches the code', () => {
    const stale = FILES
      .map((file) => ({ file, now: count(file, new RegExp(pattern), keep), was: debt[file] ?? 0 }))
      .filter(({ now, was }) => now < was)
      .map(({ file, now, was }) => `${file}: ${was} → ${now}`)

    expect(stale, `${what} were cleaned up without lowering the debt list:\n`
      + `${stale.join('\n')}\n\nLower the numbers in this file, or delete the entry at zero.`)
      .toEqual([])
  })
})
