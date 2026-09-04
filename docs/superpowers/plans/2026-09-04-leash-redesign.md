# Leash Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a front door — a landing page at `/` that explains Leash and proves it works — and replace the Café Terrace visual direction with a hand-written design system, without changing what any screen can do.

**Architecture:** Three routes instead of two. `/` becomes a public landing page that reads the live mainnet account; the six-step wizard moves to `/setup` unchanged in behaviour; `/a/<address>` keeps its route and gains a restyle. A token file drives colour, a small `components/ui/` set replaces ad-hoc CSS classes, and the meter is redrawn as a bar with a hard cap line.

**Tech Stack:** Next.js App Router, React, wagmi/viem, Tailwind 3, vitest (node environment, pure logic only), Playwright. **No new dependency, runtime or dev.**

**Spec:** `docs/superpowers/specs/2026-09-04-leash-redesign-design.md`

## Global Constraints

- **No new dependency of any kind.** shadcn/ui was offered and declined (spec §2.2). Accessibility a library would have supplied is this project's own work.
- **Money always carries the global `.num` class** — mono, `tabular-nums`. It is a `CLAUDE.md` convention, not a style choice, and is never wrapped in a component (spec §3.2, §6).
- **`--celo: #FCFF52` appears in exactly two roles:** the primary action and the cap line. A third use dilutes both (spec §2.5). Do not re-derive the hex; it was verified against celo.org/brand-kit on 2026-09-03.
- **Exactly one animation exists in the app,** in the meter. Data updates snap (spec §3.2).
- **Reduced motion is honoured by not mounting the animation,** never by hiding it in CSS. `display: none` on an `<animate>` element applies and achieves nothing (spec §7).
- **The comments in `app/app/globals.css` explaining paid-for hazards move to the new file intact** — Tailwind's preflight cursor reset, the disabled-button ambiguity, and the SMIL note. `CLAUDE.md` forbids stripping them (spec §3.3).
- **Mobile-first.** `2026-09-01-leash-design.md` §4 requires it for the MiniPay in-app browser.
- **Out of scope, do not touch:** `contracts/`, `sdk/`, `mcp/`, and every chain-reading hook in `app/lib/`. No screen gains or loses an ability (spec §9).
- **App copy is English** (`2026-09-03-leash-frontend-design.md` §1.6).
- **Commit after every task.** The pre-commit secret guard requires `git config core.hooksPath .githooks`; it is already set in this clone.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `app/lib/tokens.ts` | The palette as data, plus `relativeLuminance` and `contrastRatio`. Single source for colour. |
| `app/lib/meter.ts` | `meterState()` — the meter's fill percent, lock and animation decisions as pure logic. |
| `app/lib/proofs.ts` | The five mainnet proof rows as data. |
| `app/components/ui/Button.tsx` | `primary` / `ghost` / `stop` variants; replaces `.btn-*`. |
| `app/components/ui/Panel.tsx` | Surface with hairline border; replaces `.panel`. |
| `app/components/ui/Label.tsx` | Uppercase tracked micro-label; replaces `.label`. |
| `app/components/ui/Stat.tsx` | A label above a `.num` figure. |
| `app/components/ui/Section.tsx` | Landing page section wrapper with consistent rhythm. |
| `app/components/landing/Hero.tsx` | Headline, subline, two actions. |
| `app/components/landing/LiveProof.tsx` | Live mainnet state: meter, caps, three feed rows. |
| `app/components/landing/Contrast.tsx` | Without Leash / With Leash, two columns. |
| `app/components/landing/HowItWorks.tsx` | Three steps. |
| `app/components/landing/AgentTools.tsx` | The three MCP tools, and the `.mcp.json` block via the existing `McpHandoff`. |
| `app/components/landing/ProofTable.tsx` | Renders `lib/proofs.ts`. |
| `app/app/setup/page.tsx` | The wizard, moved from `app/app/page.tsx`. |
| `app/test/tokens.test.ts` | Contrast assertions and a CSS/TS drift check. |
| `app/test/meter.test.ts` | `meterState()` behaviour. |
| `app/test/proofs.test.ts` | Proof row shape. |
| `app/e2e/landing.spec.ts` | Landing renders live numbers with no wallet; no horizontal scroll on mobile. |

**Modified**

| File | Change |
|---|---|
| `app/app/globals.css` | New `:root` tokens; hazard comments carried over. |
| `app/app/page.tsx` | Replaced with the landing page. |
| `app/app/a/[address]/page.tsx` | Restyled to primitives; logic untouched. |
| `app/app/layout.tsx` | Metadata for a page that is now a front door. |
| `app/components/Meter.tsx` | Redrawn per spec §2.4; consumes `lib/meter.ts`. |
| `app/components/{AgentPanel,ConnectButton,CopyAddress,Feed,LimitsDrawer,McpHandoff,NetworkBadge,StopButton}.tsx` | Render primitives instead of raw classes. Logic untouched. |
| `app/e2e/dashboard.spec.ts` | Two selectors change from `.meter-turbulence animate` to `.meter animate`. |
| `README.md` | Wizard path `/` → `/setup`. |
| `docs/mcp-setup.md` | Wizard path `/` → `/setup`. |

---

### Task 1: Design tokens, with contrast proved by test

The spec's palette was measured on 2026-09-04 and two colours changed as a result. This task makes that measurement permanent, so a future colour edit that breaks AA fails the suite instead of shipping.

**Files:**
- Create: `app/lib/tokens.ts`
- Create: `app/test/tokens.test.ts`
- Modify: `app/app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `PALETTE: Record<TokenName, string>` where `TokenName` is `'bg' | 'panel' | 'well' | 'text' | 'dim' | 'celo' | 'ok' | 'bad' | 'meterFill'`; `contrastRatio(a: string, b: string): number`; `relativeLuminance(hex: string): number`. Later tasks read colours as `var(--bg)` in CSS, not from this module — the module exists so the test can check the CSS.

- [ ] **Step 1: Write the failing test**

Create `app/test/tokens.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm -F @leash/app test -- tokens`
Expected: FAIL — `Cannot find module '../lib/tokens.js'`.

- [ ] **Step 3: Write `app/lib/tokens.ts`**

```ts
/**
 * The palette as data so the contrast test can check it. Components read
 * `var(--bg)` from globals.css, never this module -- the CSS is the runtime
 * source and this is the assertion, and test/tokens.test.ts fails if the two
 * ever disagree.
 *
 * Ratios were measured on 2026-09-04. Two colours in the first draft failed
 * and changed: --bad from #C4544F (4.38 on the ground, and it carries body
 * text) and --meter-fill from #2C3540 (1.61 against its own track, which is
 * the whole information content of the meter). Spec §3.1.
 */
