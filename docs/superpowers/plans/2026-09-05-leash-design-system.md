# Leash Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply `docs/design-system.md` to `app/` — a real type scale, four spacing steps, named grounds, two merged components, and the three screens the app does not have.

**Architecture:** Foundation first, then one screen at a time. Tasks 1 and 2 add tokens and rules with tests but change almost nothing visible; Tasks 3–8 spend them. Every task ends with a green suite and a commit, so work can stop after any task and leave an app that is internally consistent rather than half-migrated.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind 3, vitest (node environment), TypeScript.

**Spec:** `docs/design-system.md`

## Global Constraints

- **No component-testing dependency may be added** (spec §2.2). vitest runs in the node environment. Any display decision that needs a test goes in `app/lib/` as a pure function, the way `meterState` and `spendBand` already do.
- **Tokens exist twice** — as data in `app/lib/` and as CSS custom properties in `app/app/globals.css` — with a drift test that fails when they disagree. Edit both.
- **Money is `.num`**: mono and `tabular-nums`, always (`CLAUDE.md`).
- **Only four spacing steps**: `2` (8px, inside a control), `3` (12px, between related items), `6` (24px, between blocks), `12` (48px, between sections).
- **The ground rule**: dark grounds (`--bg`, `--panel`, `--well`) take any foreground except `--bg`; bright grounds (`--bad`, `--celo`) take **only** `--bg`.
- **Never report what was not observed.** The five states in design-system §5 are a contract, not suggestions.
- **Comments explain why**, especially where a line guards a hazard this project paid for. Do not strip existing ones.
- **Commit subjects describe the defect or the change in plain English**, not the diff.
- **Before every commit**, from the repo root: `pnpm -F @leash/app test` and `(cd app && npx tsc --noEmit)`. Both must be clean.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `app/lib/type.ts` | the type scale as data; the assertion the drift test checks |
| `app/test/type.test.ts` | drift + invariants for the scale |
| `app/components/ui/Address.tsx` | one address component: truncated or full, optionally copyable, optionally linked |
| `app/app/not-found.tsx` | 404 in the system's voice |
| `app/app/error.tsx` | render-error boundary that says nothing about the chain |
| `app/components/ui/Shell.tsx` | the header band the three message screens share |

**Deleted**

| File | Why |
|---|---|
| `app/components/ui/AddressChip.tsx` | absorbed by `Address` |
| `app/components/CopyAddress.tsx` | absorbed by `Address` |

**Modified** — `globals.css`, `layout.tsx`, `tokens.ts`, `tokens.test.ts`, `Button.tsx`, `Label.tsx`, `Section.tsx`, `Stat.tsx`, `Meter.tsx`, `meter.ts`, `meter.test.ts`, `StopButton.tsx`, `NetworkBadge.tsx`, `a/[address]/page.tsx`, `setup/page.tsx`, `landing/LiveProof.tsx`, `landing/Hero.tsx`.

---

## Task 1: The type scale, and the font that carries it

**Files:**
- Create: `app/lib/type.ts`
- Create: `app/test/type.test.ts`
- Modify: `app/app/globals.css`
- Modify: `app/app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SCALE` (a record of six steps, each `{ size: string; line: string }`), `type StepName`, and the CSS custom properties `--t-display`, `--t-title`, `--t-heading`, `--t-body`, `--t-data`, `--t-label` plus a `-line` sibling for each, and `--mono` / `--sans`.

Nothing visible changes except the typeface. Later tasks spend these.

- [ ] **Step 1: Write the failing test**

Create `app/test/type.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm -F @leash/app test type`
Expected: FAIL — `Cannot find module '../lib/type.js'`.

- [ ] **Step 3: Write the scale**

Create `app/lib/type.ts`:

```ts
/**
 * The type scale as data, so the drift test can check it against globals.css.
 *
 * Components read `var(--t-*)` from the CSS and never this module -- the CSS
 * is the runtime source and this is the assertion. Same arrangement as
 * PALETTE in tokens.ts, and adopted for the same reason: a rule that lives in
 * only one place drifts silently.
 *
 * Six steps replace two. Measured 2026-09-05, `text-sm` carried 39 of the
 * app's uses and section headings were rendered through Label at 11px, which
 * left a cliff from 36px to 11px with no rank in between. `heading` is that
 * missing rank. See docs/design-system.md §2.
 */
export const SCALE = {
  display: { size: '44px', line: '1.0' },
  title: { size: '30px', line: '1.2' },
  heading: { size: '18px', line: '1.35' },
  body: { size: '14px', line: '1.65' },
  data: { size: '13px', line: '1.55' },
  label: { size: '11px', line: '1.3' },
} as const

export type StepName = keyof typeof SCALE
```

- [ ] **Step 4: Declare the same values in CSS**

In `app/app/globals.css`, inside the existing `:root` block, after `--meter-fill`:

```css
  /* The type scale. Asserted in test/type.test.ts against lib/type.ts, which
     fails if the two ever disagree. docs/design-system.md §2. */
  --t-display: 44px;  --t-display-line: 1.0;
  --t-title: 30px;    --t-title-line: 1.2;
  --t-heading: 18px;  --t-heading-line: 1.35;
  --t-body: 14px;     --t-body-line: 1.65;
  --t-data: 13px;     --t-data-line: 1.55;
  --t-label: 11px;    --t-label-line: 1.3;

  /* Mono is what a reader looks at; sans is what they read. The landing page
     has to persuade someone skimming, and that is where mono costs most. */
  --mono: var(--font-mono), ui-monospace, "SF Mono", Menlo, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* The hero was text-3xl sm:text-4xl before the scale existed. Flattening it
   to 30px would have shrunk it on desktop. */
@media (min-width: 640px) {
  :root { --t-title: 36px; }
}
```

