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

/** The debt on 2026-09-10. These numbers may fall. They may not rise. */
const RAW_TYPE_DEBT: Record<string, number> = {
  'app/a/[address]/page.tsx': 2,
  'app/setup/page.tsx': 53,
  'components/AccountsPage.tsx': 5,
  'components/AgentAccessPanel.tsx': 6,
  'components/AgentPanel.tsx': 10,
  'components/DashboardOverview.tsx': 5,
  'components/Feed.tsx': 4,
  'components/LimitsDrawer.tsx': 7,
  'components/McpHandoff.tsx': 8,
  'components/landing/CoreCapabilities.tsx': 1,
  'components/landing/Hero.tsx': 1,
  'components/landing/HowItWorks.tsx': 2,
  'components/landing/LiveProof.tsx': 5,
  'components/landing/ProtectionModel.tsx': 4,
  'components/landing/SecurityBoundary.tsx': 3,
  'components/landing/SiteFooter.tsx': 1,
  'components/landing/SiteHeader.tsx': 2,
  'components/landing/UseCaseGrid.tsx': 1,
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
  'components/landing/Hero.tsx': 4,
  'components/landing/LiveProof.tsx': 1,
  'components/landing/ProtectionModel.tsx': 6,
  'components/landing/SecurityBoundary.tsx': 2,
  'components/landing/SiteFooter.tsx': 1,
  'components/landing/SiteHeader.tsx': 2,
  'components/landing/UseCaseGrid.tsx': 2,
  'components/ui/Section.tsx': 1,
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
      + 'docs/design-system.md §2 and §3 define the scales these bypass.').toEqual([])
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