export const PALETTE = {
  bg: '#0B0D10',
  panel: '#14171C',
  well: '#07090B',
  text: '#E8EAED',
  dim: '#8A9199',
  celo: '#FCFF52',
  ok: '#4E9E7E',
  bad: '#D0605B',
  meterFill: '#5C6E88',
} as const

export type TokenName = keyof typeof PALETTE

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
```

- [ ] **Step 4: Rewrite the `:root` block in `app/app/globals.css`**

Replace the existing `:root { … }` with the block below. Leave `@tailwind` lines, `body`, `.num`, `.label`, `.panel`, `.btn-*` and every existing comment below `:root` untouched for now — Task 2 handles those.

```css
/*
 * The limit is the design: every screen makes visible the line the money does
 * not cross. Replaces the Café Terrace palette, which the owner dropped on
 * 2026-09-04 against this spec's own competitive argument. Spec §2.1, §2.3.
 *
 * Ratios are asserted in test/tokens.test.ts, not trusted. Any edit here that
 * breaks WCAG AA fails the suite.
 */
:root {
  --bg: #0B0D10;
  --panel: #14171C;
  --well: #07090B;
  --line: rgba(255, 255, 255, 0.10);
  --text: #E8EAED;
  --dim: #8A9199;
  /* Celo brand yellow, verified 2026-09-03 by fetching celo.org/brand-kit and
     inspecting that first-party page's own rendered CSS -- not from memory and
     not from an aggregator. Used in exactly two roles, the primary action and
     the cap line. A third use dilutes both. Spec §2.5. */
  --celo: #FCFF52;
  --ok: #4E9E7E;
  --bad: #D0605B;
  /* The fill never touches the cap line: a 2px --well gap keeps the line on the
     dark track, because --bad on this fill is 1.36:1 and the lock indicator
     would vanish exactly when it matters. Spec §3.1. */
  --meter-fill: #5C6E88;

  /* Superseded, and deliberately still here. Meter.tsx still paints its gradient
     from these two, and `stop-color` is not an inherited property: an undefined
     var() with no fallback makes it invalid at computed-value time and both stops
     fall back to black. Deleting them now would break the app's one signature
     component in every commit until Task 4 redraws it. Task 4 deletes them. */
  --meter-start: #1B4A63;
  --meter-mid: #3E86A0;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm -F @leash/app test -- tokens`
Expected: PASS, 25 tests.

- [ ] **Step 6: Run the whole app suite**

Run: `pnpm -F @leash/app test`
Expected: PASS. 67 pre-existing plus the new tokens specs.

- [ ] **Step 7: Commit**

```bash
git add app/lib/tokens.ts app/test/tokens.test.ts app/app/globals.css
git commit -m "feat(app): a palette whose contrast is asserted rather than asserted about"
```

---

### Task 2: UI primitives

`globals.css` currently holds `.panel` and three `.btn-*` classes that every component hand-assembles. This extracts them so the eight components in Task 8 have something to render, and so a disabled or focused state is defined once.

**Files:**
- Create: `app/components/ui/Button.tsx`, `Panel.tsx`, `Label.tsx`, `Stat.tsx`, `AddressChip.tsx`, `Section.tsx`
- Modify: `app/app/globals.css`

**Interfaces:**
- Consumes: the CSS variables from Task 1.
- Produces:
  - `Button({ variant?: 'primary' | 'ghost' | 'stop', ...React.ButtonHTMLAttributes<HTMLButtonElement> })`
  - `Panel({ className?: string, children: React.ReactNode })`
  - `Label({ className?: string, children: React.ReactNode })` — renders a `<span>`
  - `Stat({ label: string, value: string, tone?: 'normal' | 'bad' })` — value gets `.num`
  - `Section({ id?: string, title?: string, children: React.ReactNode })`
  - `AddressChip({ address: string, href?: string })` — read-only display. `CopyAddress.tsx` keeps the interactive case and is not replaced.

- [ ] **Step 1: Write `app/components/ui/Button.tsx`**

There is no DOM in the vitest environment (`environment: 'node'`) and no component-testing dependency may be added, so these primitives are covered by the Playwright specs in Tasks 3 and 9, following the existing pattern where every unit test in `app/test/` is pure logic.

```tsx
type Variant = 'primary' | 'ghost' | 'stop'

const BASE =
  'rounded cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 px-4 py-2'

/**
 * Tailwind 3's preflight resets button cursors to `auto`, so the pointer is
 * set here rather than inherited. And a disabled button used to render
 * identically to a live one -- only the label changed -- which on a control
 * that spends real money is the wrong thing to leave ambiguous.
 *
 * The focus ring is ours to build: no component library ships in this project
 * (spec §2.2), so nothing supplies it if this does not.
 */
export default function Button({
  variant = 'ghost', style, ...rest
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone: Record<Variant, React.CSSProperties> = {
    primary: { background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--celo)' },
    ghost: { border: '1px solid var(--line)', color: 'var(--text)', outlineColor: 'var(--text)' },
    stop: { border: '1px solid var(--bad)', color: 'var(--bad)', fontWeight: 700, letterSpacing: '0.1em', outlineColor: 'var(--bad)' },
  }
  return <button className={BASE} style={{ ...tone[variant], ...style }} {...rest} />
}
```

- [ ] **Step 2: Write the five remaining primitives**

`app/components/ui/Panel.tsx`:

```tsx
export default function Panel({
  className = '', children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}
    >
      {children}
    </div>
  )
}
```

`app/components/ui/Label.tsx`:

```tsx
export default function Label({
  className = '', children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={className}
      style={{
        fontSize: '0.6875rem', letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--dim)',
      }}
    >
      {children}
    </span>
  )
}
```

`app/components/ui/Stat.tsx`:

```tsx
import Label from './Label'

/** `.num` stays a global class and is never wrapped away: money must be mono
 *  and tabular so digits do not reflow as values update live (CLAUDE.md). */
export default function Stat({
  label, value, tone = 'normal',
}: { label: string; value: string; tone?: 'normal' | 'bad' }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <span className="num text-sm" style={{ color: tone === 'bad' ? 'var(--bad)' : 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}
```

`app/components/ui/AddressChip.tsx`:

```tsx
import { truncateAddress } from '../../lib/address.js'

/**
 * The read-only address display. `CopyAddress.tsx` stays the interactive one
 * and is not replaced by this: it owns the clipboard, its failure state, and
 * the "copied" confirmation. This is for the places that only show an address
 * and link it -- the landing page, and headers where nothing is copyable.
 */
export default function AddressChip({
  address, href,
}: { address: string; href?: string }) {
  const body = <span className="num text-xs">{truncateAddress(address)}</span>
  if (!href) return <span style={{ color: 'var(--dim)' }}>{body}</span>
  return (
    <a style={{ color: 'var(--dim)' }} href={href} target="_blank" rel="noreferrer">
      {body} ↗
    </a>
  )
}
```

`app/components/ui/Section.tsx`:

```tsx
import Label from './Label'

export default function Section({
  id, title, children,
}: { id?: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="w-full max-w-3xl mx-auto px-4 py-10 sm:py-14">
      {title && <div className="mb-4"><Label>{title}</Label></div>}
      {children}
    </section>
  )
}
```

- [ ] **Step 3: Delete nothing from `app/app/globals.css` in this task**

**Pre-flight ruling, 2026-09-04.** An earlier draft deleted `.panel` and the three `.btn-*` rules here. Seven files still use them — `app/app/page.tsx`, `AgentPanel`, `ConnectButton`, `Feed`, `LimitsDrawer`, `McpHandoff`, `StopButton` — and only Task 8 converts those. Deleting the rules now ships a dashboard with no panel backgrounds and unstyled buttons in every commit from here to Task 8, on a branch the owner may demo from.

This task only *adds*. All four rules are deleted in Task 8 Step 2, once the last consumer is gone.

The comments attached to those rules — Tailwind's preflight cursor reset, and a disabled button reading identically to a live one on a control that spends real money — are already carried in `Button.tsx`'s docstring from Step 1. Confirm that before Task 8 removes the originals.

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Run the app suite**

Run: `pnpm -F @leash/app test`
Expected: PASS. No unit test targets these files; this confirms nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui app/app/globals.css
git commit -m "feat(app): primitives, so a focus ring and a disabled state are defined once"
```

---

### Task 3: The wizard moves to /setup

Moving it first means Task 6 writes the landing page into an empty `/`, rather than deleting a working screen and rebuilding in the same commit.

**Files:**
- Create: `app/app/setup/page.tsx`
- Modify: `app/app/page.tsx`, `README.md:83`, `docs/mcp-setup.md:9`
- Test: `app/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the route `/setup`. Task 6 owns `/`.

- [ ] **Step 1: Write the failing test**

Create `app/e2e/landing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('the wizard answers at /setup', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByText('Step 1 — Connect')).toBeVisible()
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd app && pnpm run test:e2e -- landing`
Expected: FAIL — `/setup` 404s.

- [ ] **Step 3: Move the file**

```bash
cd /Users/vanhuy/Desktop/celo
mkdir -p app/app/setup
git mv app/app/page.tsx app/app/setup/page.tsx
```

The wizard's relative imports go up one more level. In `app/app/setup/page.tsx`, rewrite every `'../components/…'` to `'../../components/…'` and every `'../lib/…'` to `'../../lib/…'`. There are nine such imports — four components and five from `lib/`; `npx tsc --noEmit` in Step 5 names any that were missed.

- [ ] **Step 4: Put a placeholder at `/`**

Create `app/app/page.tsx`. Task 6 replaces this entirely; it exists so the route is not a 404 between commits.

```tsx
import Link from 'next/link'

export default function Landing() {
  return (
    <main className="p-8">
      <h1 style={{ color: 'var(--celo)', letterSpacing: '.26em' }}>LEASH</h1>
      <Link href="/setup">Build your own</Link>
    </main>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Update the two documents that name the old path**

In `README.md`, the line reading "Run the app and open `/`. The onboarding wizard" becomes "Run the app and open `/setup`. The onboarding wizard".

In `docs/mcp-setup.md`, the line reading "dev`) and open `/`, where a wizard does every step below and hands you the" becomes "dev`) and open `/setup`, where a wizard does every step below and hands you the".

- [ ] **Step 7: Run the e2e suite**

Run: `cd app && pnpm run test:e2e`
Expected: the new spec passes and all three dashboard specs still pass — `/a/<address>` did not move.

- [ ] **Step 8: Commit**

```bash
git add app/app README.md docs/mcp-setup.md app/e2e/landing.spec.ts
git commit -m "refactor(app): the front door was step 1 of a six-step setup"
```

---

### Task 4: Redraw the meter

Spec §2.4. The behaviour survives, the brushwork does not. Pulling the decisions into a pure function makes them testable in the node environment for the first time.

**Files:**
- Create: `app/lib/meter.ts`, `app/test/meter.test.ts`
- Modify: `app/components/Meter.tsx`, `app/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `percentUsed` and `refusalThreshold` from `app/lib/policy.js`.
- Produces: `meterState(input: MeterInput): MeterState` where