Note the closing `}` above belongs to the existing `:root` block — do not add a second one.

Then change the existing `.num` rule to use the token:

```css
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Load JetBrains Mono**

Replace `app/app/layout.tsx` in full:

```tsx
import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'

/**
 * Self-hosted at build time by next/font, not fetched from Google at runtime:
 * faster, and it leaks no referrer.
 *
 * SF Mono is reached on Apple devices through `ui-monospace` and looks
 * excellent there, but Apple's licence does not permit shipping it as a
 * webfont. In a design where everything is mono, a judge on Windows falling
 * back to Consolas is not a subtle substitution. What is designed should be
 * what is seen. docs/design-system.md §2.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Leash — an agent wallet you do not have to trust',
  description:
    'Spend limits for an AI agent, enforced by a contract on Celo mainnet rather than by a prompt. Live, verifiable, and open source.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Run the suite and the typechecker**

Run: `pnpm -F @leash/app test` — expect all green, including the new `type.test.ts`.
Run: `(cd app && npx tsc --noEmit)` — expect exit 0.

- [ ] **Step 7: See it in the browser**

Run `pnpm -F @leash/app dev`, open `http://localhost:3000`, and confirm the page renders in JetBrains Mono rather than the system mono. Nothing else should have moved.

- [ ] **Step 8: Commit**

```bash
git add app/lib/type.ts app/test/type.test.ts app/app/globals.css app/app/layout.tsx
git commit -m "feat(app): the app had two type sizes and now has a scale

text-sm carried 39 of the app's uses and section headings went through Label
at 11px, so there was a cliff from 36px to 11px with no rank between. Six
steps replace that, with the 18px heading as the rank that was missing, and a
drift test holds them to globals.css the way PALETTE already is.

JetBrains Mono is self-hosted through next/font. SF Mono looks better on this
machine and cannot be shipped as a webfont, so what is designed would not have
been what a judge on Windows sees.

Nothing spends the scale yet."
```

---

## Task 2: Name the grounds, and make the rule a test

**Files:**
- Modify: `app/lib/tokens.ts`
- Modify: `app/app/globals.css`
- Modify: `app/test/tokens.test.ts`
- Modify: `app/components/ui/Button.tsx`
- Modify: `app/components/StopButton.tsx:83`
- Modify: `app/app/a/[address]/page.tsx:150-186`

**Interfaces:**
- Consumes: `PALETTE`, `contrastRatio` from `app/lib/tokens.ts`.
- Produces: `DARK_GROUNDS: readonly TokenName[]`, `BRIGHT_GROUNDS: readonly TokenName[]`, `PALETTE.lineControl`, the CSS property `--line-control`, and a `onDangerBand?: boolean` prop on `Button`.

- [ ] **Step 1: Write the failing test**

In `app/test/tokens.test.ts`, replace the whole `describe('every text colour clears AA body contrast', …)` block and the `describe('the paused header band is a ground too', …)` block added earlier today with this single block:

```ts
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
```

Add `DARK_GROUNDS, BRIGHT_GROUNDS` to the existing import from `../lib/tokens.js`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm -F @leash/app test tokens`
Expected: FAIL — `DARK_GROUNDS` is not exported.

- [ ] **Step 3: Classify the grounds and add the token**

In `app/lib/tokens.ts`, add `lineControl` to `PALETTE` after `meterFill`:

```ts
  meterFill: '#5C6E88',
  /**
   * Control borders. --line is rgba(255,255,255,.10), which is 1.32:1 on
   * --panel: correct for a divider, and nothing at all for the border of a
   * button. Measured 2026-09-05: this clears 3:1 on all three dark grounds
   * (3.27 panel, 3.55 bg, 3.64 well) with a little headroom.
   */
  lineControl: '#626A73',
} as const
```

Then, after the `TokenName` type:

```ts
/**
 * A ground is a colour something is drawn *on*. The app has five, and until
 * 2026-09-05 only two were ever checked -- which is how a warning came to be
 * painted in the colour behind it. docs/design-system.md §4.
 *
 * The split is not stylistic. On the dark grounds every foreground except
 * --bg clears AA; on the bright ones only --bg does.
 */
export const DARK_GROUNDS = ['bg', 'panel', 'well'] as const satisfies readonly TokenName[]
export const BRIGHT_GROUNDS = ['bad', 'celo'] as const satisfies readonly TokenName[]
```

In `app/app/globals.css`, after `--line`:

```css
  /* Divider vs control border: --line is deliberately faint, and a button
     needs to be seen. Asserted in test/tokens.test.ts. */
  --line-control: #626A73;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @leash/app test tokens`
Expected: PASS.

- [ ] **Step 5: Teach Button about bright grounds**

In `app/components/ui/Button.tsx`, add the prop and switch the two variants that carry a border or a coloured label:

```tsx
/**
 * `onDangerBand` says this button sits on the paused header, whose ground is
 * --bad. The ghost and stop variants are drawn in --text and --bad, which are
 * 3.16 and 1.00 against that ground -- the second being invisible. --bg is
 * 5.10 there, the same dark-on-bright treatment `primary` already uses on
 * Celo yellow. docs/design-system.md §4.
 */
const tone: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--celo)' },
  ghost: onDangerBand
    ? { border: '1px solid var(--bg)', color: 'var(--bg)', outlineColor: 'var(--bg)' }
    : { border: '1px solid var(--line-control)', color: 'var(--text)', outlineColor: 'var(--text)' },
  stop: onDangerBand
    ? { border: '1px solid var(--bg)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--bg)' }
    : { border: '1px solid var(--bad)', color: 'var(--bad)', fontWeight: 700, outlineColor: 'var(--bad)' },
}
```

Add `onDangerBand = false` to the destructured props and `onDangerBand?: boolean` to the prop type. Remove the `letterSpacing: '0.1em'` from `stop` — design-system §2 allows two letter-spacing values and this is the third.

- [ ] **Step 6: Apply the rule to the paused band**

`NetworkBadge` already takes `onDangerBand`; delete its local `...(onDangerBand ? {…} : {})` style override now that `Button` owns the treatment, and pass the prop straight through to `Button`.

In `app/components/StopButton.tsx`, the Resume button at line 83 gains `onDangerBand={paused}` — it only renders when paused, so this is always `true`, but passing the real value keeps the reason readable.

In `app/app/a/[address]/page.tsx`, the header band currently mixes `--text` (3.16, UI only) with `--bg` (5.10). Make it consistent — replace every `state.paused ? 'var(--text)'` in the header with `state.paused ? 'var(--bg)'`, at the wordmark, the `CopyAddress` style, and the `↗` label. Add above the header:

```tsx
      {/* Everything on this band obeys the bright-ground rule: --bg only.
          Mixing --text at 3.16 with --bg at 5.10 was the state this was left
          in when the invisible-badge bug was fixed in a hurry. */}
```

- [ ] **Step 7: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 8: See it**

With the dev server running, open a paused account's dashboard. Every element on the red band should be dark and legible, and the ghost Resume button should have a visible border. If no account is paused, temporarily pass `paused` as `true` in the header's style expression to look, then revert.

- [ ] **Step 9: Commit**

```bash
git add app/lib/tokens.ts app/app/globals.css app/test/tokens.test.ts \
        app/components/ui/Button.tsx app/components/StopButton.tsx \
        app/components/NetworkBadge.tsx "app/app/a/[address]/page.tsx"
git commit -m "fix(app): the paused header was a ground nobody had named

The contrast test walked two grounds. The app has five, and the two it missed
are the bright ones -- which is how the wrong-network warning came to be drawn
in the colour behind it. The test now asserts the rule, both halves of it, so
a sixth ground is caught here rather than by a person squinting.

The band itself was left mixing --text at 3.16 with --bg at 5.10 when that bug
was fixed in a hurry; it is now --bg throughout. --line-control gives control
borders 3:1 on every dark ground, because Resume and Disconnect are ghost
buttons whose old border drew 1.32:1 and may not be ambiguous."
```

---

## Task 3: The landing gets its hierarchy back

**Files:**
- Modify: `app/components/ui/Section.tsx`
- Modify: `app/components/ui/Label.tsx`
- Modify: `app/components/landing/Hero.tsx`
- Modify: `app/components/ui/Stat.tsx`
- Modify: `app/components/landing/LiveProof.tsx:20-35`

**Interfaces:**
- Consumes: the CSS properties from Task 1.
- Produces: `Section` renders its title at `--t-heading`; `Stat` gains `size?: 'data' | 'display'` defaulting to `'data'`.

This is the single largest visible change in the plan, and it is four small edits.

- [ ] **Step 1: Give Section a real heading**

`app/components/ui/Section.tsx`, replacing the title line:

```tsx
      {title && (
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-heading)',
            lineHeight: 'var(--t-heading-line)',
            fontWeight: 500,
            color: 'var(--text)',
          }}
        >
          {title}
        </h2>
      )}
```

Drop the now-unused `import Label from './Label'`. Note this also fixes a document-outline bug: the landing's section titles were `<span>`s, so the page had one heading.

- [ ] **Step 2: Pin Label to its token**

In `app/components/ui/Label.tsx`, change `LABEL_STYLE`'s `fontSize` from the literal `'0.6875rem'` to `'var(--t-label)'` and add `lineHeight: 'var(--t-label-line)'` and `fontFamily: 'var(--mono)'`. The comment above it stays.

- [ ] **Step 3: Put the hero on the scale**

In `app/components/landing/Hero.tsx`, replace the `<h1>`'s `className="mt-6 text-3xl sm:text-4xl font-semibold leading-tight"` with `className="mt-6"` and a style of:

```tsx
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--t-title)',
          lineHeight: 'var(--t-title-line)',
          fontWeight: 600,
          color: 'var(--text)',
        }}
```

The `<p>` beneath it drops `text-base sm:text-lg` and takes `fontFamily: 'var(--sans)', fontSize: 'var(--t-body)', lineHeight: 'var(--t-body-line)'` — this is the prose exception from design-system §1. Also add `maxWidth: '68ch'` to it, which is the measure rule from §2.