```ts
type MeterInput = {
  daily: bigint; remaining: bigint
  paused: boolean; loading: boolean; visible: boolean; reduced: boolean
}
type MeterState = { fillPercent: number; locked: boolean; animating: boolean }
```

- [ ] **Step 1: Write the failing test**

Create `app/test/meter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { meterState } from '../lib/meter.js'

const base = {
  daily: 1_000_000n, remaining: 1_000_000n,
  paused: false, loading: false, visible: true, reduced: false,
}

describe('fillPercent', () => {
  it('is zero when nothing has been spent', () => {
    expect(meterState(base).fillPercent).toBe(0)
  })

  it('tracks what has been spent', () => {
    expect(meterState({ ...base, remaining: 250_000n }).fillPercent).toBeCloseTo(75, 5)
  })

  it('is zero while loading, because zero spent is not an observation', () => {
    expect(meterState({ ...base, remaining: 250_000n, loading: true }).fillPercent).toBe(0)
  })
})

describe('locked', () => {
  it('is true when the allowance is exhausted', () => {
    expect(meterState({ ...base, remaining: 0n }).locked).toBe(true)
  })

  it('is false when a cap of zero means no policy rather than a spent one', () => {
    expect(meterState({ ...base, daily: 0n, remaining: 0n }).locked).toBe(false)
  })

  it('is never claimed before the first read returns', () => {
    expect(meterState({ ...base, remaining: 0n, loading: true }).locked).toBe(false)
  })
})

describe('animating', () => {
  it('runs when the agent still has room', () => {
    expect(meterState({ ...base, remaining: 500_000n }).animating).toBe(true)
  })

  // The guarantee this project paid to learn: suppressing an <animate> in CSS
  // matches, applies, and does nothing, because SMIL has no renderer to
  // suppress. Only not mounting it stops the cost.
  it('stops when the OS asked for reduced motion', () => {
    expect(meterState({ ...base, reduced: true }).animating).toBe(false)
  })

  it('stops in a hidden tab', () => {
    expect(meterState({ ...base, visible: false }).animating).toBe(false)
  })

  it('stops dead at the cap', () => {
    expect(meterState({ ...base, remaining: 0n }).animating).toBe(false)
  })

  it('stops while paused', () => {
    expect(meterState({ ...base, paused: true }).animating).toBe(false)
  })

  it('stops before the first read returns', () => {
    expect(meterState({ ...base, loading: true }).animating).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -F @leash/app test -- meter`