- [ ] **Step 4: Let Stat carry a display figure**

`app/components/ui/Stat.tsx` in full:

```tsx
import Label from './Label'

/**
 * A label and its value. `.num` stays a global class and is never wrapped
 * away: money must be mono and tabular so digits do not reflow as values
 * update live (CLAUDE.md).
 *
 * This component existed with zero imports while Meter and LiveProof each
 * built the same pair by hand, so the two drifted. `size` is why it was
 * skipped -- the dashboard needs one figure at display size and the rest at
 * data size. docs/design-system.md §6.
 */
export default function Stat({
  label, value, tone = 'normal', size = 'data',
}: {
  label: string
  value: string
  tone?: 'normal' | 'bad'
  /** 'display' is the one figure a screen is about. At most one per screen. */
  size?: 'data' | 'display'
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <span
        className="num"
        style={{
          fontSize: size === 'display' ? 'var(--t-display)' : 'var(--t-data)',
          lineHeight: size === 'display' ? 'var(--t-display-line)' : 'var(--t-data-line)',
          fontWeight: size === 'display' ? 600 : 400,
          color: tone === 'bad' ? 'var(--bad)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Use it in LiveProof**

In `app/components/landing/LiveProof.tsx`, replace the two hand-built label/value pairs ("Remaining today", "Account holds") with `<Stat label="Remaining today" value={…} />` and `<Stat label="Account holds" value={…} />`, keeping the existing values and the `—` placeholders exactly as they are. Import `Stat from '../ui/Stat'`.

- [ ] **Step 6: Put the landing's remaining prose on the body step**

The measure rule in design-system §2 applies wherever prose appears, not only
in the hero. Three blocks still carry `text-sm` and no measure:

- `app/components/landing/Contrast.tsx` — the two lists' items
- `app/components/landing/HowItWorks.tsx` — the three step descriptions
- `app/components/landing/AgentTools.tsx:32` — the "That is the whole surface"
  paragraph, and the three tool descriptions

Each takes `fontFamily: 'var(--sans)', fontSize: 'var(--t-body)',
lineHeight: 'var(--t-body-line)'` and, where it is a paragraph rather than a
list item, `maxWidth: '68ch'`. The tool *names* (`leash_status`, `leash_pay`,
`leash_fetch`) stay mono at `--t-data`: they are identifiers, not prose.

- [ ] **Step 7: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 8: Look at the landing page**

Open `http://localhost:3000`. The four section titles should now read as headings rather than as field labels, and the page should have visible rank: headline, headings, prose, data, labels.

- [ ] **Step 9: Commit**

```bash
git add app/components/ui/Section.tsx app/components/ui/Label.tsx \
        app/components/ui/Stat.tsx app/components/landing/Hero.tsx \
        app/components/landing/LiveProof.tsx app/components/landing/Contrast.tsx \
        app/components/landing/HowItWorks.tsx app/components/landing/AgentTools.tsx
git commit -m "feat(app): the landing's section titles were field labels

Section rendered every heading through Label, so 'The difference', 'How it
works', 'What your agent gets' and 'Proven on Celo mainnet' were 11px dim
uppercase -- the same treatment as the label on a text input, and rendered as
spans, so the page had exactly one heading in its outline.

They are h2 at --t-heading now, which is most of the fix for a page whose
content was already strong and whose parts were all set at one size.

Stat had zero imports while LiveProof built the same label-and-value pair by
hand. It gains a display size for the dashboard and starts being used."
```

---

## Task 4: The dashboard says what the agent can spend

**Files:**
- Modify: `app/lib/meter.ts:65-84`
- Modify: `app/test/meter.test.ts`
- Modify: `app/components/Meter.tsx`

**Interfaces:**
- Consumes: `Stat` with `size="display"` from Task 3; `refusalThreshold(remaining, perTx)` from `app/lib/policy.ts`.
- Produces: `SpendBand`'s `ceiling` variant gains `limitedBy: 'daily allowance' | 'per-transaction cap' | 'balance'`.

`spendBand` already computes the number the design system wants — the minimum of the daily remainder, the per-transaction cap and the balance. What it does not say is which of the three is biting, and that sentence is what makes a 44px figure legible rather than mysterious.

- [ ] **Step 1: Write the failing test**

Append to `app/test/meter.test.ts`, inside the existing `describe('spendBand', …)` if there is one, otherwise as a new describe:

```ts
/**
 * A 44px figure with no explanation is a mystery. Naming the binding
 * constraint is what turns it into a sentence -- and it is the difference
 * between "your policy allows this" and "your account is empty", which is the
 * distinction 50778cd was opened for.
 */
describe('spendBand names the constraint that is biting', () => {
  const base = { paused: false, loading: false }

  it('says balance when the account holds less than the policy allows', () => {
    const band = spendBand({ ...base, remaining: 1_000_000n, perTx: 500_000n, balance: 40_000n })
    expect(band).toEqual({ kind: 'ceiling', amount: 40_000n, limitedBy: 'balance' })
  })

  it('says per-transaction cap when that is the tightest', () => {
    const band = spendBand({ ...base, remaining: 1_000_000n, perTx: 500_000n, balance: 2_000_000n })
    expect(band).toEqual({ kind: 'ceiling', amount: 500_000n, limitedBy: 'per-transaction cap' })
  })

  it('says daily allowance when the day is nearly spent', () => {
    const band = spendBand({ ...base, remaining: 90_000n, perTx: 500_000n, balance: 2_000_000n })
    expect(band).toEqual({ kind: 'ceiling', amount: 90_000n, limitedBy: 'daily allowance' })
  })

  // Ties have to resolve the same way every time or the sentence flickers.
  it('resolves a tie toward the per-transaction cap', () => {
    const band = spendBand({ ...base, remaining: 500_000n, perTx: 500_000n, balance: 2_000_000n })
    expect(band).toEqual({ kind: 'ceiling', amount: 500_000n, limitedBy: 'per-transaction cap' })
  })

  // The earlier states still outrank it, in the order they already had.
  it('still reports an empty account as unfunded, not as a zero ceiling', () => {
    expect(spendBand({ ...base, remaining: 1_000_000n, perTx: 500_000n, balance: 0n }))
      .toEqual({ kind: 'unfunded' })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm -F @leash/app test meter`
Expected: FAIL — the returned object has no `limitedBy`.

- [ ] **Step 3: Add the field**

In `app/lib/meter.ts`, change the `ceiling` variant of `SpendBand`:

```ts
  | {
      kind: 'ceiling'
      amount: bigint
      /**
       * Which of the three bounds produced `amount`. The figure alone does
       * not tell an owner whether to raise a cap or send more money, and
       * those are opposite actions.
       */
      limitedBy: 'daily allowance' | 'per-transaction cap' | 'balance'
    }
```

and the tail of `spendBand`:

```ts
  const cap = refusalThreshold(remaining, perTx)
  if (cap === 0n) return { kind: 'exhausted' }

  if (balance < cap) return { kind: 'ceiling', amount: balance, limitedBy: 'balance' }
  // A tie between the two policy bounds resolves toward the per-transaction
  // cap, deterministically, so the sentence under the figure does not flicker
  // between renders.
  return {
    kind: 'ceiling',
    amount: cap,
    limitedBy: remaining < perTx ? 'daily allowance' : 'per-transaction cap',
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F @leash/app test meter`
Expected: PASS.

- [ ] **Step 5: Promote the figure in the Meter**

In `app/components/Meter.tsx`, restructure the block so the ceiling is the display figure and the three supporting numbers sit below it at data size. Above the new block:

```tsx
      {/* One --t-display per screen, and on the dashboard this is it.
          The allowance alone says what is permitted and the balance alone
          says what is there; 50778cd was opened because the meter showed the
          first and an empty account read as a full allowance. The ceiling is
          the only figure that is always true, because it is the minimum of
          all three. docs/design-system.md §7. */}
```

Render, for `band.kind === 'ceiling'`:

```tsx
        <Stat
          label="Agent can spend up to"
          value={`${formatAmount(band.amount, decimals)} ${symbol}`}
          size="display"
        />
        <p
          className="mt-2"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'var(--t-body)',
            lineHeight: 'var(--t-body-line)',
            color: 'var(--dim)',
          }}
        >
          limited by the {band.limitedBy}
        </p>
```

Keep every other `band.kind` branch exactly as it reads today — those sentences are the state vocabulary from design-system §5 and must not be reworded. Below the meter track, render the three supporting figures with `<Stat>` at the default `size="data"`: remaining today, account holds, per-transaction cap.

- [ ] **Step 6: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 7: Look at a real account**

Open `http://localhost:3000/a/0xA73DB76f20c5ede3ABE883565D22905760F83982`. That account holds less than its caps allow, so the figure should be the balance and the sentence should read "limited by the balance". Compare against the chain:

```bash
set -a; source .env; set +a
cast call 0xA73DB76f20c5ede3ABE883565D22905760F83982 "remainingToday(address)(uint256)" "$SPEND_TOKEN" --rpc-url "$CELO_RPC_URL"
cast call "$SPEND_TOKEN" "balanceOf(address)(uint256)" 0xA73DB76f20c5ede3ABE883565D22905760F83982 --rpc-url "$CELO_RPC_URL"
```

The displayed figure must equal the smaller of those two, capped at 0.50.

- [ ] **Step 8: Commit**

```bash
git add app/lib/meter.ts app/test/meter.test.ts app/components/Meter.tsx
git commit -m "feat(app): the dashboard's biggest number is now the one that decides

Every figure on the meter was 14px and the one that answers the actual
question -- how much can the agent spend right now -- was 11px, wrapped in a
Label. It is the display figure now.

spendBand already computed it: the minimum of the daily remainder, the
per-transaction cap and the balance. What it could not say was which of the
three was biting, and raising a cap and sending more money are opposite
actions. limitedBy says which, with ties resolved deterministically so the
sentence does not flicker."
```

---

## Task 5: One address component

**Files:**
- Create: `app/components/ui/Address.tsx`
- Delete: `app/components/ui/AddressChip.tsx`, `app/components/CopyAddress.tsx`
- Modify: `app/app/a/[address]/page.tsx:160-175`, `app/app/setup/page.tsx:285,344`, `app/components/landing/LiveProof.tsx:29`

**Interfaces:**
- Consumes: `truncateAddress` from `app/lib/address.js`, `LABEL_STYLE` from `app/components/ui/Label.js`.
- Produces: `Address`, taking `{ address: string; copy?: boolean; explorer?: boolean; full?: boolean; className?: string; style?: React.CSSProperties }`.