Expected: FAIL — `Cannot find module '../lib/meter.js'`.

- [ ] **Step 3: Write `app/lib/meter.ts`**

```ts
import { percentUsed } from './policy.js'

export type MeterInput = {
  daily: bigint
  remaining: bigint
  paused: boolean
  loading: boolean
  visible: boolean
  reduced: boolean
}

export type MeterState = {
  fillPercent: number
  locked: boolean
  animating: boolean
}

/**
 * Every decision the meter makes, as data. Extracted from the component so it
 * can be tested at all: app/vitest.config.ts runs in the node environment and
 * no component-testing dependency may be added (spec §2.2).
 *
 * `loading` suppresses everything. Before the first read returns there is
 * nothing to state, and a full bar or a lock icon drawn from a zero that is
 * merely un-read is a lie about someone's money.
 */
export function meterState(
  { daily, remaining, paused, loading, visible, reduced }: MeterInput,
): MeterState {
  if (loading) return { fillPercent: 0, locked: false, animating: false }

  const locked = daily > 0n && remaining === 0n
  const animating = !paused && !locked && visible && !reduced

  return { fillPercent: percentUsed(daily, remaining), locked, animating }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm -F @leash/app test -- meter`
Expected: PASS, 12 tests.

- [ ] **Step 5: Rewrite `app/components/Meter.tsx`**

Keep the props, the two `useEffect` hooks reading `prefers-reduced-motion` and `visibilitychange`, the `loading` copy, and the threshold sentence exactly as they are. Replace the `feTurbulence` drawing with the bar. Note the class is now `meter`, and the fill stops short of the cap line.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { formatAmount, refusalThreshold } from '../lib/policy.js'
import { meterState } from '../lib/meter.js'

type Props = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  decimals: number
  symbol: string
  paused: boolean
  /** True until the first read returns. Zeroes are not observations. */
  loading: boolean
}

const TRACK = 600
const CAP_X = 588
const CAP_W = 4
/** The fill stops here, 2px short of the cap line, so the line is always drawn
 *  on --well. --bad on --meter-fill is 1.36:1: a flush lock indicator would
 *  vanish at the moment it matters most. Spec §3.1. */
const FILL_MAX = CAP_X - 2