The two components were not duplicates — one was read-only text with a link, the other a button owning the clipboard. But the dashboard composed the second with a hand-written `↗` anchor, which is a third shape neither owned.

- [ ] **Step 1: Write the component**

Create `app/components/ui/Address.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { truncateAddress } from '../../lib/address.js'

/**
 * An address, in the three shapes this app needs: read-only with an explorer
 * link, copyable, or both.
 *
 * Replaces AddressChip and CopyAddress. They were not duplicates -- one was
 * text and a link, the other a button owning the clipboard and its failure
 * state -- but the dashboard composed the second with a hand-written anchor,
 * so a third shape existed that neither owned. docs/design-system.md §6.
 *
 * The clipboard write is awaited and its failure surfaced. A denied
 * permission, an insecure context and an unfocused document all reject
 * silently, and "Copied" would then be a claim about something that did not
 * happen.
 */
export default function Address({
  address, copy = false, explorer = false, full = false, className = '', style,
}: {
  address: string
  copy?: boolean
  explorer?: boolean
  /** Show all 42 characters rather than the truncated form. */
  full?: boolean
  className?: string
  /** No default tone: the dashboard wears LABEL_STYLE, the wizard wears `.num`. */
  style?: React.CSSProperties
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const shown = full ? address : truncateAddress(address)

  const text = copy
    ? (
        <button
          className={className}
          style={{ ...style, cursor: 'pointer' }}
          title={`Copy ${address}`}
          aria-label={`Copy address ${address}`}
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(address)
                setState('copied')
                setTimeout(() => setState('idle'), 1500)
              } catch {
                setState('failed')
              }
            })()
          }}
        >
          {state === 'copied'
            ? 'Copied'
            : state === 'failed'
              ? 'Copy failed — select it manually'
              : shown}
        </button>
      )
    : <span className={className} style={style}>{shown}</span>

  if (!explorer) return text

  return (
    <span className="inline-flex items-center gap-2">
      {text}
      <a
        href={`https://celoscan.io/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title="Open on Celoscan"
        style={style}
      >
        ↗
      </a>
    </span>
  )
}
```

- [ ] **Step 2: Move the three call sites**

- `app/components/landing/LiveProof.tsx:29` — `<AddressChip address={ACCOUNT} href={…} />` becomes `<Address address={ACCOUNT} explorer className="num" style={{ color: 'var(--dim)', fontSize: 'var(--t-data)' }} />`.
- `app/app/setup/page.tsx:285` and `:344` — `<CopyAddress address={account} full className="num" />` becomes `<Address address={account} copy full className="num" />`.
- `app/app/a/[address]/page.tsx` — the `<CopyAddress …/>` and the separate `<a …>↗</a>` collapse into one `<Address address={address} copy explorer style={{ ...LABEL_STYLE, color: state.paused ? 'var(--bg)' : undefined }} />`. Delete the now-orphaned anchor.

- [ ] **Step 3: Delete the old components**

```bash
git rm app/components/ui/AddressChip.tsx app/components/CopyAddress.tsx
```

- [ ] **Step 4: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0. A missed import shows up here.
Run: `grep -rn "AddressChip\|CopyAddress" app --include='*.tsx'` — expect no matches outside comments.

- [ ] **Step 5: Click it**

On the dashboard, click the address: it should read "Copied" for about a second and the `↗` beside it should still open Celoscan. On `/setup`, the full address should copy.

- [ ] **Step 6: Commit**

```bash
git add -A app/components app/app
git commit -m "refactor(app): three shapes of address, owned by one component

AddressChip was read-only text with a link and CopyAddress was a button
owning the clipboard, so neither owned the shape the dashboard actually
used -- a CopyAddress with a hand-written anchor beside it. Address takes all
three through copy and explorer flags.

The clipboard failure state moves across unchanged: a denied permission, an
insecure context and an unfocused document all reject silently, and 'Copied'
would be a claim about something that did not happen."
```

---

## Task 6: The wizard says where you are

**Files:**
- Modify: `app/app/setup/page.tsx:260,270,278,299,322,342,357`

**Interfaces:**
- Consumes: the CSS properties from Task 1.
- Produces: nothing other tasks depend on.

Six steps reveal progressively and completed ones stay on screen, all set in the same 11px label. Nothing says "you are here".

- [ ] **Step 1: Add a step heading treatment**

Near the top of `app/app/setup/page.tsx`, after the imports:

```tsx
/**
 * A wizard's job is to say where you are. Every step was a Label -- the same
 * 11px treatment as the field labels inside it -- and completed steps stay on
 * screen, so six identical headings competed for attention.
 * docs/design-system.md §7.
 */
const STEP_HEADING: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-heading)',
  lineHeight: 'var(--t-heading-line)',
  fontWeight: 500,
  color: 'var(--text)',
  display: 'block',
}

/** A finished step recedes: it is context now, not the thing to do. */
const STEP_HEADING_DONE: React.CSSProperties = {
  ...STEP_HEADING,
  fontSize: 'var(--t-data)',
  color: 'var(--dim)',
}
```

- [ ] **Step 2: Apply it to all six steps**

Replace each `<Label className="block">Step N — …</Label>` with:

```tsx
<h2 style={done ? STEP_HEADING_DONE : STEP_HEADING}>
  {done ? '✓ ' : ''}Step N — …