export default function Meter({
  daily, remaining, perTx, decimals, symbol, paused, loading,
}: Props) {
  // False on the server and on first paint so hydration matches; the effect
  // corrects it before the first frame anyone sees.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // An animation in a hidden tab is pure cost. Stop it there.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const { fillPercent, locked, animating } =
    meterState({ daily, remaining, paused, loading, visible, reduced })
  const threshold = refusalThreshold(remaining, perTx)
  const width = Math.max(0, Math.min(FILL_MAX, (fillPercent / 100) * FILL_MAX))

  return (
    <div className="px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex justify-between items-baseline gap-3">
        <span className="label">Remaining today</span>
        <span className="num text-sm" style={{ color: locked ? 'var(--bad)' : 'var(--text)' }}>
          {/* Before the first read there is nothing to state. 0.000000 here is
              indistinguishable from a spent allowance, and that is the first
              thing a visitor sees. */}
          {loading
            ? `— / — ${symbol}`
            : `${formatAmount(remaining, decimals)} / ${formatAmount(daily, decimals)} ${symbol}`}
        </span>
      </div>

      <svg
        className="meter block w-full mt-2"
        height={12}
        viewBox={`0 0 ${TRACK} 14`}
        preserveAspectRatio="none"
        role="img"
        aria-label={loading
          ? 'Reading the daily allowance'
          : `${fillPercent.toFixed(1)} percent of the daily allowance used`}
      >
        <rect width={TRACK} height="14" fill="var(--well)" />

        {!paused && !loading && (
          <rect width={width} height="14" fill="var(--meter-fill)">
            {/* Mounted only when motion is allowed. Hiding an <animate> in CSS
                matches, applies, and achieves nothing: SMIL has no renderer to
                suppress, so it keeps running and keeps costing a phone its
                battery. Only not mounting it decides. */}
            {animating && (
              <animate
                attributeName="opacity"
                values="1;0.72;1"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </rect>
        )}

        {/* The wall. Celo yellow while there is room, the blocked colour once
            the bar has struck it. One of exactly two places --celo appears. */}
        <rect
          x={CAP_X}
          width={CAP_W}
          height="14"
          fill={locked ? 'var(--bad)' : 'var(--celo)'}
        />
      </svg>

      <p className="label mt-2" style={{ color: locked ? 'var(--bad)' : 'var(--dim)' }}>
        {loading ? (
          'Reading the chain…'
        ) : paused ? (
          'Paused by the owner — every spend is refused'
        ) : threshold === 0n ? (
          'The allowance is spent — resets at UTC midnight'
        ) : (
          <>
            Next spend over{' '}
            {/* .num even here: this figure changes live, and the whole point of
                tabular-nums is that a changing figure must not reflow. */}
            <span className="num">
              {formatAmount(threshold, decimals)} {symbol}
            </span>{' '}
            will be refused
          </>
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Delete the two superseded gradient tokens**

`Meter.tsx` no longer references them as of Step 5, so `--meter-start` and `--meter-mid` — and the comment above them explaining why Task 1 kept them — come out of the `:root` block in `app/app/globals.css` now. Confirm first:

Run: `grep -rn 'meter-start\|meter-mid' app/components app/app --include='*.tsx' --include='*.css'`
Expected: only the two declarations in `globals.css`, no consumers.

- [ ] **Step 7: Update the two e2e selectors**

In `app/e2e/dashboard.spec.ts`, change `.meter-turbulence animate` to `.meter animate` in both places. Update the comment above the reduced-motion spec: the expensive thing is no longer `feTurbulence`, but the guarantee is unchanged and is the reason the assertion lives in a real browser.

- [ ] **Step 8: Run both suites**

Run: `pnpm -F @leash/app test && cd app && pnpm run test:e2e`
Expected: all unit tests pass; all four e2e specs pass.

- [ ] **Step 9: Commit**

```bash
git add app/app/globals.css app/lib/meter.ts app/test/meter.test.ts app/components/Meter.tsx app/e2e/dashboard.spec.ts
git commit -m "feat(app): the meter strikes a hard cap line instead of a painted current"
```

---

### Task 5: The proof rows as data

**Files:**
- Create: `app/lib/proofs.ts`, `app/test/proofs.test.ts`, `app/components/landing/ProofTable.tsx`

**Interfaces:**
- Consumes: `Panel` and `Label` from Task 2.
- Produces: `PROOFS: readonly Proof[]` where `Proof = { claim: string; detail: string; url: string }`, plus `explorerUrl(hash: string): string` and `shortHash(url: string): string`. `ProofTable` takes no props.

**Read this before writing the file.** A proof row stores the *explorer URL*, not a bare hash, and that is not a cosmetic choice. `scripts/check-secrets.sh` blocks any `0x`+64-hex value unless it is preceded by a `tx`/`txn`/`hash` word or sits after `/tx/` in a URL. `txHash: '0x…'` satisfies neither — there is no word boundary inside `txHash`, and the quote is not in the allowed separator class — so a `txHash` field makes this task's commit fail and trains a reflexive `--no-verify` on exactly the commit that carries five real mainnet hashes. Storing the URL is exempt by construction and is also what the component renders.

- [ ] **Step 1: Write the failing test**

Create `app/test/proofs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PROOFS, explorerUrl, shortHash } from '../lib/proofs.js'

describe('PROOFS', () => {
  it('carries the five mainnet proofs the README states', () => {
    expect(PROOFS).toHaveLength(5)
  })

  it('every row links to a full 32-byte transaction on celoscan', () => {
    for (const p of PROOFS) {
      expect(p.url).toMatch(/^https:\/\/celoscan\.io\/tx\/0x[0-9a-f]{64}$/)
    }
  })

  it('no row ships without a claim and a detail', () => {
    for (const p of PROOFS) {
      expect(p.claim.length).toBeGreaterThan(0)
      expect(p.detail.length).toBeGreaterThan(0)
    }
  })

  it('reuses one transaction where one spend proves two things', () => {
    // The policy gate and the attribution round-trip are two separate claims
    // about the same spend. Splitting them across two invented transactions
    // would be a lie; collapsing them into one row would hide a claim. Four
    // transactions carry five proofs.
    expect(new Set(PROOFS.map((p) => p.url)).size).toBe(4)
  })
})

describe('explorerUrl', () => {
  it('points at celoscan', () => {
    expect(explorerUrl('0xabc')).toBe('https://celoscan.io/tx/0xabc')
  })
})

describe('shortHash', () => {
  it('shows both ends of the hash and elides the middle', () => {
    expect(shortHash('https://celoscan.io/tx/0xabcdef0123456789tail999'))
      .toBe('0xabcdef01…tail999')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm -F @leash/app test -- proofs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `app/lib/proofs.ts`**

Every hash below was checked against mainnet on 2026-09-04 and returned `status 1`. Do not edit them without re-checking.

```ts
export type Proof = {
  claim: string
  detail: string
  /** The explorer URL, not a bare hash. See the note in this task's
   *  Interfaces block: the pre-commit secret guard exempts `/tx/0x…` and
   *  would otherwise block this file. */
  url: string
}

export function explorerUrl(hash: string): string {
  return `https://celoscan.io/tx/${hash}`
}

/** '0x3fb0324f…a851f70' for display, derived from the stored URL so the hash
 *  is written down exactly once. */
export function shortHash(url: string): string {
  const h = url.slice(url.lastIndexOf('/') + 1)
  return `${h.slice(0, 10)}…${h.slice(-7)}`
}

/**
 * The five things this project has proven rather than asserted. Mirrored in
 * README.md as prose; this is the source the app renders from.
 *
 * Every hash was read back off mainnet on 2026-09-04 and returned status 1.
 * One of them, the policy-gated spend, came back NOT_FOUND on a first receipt
 * request and null on one of four retries -- the load-balanced forno staleness
 * this repo documents. It is in block 76422123. Retry before concluding a
 * proof is wrong.
 */
export const PROOFS: readonly Proof[] = [
  {
    claim: 'The policy gates a real spend',
    detail: 'remainingToday fell by exactly the amount spent, so the cap governed the transfer rather than merely coexisting with it.',
    url: 'https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70',
  },
  {
    claim: 'The attribution tag round-trips',
    detail: 'The ERC-8021 suffix decodes to celo_3dec652cd977 off-chain and again straight from raw chain data.',
    url: 'https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70',
  },
  {
    claim: 'x402 paid with money drawn through the policy',
    detail: 'The agent rented a Google Cloud VM and the daily counter fell by exactly the draw. The caps apply to agent purchases, not only to plain transfers.',
    url: 'https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db',
  },
  {
    claim: 'The facilitator settled it, and the agent held zero CELO throughout',
    detail: 'Submitted by the facilitator, not by us. The operator paid its own gas in USDC and its CELO balance was 0 before and after.',
    url: 'https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25',
  },
  {
    claim: 'The contract is deployed and source-verified',
    detail: '3406 bytes, solc 0.8.24, not a proxy and not upgradeable. The owner can set policy, pause and sweep, and is deliberately not an operator.',
    url: 'https://celoscan.io/tx/0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779',
  },
]
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm -F @leash/app test -- proofs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `app/components/landing/ProofTable.tsx`**

```tsx
import Panel from '../ui/Panel'
import { PROOFS, shortHash } from '../../lib/proofs.js'

export default function ProofTable() {
  return (
    <Panel>
      {PROOFS.map((p, i) => (
        <div
          key={`${p.url}-${i}`}
          className="p-4 flex flex-col gap-1"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>
            {p.claim}
          </span>
          <span className="text-sm" style={{ color: 'var(--dim)' }}>{p.detail}</span>
          <a
            className="num text-xs mt-1 break-all"
            style={{ color: 'var(--celo)' }}
            href={p.url}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(p.url)} ↗
          </a>
        </div>
      ))}
    </Panel>
  )
}
```

- [ ] **Step 6: Typecheck and run the suite**

Run: `cd app && npx tsc --noEmit && cd .. && pnpm -F @leash/app test`
Expected: exit 0, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib/proofs.ts app/test/proofs.test.ts app/components/landing/ProofTable.tsx
git commit -m "feat(app): the mainnet proofs become data the app can render"
```

---

### Task 6: The landing page's static sections

**Files:**
- Create: `app/components/landing/Hero.tsx`, `Contrast.tsx`, `HowItWorks.tsx`, `AgentTools.tsx`
- Modify: `app/app/page.tsx`, `app/app/layout.tsx`

**Interfaces:**
- Consumes: `Button`, `Panel`, `Label`, `Section` from Task 2; `ProofTable` from Task 5.
- Produces: the assembled `/` route. Task 7 inserts `LiveProof` into it.

- [ ] **Step 1: Write `app/components/landing/Hero.tsx`**

```tsx
import Link from 'next/link'
import Button from '../ui/Button'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

export default function Hero() {
  return (
    <header className="w-full max-w-3xl mx-auto px-4 pt-16 pb-10">
      <p style={{ color: 'var(--celo)', letterSpacing: '.26em', fontWeight: 700 }}>LEASH</p>
      <h1 className="mt-6 text-3xl sm:text-4xl font-semibold leading-tight" style={{ color: 'var(--text)' }}>
        Give an AI agent a wallet without trusting it.
      </h1>
      <p className="mt-4 text-base sm:text-lg" style={{ color: 'var(--dim)' }}>
        Spend limits are enforced by a contract on Celo, not by a sentence in a
        prompt. The money never sits in the agent&apos;s wallet — the agent can
        only ask, and the contract refuses.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
        <Link href={`/a/${ACCOUNT}`}><Button variant="ghost">See the live account →</Button></Link>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Write `app/components/landing/Contrast.tsx`**

```tsx
import Panel from '../ui/Panel'
import Label from '../ui/Label'

const ROWS: ReadonlyArray<{ without: string; with_: string }> = [
  { without: 'The agent holds the private key.', with_: 'The money sits in a contract. The agent holds a key that can only ask.' },
  { without: 'A leaked key drains the wallet.', with_: 'A leaked key spends at most one day’s allowance, to addresses you named.' },
  { without: '“Only spend $5 a day” is an instruction.', with_: '$5 a day is code. Over it, the transaction reverts.' },
  { without: 'You find out afterwards.', with_: 'You watch it live, and you can stop it in one click.' },
]

export default function Contrast() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel className="p-4">
        <Label>Without Leash</Label>
        <ul className="mt-3 flex flex-col gap-3">
          {ROWS.map((r) => (
            <li key={r.without} className="text-sm" style={{ color: 'var(--dim)' }}>{r.without}</li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-4">
        <Label>With Leash</Label>
        <ul className="mt-3 flex flex-col gap-3">
          {ROWS.map((r) => (
            <li key={r.with_} className="text-sm" style={{ color: 'var(--text)' }}>{r.with_}</li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/components/landing/HowItWorks.tsx`**

```tsx
import Panel from '../ui/Panel'

const STEPS = [
  { n: '1', title: 'Deploy your account', body: 'One transaction. You are the owner; nobody else can change the limits.' },
  { n: '2', title: 'Set the limits', body: 'A cap per transaction and a cap per day, in USDC. Until you set them, every spend is refused.' },
  { n: '3', title: 'Hand your agent the key', body: 'Paste one block into .mcp.json. The key it receives cannot raise its own limits.' },
]

export default function HowItWorks() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {STEPS.map((s) => (
        <Panel key={s.n} className="p-4">
          <span className="num text-sm" style={{ color: 'var(--celo)' }}>{s.n}</span>
          <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.title}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--dim)' }}>{s.body}</p>
        </Panel>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Write `app/components/landing/AgentTools.tsx`**

```tsx
import Panel from '../ui/Panel'

const TOOLS = [
  { name: 'leash_status', body: 'What is left today, what the caps are, when the allowance resets.' },
  { name: 'leash_pay', body: 'Pay a Celo address. Refused past the caps, and the refusal explains itself.' },
  { name: 'leash_fetch', body: 'Call an API that charges per request over x402 and pay for it. Quote first, with a ceiling you set.' },
]

export default function AgentTools() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <Panel key={t.name} className="p-4">
            <p className="num text-sm" style={{ color: 'var(--celo)' }}>{t.name}</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>{t.body}</p>
          </Panel>
        ))}
      </div>
      <p className="text-sm" style={{ color: 'var(--dim)' }}>
        That is the whole surface. Nothing here raises a limit, moves the money
        out, or adds another agent — those live on the contract behind the
        owner&apos;s key.
      </p>

      {/* Spec §5 item 5: show the block, and reuse McpHandoff rather than
          duplicating it. tagStatus="missing" is the truth here -- a stranger
          reading the landing page has no attribution tag yet, so the component
          ships its `celo_yourtag` placeholder and says so, which is exactly the
          mistake it was built to catch. The wizard at /setup passes the real
          values and 'ok'. */}
      <McpHandoff handoff={SAMPLE} tagStatus="missing" />
    </div>
  )
}
```

`SAMPLE` and the import belong at the top of the same file:

```tsx
import McpHandoff from '../McpHandoff'
import type { McpHandoff as Handoff } from '../../lib/mcpJson.js'

/** The live demo account, so the block a reader copies is real except for the
 *  two values only they can supply: their agent's key and their own tag. */
const SAMPLE: Handoff = {
  account: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: '',
}
```

- [ ] **Step 5: Assemble `app/app/page.tsx`**

Replace the Task 3 placeholder entirely.

```tsx
import Hero from '../components/landing/Hero'
import Contrast from '../components/landing/Contrast'
import HowItWorks from '../components/landing/HowItWorks'
import AgentTools from '../components/landing/AgentTools'
import ProofTable from '../components/landing/ProofTable'
import Section from '../components/ui/Section'
import Button from '../components/ui/Button'
import Link from 'next/link'

export default function Landing() {
  return (
    <main>
      <Hero />
      <Section title="The difference"><Contrast /></Section>
      <Section title="How it works"><HowItWorks /></Section>
      <Section title="What your agent gets"><AgentTools /></Section>
      <Section title="Proven on Celo mainnet"><ProofTable /></Section>
      <Section>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
          <a className="text-sm" style={{ color: 'var(--dim)' }}
             href="https://github.com/hms1499/leash" target="_blank" rel="noreferrer">
            github ↗
          </a>
        </div>
      </Section>
    </main>
  )
}
```

- [ ] **Step 6: Update `app/app/layout.tsx` metadata**

`/` is now a page strangers land on, so the description must stand alone.

```tsx
export const metadata: Metadata = {
  title: 'Leash — an agent wallet you do not have to trust',
  description:
    'Spend limits for an AI agent, enforced by a contract on Celo mainnet rather than by a prompt. Live, verifiable, and open source.',
}
```

- [ ] **Step 7: Typecheck and build**

Run: `cd app && npx tsc --noEmit && pnpm run build`
Expected: exit 0 for both.

- [ ] **Step 8: Commit**

```bash
git add app/app/page.tsx app/app/layout.tsx app/components/landing
git commit -m "feat(app): a front door that says what Leash is before asking for a wallet"
```

---

### Task 7: The live proof section

The landing page's whole argument is that a visitor can verify without trusting. This is the part that does it.

**Files:**
- Create: `app/components/landing/LiveProof.tsx`
- Modify: `app/app/page.tsx`

**Interfaces:**
- Consumes: `useAccountState(account, token)` — **two arguments** — returning `{ daily, remaining, perTx, paused, owner, isLoading, error, refetch }`; `useFeed(account, fromBlock?)` returning `{ rows, isLoading, error, head }`; `Meter` from Task 4; `AddressChip` from Task 2.
- Produces: nothing consumed later.

- [ ] **Step 1: Write `app/components/landing/LiveProof.tsx`**

```tsx
'use client'

import Meter from '../Meter'
import Panel from '../ui/Panel'
import Label from '../ui/Label'
import { useAccountState } from '../../lib/useAccountState.js'
import { useFeed } from '../../lib/useFeed.js'
import AddressChip from '../ui/AddressChip'
import { explorerUrl } from '../../lib/proofs.js'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2' as const
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const ROWS = 3

export default function LiveProof() {
  // Two arguments, not three: useAccountState.ts:30 takes (account, token) and
  // returns bigints. DECIMALS below is for formatting only.
  const state = useAccountState(ACCOUNT, TOKEN)
  const feed = useFeed(ACCOUNT)

  return (
    <Panel>
      <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
        <Label>Live on Celo mainnet</Label>
        {/* Pre-flight ruling: use the AddressChip primitive rather than
            hand-rolling the identical markup. Spec §6 lists it, and an unused
            primitive is dead code. */}
        <AddressChip address={ACCOUNT} href={`https://celoscan.io/address/${ACCOUNT}`} />
      </div>

      <div className="mt-3">
        <Meter
          daily={state.daily}
          remaining={state.remaining}
          perTx={state.perTx}
          decimals={DECIMALS}
          symbol="USDC"
          paused={state.paused}
          loading={state.isLoading}
        />
      </div>

      <div className="p-4 flex flex-col gap-2">
        {/* Capped at three rows on purpose: forno refuses a getLogs range wider
            than 5,000 blocks, so every window costs window / 5,000 sequential
            round trips, and this page is the one strangers load. Spec §5.2. */}
        {feed.rows.slice(0, ROWS).map((r) => (
          <a
            key={`${r.txHash}-${r.logIndex}`}
            className="text-sm flex justify-between gap-3"
            style={{ color: 'var(--dim)' }}
            href={explorerUrl(r.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            <span>{r.text}</span>
            <span className="num shrink-0">↗</span>
          </a>
        ))}
        {feed.rows.length === 0 && (
          <span className="text-sm" style={{ color: 'var(--dim)' }}>
            Reading recent activity from the chain…
          </span>
        )}
      </div>
    </Panel>
  )
}
```

- [ ] **Step 2: Insert it into `app/app/page.tsx`**

Add the import and place the section immediately after `<Hero />`, before `The difference`:

```tsx
import LiveProof from '../components/landing/LiveProof'
// …
      <Hero />
      <Section><LiveProof /></Section>
      <Section title="The difference"><Contrast /></Section>
```

- [ ] **Step 3: Typecheck and build**

Run: `cd app && npx tsc --noEmit && pnpm run build`
Expected: exit 0 for both.

- [ ] **Step 4: Look at it against the live chain**

Run: `cd app && pnpm run dev`, open `http://localhost:3000`.
Expected: the meter shows a real pair of six-decimal figures, not `— / —` and not `NaN`, within about thirty seconds. Feed rows appear or the reading message stays.

- [ ] **Step 5: Commit**

```bash
git add app/components/landing/LiveProof.tsx app/app/page.tsx
git commit -m "feat(app): the landing page proves itself against mainnet instead of claiming"
```

---

### Task 8: Restyle the dashboard and the eight components

Logic is untouched throughout. Every change in this task is which primitive gets rendered.

**Files:**
- Modify: `app/app/a/[address]/page.tsx`, `app/components/{AgentPanel,ConnectButton,CopyAddress,Feed,LimitsDrawer,McpHandoff,NetworkBadge,StopButton}.tsx`
- Modify: `app/app/globals.css`

**Interfaces:**
- Consumes: `Button`, `Panel`, `Label`, `Stat` from Task 2.
- Produces: nothing consumed later.

- [ ] **Step 1: Replace `.panel` and `.btn-*` usages**

In each of the eight components and the dashboard page, replace `<div className="panel …">` with `<Panel className="…">` and `<button className="btn-primary">` with `<Button variant="primary">`, `btn-ghost` with `variant="ghost"`, `btn-stop` with `variant="stop"`. Carry every `disabled`, `onClick` and `aria-*` attribute across unchanged.

Do not touch: the `pollUntil` calls, the `chainId !== REQUIRED_CHAIN_ID` guards, the `operators()` verification in `app/app/a/[address]/page.tsx:113-122`, or any `catch` branch. Every one of those guards a hazard this project paid for.

- [ ] **Step 2: Delete the superseded classes from `app/app/globals.css`**

This task owns all four deletions Task 2 deliberately left in place. Only after every consumer has been converted. Search first:

Run: `grep -rnE 'className="(panel|btn-primary|btn-ghost|btn-stop|label)"' app/components app/app`
Expected: no matches. Then delete `.panel`, `.btn-primary`, `.btn-ghost`, `.btn-stop`, the two rules that follow them setting `cursor` and the disabled state, and `.label`.

**`.num` stays.** It is a `CLAUDE.md` convention applied to numerals inside otherwise unrelated markup, and nothing replaces it.

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run both suites**

Run: `pnpm -F @leash/app test && cd app && pnpm run test:e2e`
Expected: all unit tests pass; all four e2e specs pass. The dashboard spec asserts on visible text and `.num`, both of which survive this task.

- [ ] **Step 5: Commit**

```bash
git add app/app app/components app/app/globals.css
git commit -m "refactor(app): every screen renders the same primitives"
```

---

### Task 9: Mobile and landing coverage

Spec §4 of `2026-09-01-leash-design.md` has required mobile-first since the beginning and nothing has ever tested it.

**Files:**
- Modify: `app/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: the assembled `/` from Tasks 6 and 7.
- Produces: nothing.

- [ ] **Step 1: Add the two specs**

Append to `app/e2e/landing.spec.ts`:

```ts
/**
 * The judge's path, one step earlier than the dashboard spec: open the
 * submitted link and understand what this is, with no wallet, and see that the
 * numbers are real rather than illustrative.
 */
test('the landing page explains itself and shows live mainnet numbers', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: /wallet without trusting it/i }),
  ).toBeVisible()

  await expect(page.getByText('Live on Celo mainnet')).toBeVisible()
  await expect(page.locator('.num').filter({ hasText: /\d+\.\d{6}/ }).first())
    .toBeVisible({ timeout: 30_000 })

  // The proof rows are links a reader can actually open.
  await expect(page.locator('a[href^="https://celoscan.io/tx/"]').first()).toBeVisible()

  await expect(page.getByRole('link', { name: /build your own/i }).first()).toBeVisible()
})

/**
 * 2026-09-01 spec §4 requires mobile-first for the MiniPay in-app browser.
 * Nothing tested it until now. A page that scrolls sideways on a phone is the
 * failure this catches.
 */
test('the landing page does not scroll sideways on a phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } })
  const page = await context.newPage()
  try {
    await page.goto('/')
    await expect(page.getByText('Live on Celo mainnet')).toBeVisible({ timeout: 30_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  } finally {
    await context.close()
  }
})
```

- [ ] **Step 2: Run them and read the failures**

Run: `cd app && pnpm run test:e2e -- landing`
Expected: they may fail. The long transaction hashes in `ProofTable` are the likely cause of sideways scroll — `break-all` is already set on that link, so check the `.mcp.json` `<pre>` in `AgentTools` and any `overflow-x: auto` container that is missing one.

- [ ] **Step 3: Fix whatever they catch**

Wide content scrolls inside its own container; the page body never scrolls sideways.

- [ ] **Step 4: Run the full e2e suite**

Run: `cd app && pnpm run test:e2e`
Expected: six specs pass.

- [ ] **Step 5: Run everything one last time**

Run: `pnpm -F @leash/app test && cd app && npx tsc --noEmit && pnpm run test:e2e`
Expected: unit tests pass, exit 0, e2e passes.

- [ ] **Step 6: Commit**

```bash
git add app/e2e/landing.spec.ts app/components
git commit -m "test(app): the mobile-first requirement finally has a test"
```

---

## After the plan

Two things remain that this plan cannot do, both already recorded in spec §8:

1. **Nobody has ever connected a browser wallet to the wizard**, and this plan moves it to `/setup`. Its three writes — deploy, `setOperator`, `setPolicy` — have unit tests and have never been clicked. Do that immediately after Task 9, including a deliberate rejection in the wallet and a deliberate wrong-chain attempt.
2. **`NEXT_PUBLIC_CELO_RPC_URL` must be set wherever this is deployed.** The landing page reads logs on load; without a dedicated RPC every visitor shares public forno.