</h2>
```

where `done` is the condition that already gates the *next* step's disclosure:

| Step | `done` is |
|---|---|
| 1 — Connect | `isConnected` |
| 2 — Deploy your account | `Boolean(account)` |
| 3 — Add your agent | `agentNote === 'Agent added.'` |
| 4 — Set limits | `limitsNote === 'Limits saved.'` |
| 5 — Fund it | `Boolean(feeAdapter)` |
| 6 — Connect your agent | `false` — the last step is never "done" |

- [ ] **Step 3: Put the page title on the scale**

The `<h1>LEASH</h1>` at line 260 keeps its `--celo` colour and `.26em` tracking and takes `fontSize: 'var(--t-title)', lineHeight: 'var(--t-title-line)', fontFamily: 'var(--mono)'`.

- [ ] **Step 4: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 5: Walk the wizard**

Open `http://localhost:3000/setup` and connect a wallet. Step 1 should collapse to a dim ticked line while step 2 becomes the prominent one. Do not deploy — connecting is enough to see the transition, and deploying costs money.

- [ ] **Step 6: Commit**

```bash
git add app/app/setup/page.tsx
git commit -m "feat(app): the wizard's six steps all looked like field labels

Steps reveal progressively and finished ones stay on screen, so six headings
in the same 11px label competed with the fields inside them and nothing said
'you are here'. The current step is a heading; finished ones recede to a dim
ticked line."
```

---

## Task 7: The three screens the app does not have

**Files:**
- Create: `app/components/ui/Shell.tsx`
- Create: `app/app/not-found.tsx`
- Create: `app/app/error.tsx`
- Modify: `app/app/a/[address]/page.tsx:25-32`

**Interfaces:**
- Consumes: the CSS properties from Task 1.
- Produces: `Shell`, taking `{ title: string; children: React.ReactNode }`.

Today a bad path gets Next's default 404, a render error gets Next's default error page, and an invalid address returns **HTTP 200** with a single unstyled sentence — no header, no branding, no way back.

- [ ] **Step 1: Write the shared shell**

Create `app/components/ui/Shell.tsx`:

```tsx
import Link from 'next/link'
import Button from './Button'

/**
 * The frame the app's message screens share: not found, a render error, and
 * an address that is not an address.
 *
 * Before this, all three fell through to something that did not look like
 * this product -- and the invalid-address case answered HTTP 200 with a bare
 * sentence and no way back.
 */
export default function Shell({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-12">
      <p style={{
        fontFamily: 'var(--mono)', color: 'var(--celo)',
        letterSpacing: '.26em', fontWeight: 700, fontSize: 'var(--t-label)',
      }}>
        LEASH
      </p>
      <h1 className="mt-6" style={{
        fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)',
        lineHeight: 'var(--t-heading-line)', fontWeight: 500, color: 'var(--text)',
      }}>
        {title}
      </h1>
      <div className="mt-3" style={{
        fontFamily: 'var(--sans)', fontSize: 'var(--t-body)',
        lineHeight: 'var(--t-body-line)', color: 'var(--dim)', maxWidth: '68ch',
      }}>
        {children}
      </div>
      <div className="mt-6">
        <Link href="/"><Button variant="ghost">Back to the start</Button></Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Write not-found**

Create `app/app/not-found.tsx`:

```tsx
import Shell from '../components/ui/Shell'

export default function NotFound() {
  return (
    <Shell title="That page does not exist.">
      <p>
        An account dashboard lives at <code>/a/</code> followed by its address.
      </p>
    </Shell>
  )
}
```

- [ ] **Step 3: Write the error boundary**

Create `app/app/error.tsx`:

```tsx
'use client'

import Shell from '../components/ui/Shell'
import Button from '../components/ui/Button'

/**
 * A render error in the browser knows NOTHING about the chain.
 *
 * So this says a page failed and offers a reload. It must never say a
 * transaction failed, or that money did or did not move: this project's rule
 * is that nothing is reported which was not observed, and from here nothing
 * has been.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Shell title="Something failed while drawing this page.">
      <p>
        This is a fault in the page, not on the chain. Nothing here tells you
        whether a transaction went through — check the account on Celoscan if
        one was in flight.
      </p>
      <div className="mt-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
      </div>
    </Shell>
  )
}
```

- [ ] **Step 4: Give the invalid address a screen**

In `app/app/a/[address]/page.tsx`, replace the bare early return:

```tsx
  if (!isValidAddress(address)) {
    return (
      <Shell title="That is not a Celo address.">
        <p>
          An address is <code>0x</code> followed by 40 hexadecimal characters.
          Check the link you followed, or start from the top.
        </p>
      </Shell>
    )
  }
```

Import `Shell from '../../../components/ui/Shell'`.

- [ ] **Step 5: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 6: Visit all three**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/does-not-exist
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/a/0xdeadbeef
```

The first must be 404. Open both in a browser: each should wear the header, one heading, one explanation and one way back. The error boundary is best seen by temporarily throwing inside a page component — do that, look, and revert.

- [ ] **Step 7: Commit**

```bash
git add app/components/ui/Shell.tsx app/app/not-found.tsx app/app/error.tsx \
        "app/app/a/[address]/page.tsx"
git commit -m "feat(app): a mistyped URL left the product entirely

A bad path got Next's default 404, a render error got Next's default error
page, and an invalid address answered HTTP 200 with one unstyled sentence and
no way back. All three now wear the same shell.

The error boundary deliberately says nothing about the chain. A render fault
in the browser has observed nothing about whether a transaction landed, and
this project does not report what it did not observe."
```

---

## Task 8: Four spacing steps

**Files:**
- Modify: every `.tsx` under `app/` that uses a spacing class outside `{2, 3, 6, 12}`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Nine steps are in use, weighted toward the tightest — `mt-2` 26 times and `mt-1` 12 times. With 14px text at 4–8px intervals the page reads cramped, and the large steps appear only in the hero, so there is no rhythm. Do this last: it touches many files shallowly and is the easiest task to abandon if time runs out.

- [ ] **Step 1: Find every offender**

```bash
cd app && grep -rn "\b\(mt\|mb\|p\|px\|py\|pt\|pb\|gap\|space-y\)-\(1\|4\|8\|10\|14\|16\)\b" \
  --include='*.tsx' . | grep -v node_modules
```

- [ ] **Step 2: Map each to the nearest legal step**

| Found | Becomes | Because |
|---|---|---|
| `-1` (4px) | `-2` | nothing in this app is tighter than "inside a control" |
| `-4` (16px) | `-3` or `-6` | `-3` between related items; `-6` between blocks in a panel |
| `-8` (32px) | `-6` | |
| `-10`, `-14`, `-16` | `-12` | section rhythm |

`p-4` on `Panel` and on the 21 places that mirror it becomes `p-6`: panel padding is "between blocks", and 16px against 14px text is the main source of the cramped feel.

Judgement call, stated so it is not re-litigated: keep `px-4` for the page gutter. It is the horizontal edge of the viewport, not a relationship between two elements, and 24px gutters on a phone waste width that MiniPay does not have (spec §2.1).

- [ ] **Step 3: Run everything**

Run: `pnpm -F @leash/app test` — all green.
Run: `(cd app && npx tsc --noEmit)` — exit 0.

- [ ] **Step 4: Verify no offenders remain**

```bash
cd app && grep -rn "\b\(mt\|mb\|p\|py\|pt\|pb\|gap\|space-y\)-\(1\|4\|8\|10\|14\|16\)\b" \
  --include='*.tsx' . | grep -v node_modules
```

Expected: no output. (`px-4` is excluded from this grep on purpose — see Step 2.)

- [ ] **Step 5: Look at all three screens**

Landing, `/setup`, and a dashboard. Nothing should be misaligned; the pages should simply breathe.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "style(app): nine spacing steps become four

mt-2 appeared 26 times and mt-1 twelve, so 14px text sat at 4-8px intervals
while the large steps appeared only in the hero -- cramped, and without
rhythm. Four steps with fixed meanings replace them: 8 inside a control, 12
between related items, 24 between blocks, 48 between sections.

px-4 stays as the page gutter. That is the edge of the viewport rather than a
relationship between two elements, and 24px gutters waste width on the phone
MiniPay runs on."
```

---

## Task 9: Point the documentation at what shipped

**Files:**
- Modify: `docs/RESUME.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the test counts**

`pnpm -F @leash/app test` will report a new total. Put that number in `CLAUDE.md`'s command list and in `docs/RESUME.md`'s suite table. Do not guess it — read it from the run.

- [ ] **Step 2: Record what changed and what did not**

Add to `docs/RESUME.md`, under the 2026-09-05 entries, a short paragraph naming which tasks of this plan were completed and which were not, so a session that stops midway hands over an honest boundary rather than an implied one.

- [ ] **Step 3: Add the conventions that now have teeth**

In `CLAUDE.md`'s Conventions section, after the `.num` line:

```markdown
- The interface follows `docs/design-system.md`. Six type steps, four spacing
  steps, and five named grounds — dark grounds take any foreground but `--bg`,
  bright grounds take only `--bg`. Both scales are asserted against
  `globals.css` by tests that fail on drift.
```

- [ ] **Step 4: Commit**

```bash
git add docs/RESUME.md CLAUDE.md
git commit -m "docs: record which of the design system actually landed"
```

---

## What this plan does not enforce with a test

**The state vocabulary (design-system §5) is enforced by review, not by the
suite.** Those five sentences live in component JSX, and spec §2.2 forbids
adding a component-testing dependency, so nothing mechanical stops a new
screen from writing "failed" where it means "not observed". Two mitigations,
both already in this plan: Task 4 says in as many words that the existing
`band.kind` branches must not be reworded, and Task 7's `error.tsx` carries a
comment explaining why it may not mention the chain.

If this becomes a recurring loss, the fix is to move the sentences into
`app/lib/` as data the way `spendBand` already returns `kind` — not to relax
§2.2. That is a change worth its own spec, and it is out of scope here.

---

## Order and stopping

Tasks 1 and 2 are foundation and change almost nothing visible. Task 3 is the largest visible improvement for the least code. Task 4 is the one a demo is filmed on.

If time runs short, **1 → 2 → 3 → 4 is a complete, coherent result** and answers all three of the original complaints. Tasks 5–8 are refinements, and stopping after any completed task leaves an app that is internally consistent rather than half-migrated. Task 9 runs whenever you stop.
