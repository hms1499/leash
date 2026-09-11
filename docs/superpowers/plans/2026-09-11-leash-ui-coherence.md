# Leash UI Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between `docs/design-system.md` and what the app actually renders — 17 distinct type faces on a screen whose scale defines six.

**Architecture:** No new visual direction and no new colour. Three moves, in order: correct the two token facts the document got wrong (radius count, missing rank), build the instrument that can see the defect (a Playwright counter of *rendered* faces, not class names), then migrate call sites with that counter ratcheting down. Hierarchy fixes and the chrome primitive follow, because they are only legible once the type ranks are.

**Tech Stack:** Next.js App Router, Tailwind 3, vitest, Playwright, TypeScript. No component library (spec §2.2).

**Spec:** `docs/superpowers/specs/2026-09-11-leash-ui-coherence-design.md`

## Global Constraints

- **`docs/design-system.md` §9 governs every task: change the rule in that document first, and the code second.** A task that edits behaviour without editing the rule it changes is incomplete.
- **Count it, do not recall it.** Every number written into a doc or a test must come from a command run in that task, pasted from its output.
- The palette, the ground rule (§4) and the state vocabulary (§5) are untouched. Dark grounds (`--bg`, `--panel`, `--well`) take any foreground but `--bg`; bright grounds (`--bad`, `--celo`) take only `--bg`.
- No motion, gradients, shadows, hover effects, `z-index`, or new colour. §12 and §13 forbid them and `test/surface.test.ts` enforces the last two at zero.
- Never report a write as confirmed unless it was observed. `pollUntil` returning false is "we stopped waiting", never "it failed".
- Money on screen uses `.num`. Comments explain *why*, especially where a line guards a hazard that was paid for; do not strip those comments when editing nearby code.
- Commit subjects describe the defect in plain English, not the diff. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CRYgAJqvbZnp328iBHgLuu
  ```
- Run from `/Users/vanhuy/Desktop/celo/app` unless a step says otherwise. Full suite: `npx vitest run`. E2E: `pnpm -F @leash/app test:e2e` from the repo root (builds and serves; minutes, not seconds).
- **Never run `test:gate` in `sdk` or `mcp`.** Those spend real money on mainnet.

---

### Task 1: Four radii, because the app has five

**Files:**
- Modify: `app/lib/surface.ts:31-40`
- Modify: `app/app/globals.css` (the `--r-*` block, ~line 44)
- Modify: `app/components/ui/Panel.tsx:14`
- Modify: `app/app/a/[address]/page.tsx:317`
- Modify: `app/app/setup/page.tsx:84`
- Modify: `app/components/McpHandoff.tsx:81`
- Modify: `docs/design-system.md` §10
- Test: `app/test/surface.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RADIUS` in `lib/surface.ts` gains key `surface: '8px'`; CSS custom property `--r-surface: 8px`. Later tasks use `var(--r-surface)` for panels and `var(--r-box)` for controls and wells.

- [ ] **Step 1: Measure the inline radii, so the doc quotes a command and not a memory**

Run from `/Users/vanhuy/Desktop/celo/app`:
```bash
grep -rn "borderRadius: [0-9]" components app --include="*.tsx"
```
Expected: exactly four lines — `Panel.tsx:14` = 8, `a/[address]/page.tsx:317` = 8, `setup/page.tsx:84` = 6, `McpHandoff.tsx:81` = 4. Paste this output into the Task 1 commit body.

- [ ] **Step 2: Write the failing test**

Add to `app/test/surface.test.ts`, inside `describe('the three corners', …)` — and rename that describe to `'the four corners'`:

```ts
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
```

`FILES` currently lives inside `describe('no elevation', …)`. Hoist it and its `sources()` helper to module scope, above the first `describe`, so both suites share one list.

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run test/surface.test.ts`
Expected: FAIL, listing four files with one hit each.

- [ ] **Step 4: Add the fourth token**

In `app/lib/surface.ts`, replace the `RADIUS` block and its docstring:

```ts
/**
 * Four corners, and the choice between them is about what a thing *is*.
 *
 * A single radius on everything is the tell of a kit rather than a system: it
 * makes a status dot and a submit button claim to be the same kind of object.
 * Here the corner is the claim. design-system.md §10.
 *
 * §10 first said three and no fourth. It had grepped classes and CSS and not
 * inline `borderRadius`, where four more values were sitting -- including
 * Panel, the most-used container in the product, at 8px. A surface is not a
 * control, and that is the distinction the missing fourth was carrying.
 */
export const RADIUS = {
  /** A panel, a card, a band: something the layout sits on. */
  surface: '8px',
  /** A control or a well: Button, ActionLink, .field, a code block. */
  box: '4px',
  /** A mark laid over text: the ring on an inline link, the wordmark. */
  mark: '2px',
  /** A state dot, and only ever that. A pill in this UI means "status". */
  dot: '9999px',
} as const
```

In `app/app/globals.css`, replace the `--r-*` declarations and their comment:

```css
  /* The corner says what kind of thing this is, not how modern it looks.
     Four values, one per kind of object: a surface the layout sits on, a
     control or well, a mark laid over text, a state dot. Asserted against
     lib/surface.ts. docs/design-system.md §10. */
  --r-surface: 8px;
  --r-box: 4px;
  --r-mark: 2px;
  --r-dot: 9999px;
```

- [ ] **Step 5: Move the four inline literals onto tokens**

`app/components/ui/Panel.tsx:14` — `borderRadius: 8` becomes `borderRadius: 'var(--r-surface)'`.

`app/app/a/[address]/page.tsx:317` — `borderRadius: 8` becomes `borderRadius: 'var(--r-surface)'`.

`app/app/setup/page.tsx:84` — `borderRadius: 6` becomes `borderRadius: 'var(--r-box)'`, and add above `STATUS_BOX`:

```ts
/** A --well box holding a choice is a control, not a surface: --r-box, not
 *  --r-surface. The 6px here was the only radius in the app on no scale at
 *  all. design-system.md §10. */
```

`app/components/McpHandoff.tsx:81` — `borderRadius: 4` becomes `borderRadius: 'var(--r-box)'`.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npx vitest run`
Expected: PASS, all files. `surface.test.ts` now has 17 tests.

- [ ] **Step 7: Rewrite §10 in the design system**

In `docs/design-system.md` §10, replace the three-row table with the four-row table from spec §2.1, replace the "Why three and not one" heading with "Why four and not one", and replace the first bullet under **Rules**:

```markdown
- **There is no fifth radius, and the fourth was found by re-measuring.** §10
  first claimed three, having grepped `rounded*` classes and `border-radius`
  in CSS but not inline `borderRadius` — where four more values were sitting,
  including `Panel`, the most-used container in the product, at 8px. A surface
  is not a control. `test/surface.test.ts` now asserts the set *and* holds a
  ratchet at zero over inline numeric radii, so the next one fails the suite
  rather than waiting a month to be counted.
```

Keep the pill rule and the "radius is never a state" rule unchanged.

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/lib/surface.ts app/app/globals.css app/components/ui/Panel.tsx \
  app/app/a/\[address\]/page.tsx app/app/setup/page.tsx \
  app/components/McpHandoff.tsx app/test/surface.test.ts docs/design-system.md
git commit -m "fix(app): §10 counted three radii and the app had five"
```

---

### Task 2: The seventh type step

**Files:**
- Modify: `app/lib/type.ts`
- Modify: `app/app/globals.css` (the `--t-*` block)
- Modify: `app/test/type.test.ts:40-43`
- Modify: `docs/design-system.md` §2
- Test: `app/test/type.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SCALE.subhead = { size: '14px', line: '1.35' }`; CSS `--t-subhead: 14px; --t-subhead-line: 1.35;`. Task 4 consumes both through a new `SUBHEAD` style constant.

- [ ] **Step 1: Count the sites that justify the step**

Run from `/Users/vanhuy/Desktop/celo/app`:
```bash
grep -rn "text-sm font-semibold\|font-semibold text-sm" components app --include="*.tsx" | wc -l
```
Expected: `16`. If the number differs, use the number you measured in the doc and the commit body — never the one written here.

- [ ] **Step 2: Write the failing test**

In `app/test/type.test.ts`, replace `it('has exactly six steps', …)` and `it('descends strictly', …)` with:

```ts
  /**
   * §2's rule is that a seventh step means one of the six is doing two jobs.
   * Measured 2026-09-11, `--t-heading` was: it carried section titles *and*
   * the title of every block below one, because 16 call sites wrote
   * `text-sm font-semibold` rather than find a rank that did not exist.
   */
  it('has exactly seven steps', () => {
    expect(Object.keys(SCALE)).toHaveLength(7)
  })

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
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run test/type.test.ts`
Expected: FAIL — "expected 6 to be 7" and "expected [] to deeply equal ['subhead/body']".

- [ ] **Step 4: Add the step**

In `app/lib/type.ts`, insert between `heading` and `body` so the object order is the visual order:

```ts
  /**
   * The title of a block sitting below a section title: a landing card, a
   * wizard sub-step, a claim in SecurityBoundary.
   *
   * Shares 14px with `body` on purpose. The pair is separated by family
   * rather than size, which is §1's central rule made structural -- mono is
   * what a reader looks at, sans is what they read, and a card title is
   * looked at. The 16 call sites this replaces were all sans 600, so all 16
   * were §1 violations as well as off-scale.
   */
  subhead: { size: '14px', line: '1.35' },
```

In `app/app/globals.css`, add to the type block, after `--t-heading`:

```css
  --t-subhead: 14px;  --t-subhead-line: 1.35;
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run test/type.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Document the step**

In `docs/design-system.md` §2, add the row to the scale table between `--t-heading` and `--t-body`:

```markdown
| `--t-subhead` | 14px / 1.35 | mono 500 | the title of a block below a section title |
```

Change "Six steps. Each has one job; a seventh means one of these is doing
two." to:

```markdown
Seven steps and six sizes. Each has one job; an eighth means one of these is
doing two.

`--t-subhead` is the seventh, and it was added by applying that rule to the
evidence rather than by wanting another size. Measured 2026-09-11,
`text-sm font-semibold` — 14px sans 600 — appeared at 16 call sites, every one
of them the title of a block below a section title. The scale offered nothing
between `--t-heading` (18px) and `--t-body` (14px), so sixteen call sites
invented the same rank independently. Putting them on `--t-heading` would rank
a card title equal to the section title above it; putting them on `--t-label`
is what this section already rejected. `--t-heading` was doing two jobs.

It shares 14px with `--t-body` and is separated from it by family, not size.
That is §1 made structural: mono is what a reader looks at, sans is what they
read, and a card title is looked at. All 16 sites were sans, so all 16 were §1
violations before they were off-scale.
```

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/lib/type.ts app/app/globals.css app/test/type.test.ts docs/design-system.md
git commit -m "feat(app): sixteen call sites invented the rank the scale was missing"
```

---

### Task 3: The instrument — count rendered faces, not class names

**Files:**
- Create: `app/e2e/faces.spec.ts`
- Modify: `docs/design-system.md` §2 (the paragraph about `scaleUsage.test.ts`)

**Interfaces:**
- Consumes: nothing.
- Produces: `app/e2e/faces.spec.ts` exporting nothing; it holds `const CEILING: Record<string, number>` keyed by route path, which Tasks 4, 5 and 6 lower.

- [ ] **Step 1: Write the test**

Create `app/e2e/faces.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/**
 * What the eye receives, rather than what the source says.
 *
 * test/scaleUsage.test.ts counts class names. It cannot see a face produced
 * by an inline style, a font-weight utility or a family switch, and measured
 * in Chromium on 2026-09-11 the landing page rendered 17 distinct faces
 * against a scale of six steps. That gap is the defect; the class count was
 * green throughout.
 *
 * A ratchet, like the others in this repo: the numbers may fall and may not
 * rise. Fail on more, and fail on a route cleaned up without lowering its
 * number, so the list cannot quietly stop meaning anything.
 */

/** Distinct `${size} ${mono|sans} ${weight}` triples rendered on the route. */
const CEILING: Record<string, number> = {
  '/': 17,
  '/setup': 17,
  '/accounts': 17,
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982': 17,
}

async function faces(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const seen = new Set<string>()
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,div,a,button,li,summary,label')) {
      // Only elements that draw text themselves. A wrapper inherits a face it
      // never paints, and counting it would report ranks nobody can see.
      if (!el.firstChild || el.firstChild.nodeType !== 3) continue
      if (!el.textContent?.trim()) continue
      const cs = getComputedStyle(el)
      const mono = cs.fontFamily.toLowerCase().includes('mono')
      seen.add(`${cs.fontSize} ${mono ? 'mono' : 'sans'} ${cs.fontWeight}`)
    }
    return [...seen].sort()
  })
}

for (const [route, ceiling] of Object.entries(CEILING)) {
  test(`${route} renders no more type faces than its recorded ceiling`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const found = await faces(page)
    expect(found.length, `${route} renders:\n${found.join('\n')}\n\n`
      + 'docs/design-system.md §2 defines seven steps. Lower the ceiling in '
      + 'this file when a route is cleaned up, so the list stays honest.')
      .toBeLessThanOrEqual(ceiling)
  })
}
```

- [ ] **Step 2: Run it and record the real ceilings**

Run from `/Users/vanhuy/Desktop/celo`:
```bash
pnpm -F @leash/app test:e2e -- faces.spec.ts
```
Expected: it prints the face list for each route. Replace each `17` in `CEILING` with the number that route actually rendered. Do not guess: the four routes will differ.

- [ ] **Step 3: Run it again to make sure it passes at the recorded numbers**

Run: `pnpm -F @leash/app test:e2e -- faces.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Prove the ratchet bites**

Temporarily add `style={{ fontSize: '17px' }}` to the `<h1>` in `app/components/landing/Hero.tsx`, run the spec, confirm `/` FAILS, then revert the edit and confirm it passes again.

- [ ] **Step 5: Document the instrument**

In `docs/design-system.md` §2, after the paragraph beginning "`test/scaleUsage.test.ts` is the missing half", add:

```markdown
`e2e/faces.spec.ts` is the half that was missing from *both*. The two vitest
suites read source: one checks the tokens agree with each other, the other
counts class names. Neither can see a face produced by an inline style, a
font-weight utility or a family switch — and measured in Chromium on
2026-09-11 the landing page rendered **17 distinct faces** while every source
test was green. It counts what the eye receives, per route, and ratchets down.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/e2e/faces.spec.ts docs/design-system.md
git commit -m "test(app): the type tests read the source and the defect was on the screen"
```

---

### Task 4: Move the sixteen invented card titles onto `--t-subhead`

**Files:**
- Modify: `app/components/ui/prose.ts`
- Modify: `app/components/AgentPanel.tsx:180,188`
- Modify: `app/components/landing/HowItWorks.tsx:17`
- Modify: `app/components/landing/CoreCapabilities.tsx:45`
- Modify: `app/components/landing/SecurityBoundary.tsx:74`
- Modify: `app/components/landing/UseCaseGrid.tsx:30`
- Modify: `app/app/setup/page.tsx:713,808,818,825,869,915,925,951,1016,1048`
- Modify: `app/test/scaleUsage.test.ts` (`RAW_TYPE_DEBT`)
- Modify: `app/e2e/faces.spec.ts` (`CEILING`)

**Interfaces:**
- Consumes: `SCALE.subhead` and `--t-subhead` from Task 2; `CEILING` from Task 3.
- Produces: `SUBHEAD` exported from `app/components/ui/prose.ts` as `React.CSSProperties`.

- [ ] **Step 1: Add the style constant**

Append to `app/components/ui/prose.ts`:

```ts
/**
 * The rank below a section title, in one place.
 *
 * Sixteen call sites wrote `text-sm font-semibold` for this and none of them
 * was on the scale. Mono rather than sans because §1 makes mono what a reader
 * looks at, and 500 rather than 600 to match --t-heading's weight: this is the
 * step below it, not a bolder one beside it.
 */
export const SUBHEAD: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-subhead)',
  lineHeight: 'var(--t-subhead-line)',
  fontWeight: 500,
}
```

- [ ] **Step 2: Migrate every site**

At each of the 16 locations, drop `text-sm font-semibold` from `className` and spread `SUBHEAD` into `style`, importing it from the right relative path (`./ui/prose`, `../ui/prose`, or `../../components/ui/prose`).

Pattern — before:
```tsx
<h3 className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.title}</h3>
```
after:
```tsx
<h3 className="mt-2" style={{ ...SUBHEAD, color: 'var(--text)' }}>{s.title}</h3>
```

Where the element already has a `style` object, `SUBHEAD` goes first so the
call site's own colour still wins. Where it has none, add one.

`app/app/setup/page.tsx:1016` sets `color: 'var(--ok)'` — keep it; `--ok` is
5.57:1 on `--panel` and the ground rule is unchanged.

- [ ] **Step 3: Re-measure and lower both ratchets**

Run from `/Users/vanhuy/Desktop/celo/app`:
```bash
npx vitest run test/scaleUsage.test.ts
```
Expected: FAIL with "raw Tailwind type sizes were cleaned up without lowering the debt list", naming each file and its new count. Lower each entry in `RAW_TYPE_DEBT` to the number printed; delete any entry that reached 0.

- [ ] **Step 4: Run the vitest suite to make sure it passes**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Lower the rendered-face ceilings**

Run from `/Users/vanhuy/Desktop/celo`:
```bash
pnpm -F @leash/app test:e2e -- faces.spec.ts
```
Read the printed face list for each route, lower each `CEILING` entry to the
count now rendered, and re-run until green. `14px sans 600` must be absent
from every list; if it is still present, a call site was missed.

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components app/app/setup/page.tsx app/test/scaleUsage.test.ts app/e2e/faces.spec.ts
git commit -m "fix(app): sixteen card titles were set in the face reserved for prose"
```

---

### Task 5: Retire the 12px that was never on the scale

**Files:**
- Modify: `app/app/setup/page.tsx` (13 sites)
- Modify: `app/components/landing/ProtectionModel.tsx` (4)
- Modify: `app/components/landing/SiteHeader.tsx` (2)
- Modify: `app/components/landing/SecurityBoundary.tsx` (2)
- Modify: `app/components/DashboardOverview.tsx` (2)
- Modify: `app/components/landing/SiteFooter.tsx`, `app/components/landing/Hero.tsx`, `app/components/McpHandoff.tsx`, `app/components/AgentPanel.tsx` (1 each)
- Modify: `app/test/scaleUsage.test.ts` (`RAW_TYPE_DEBT`)
- Modify: `app/e2e/faces.spec.ts` (`CEILING`)

**Interfaces:**
- Consumes: `CEILING` from Task 3, `RAW_TYPE_DEBT` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: List every site**

Run from `/Users/vanhuy/Desktop/celo/app`:
```bash
grep -rn "text-xs" components app --include="*.tsx"
```
Expected: 27 lines across 9 files.

- [ ] **Step 2: Decide each one by the rule, not by find-and-replace**

§2 says each `text-xs` "is a decision between 13px and 11px that wants a
person looking at the screen". Spec §2.3 gives the rule that makes the
decision repeatable:

> A number, an address or a transaction hash is `--t-data`. A name for
> something else on the screen is `--t-label`.

For a `--t-data` site, drop `text-xs` and add to `style`:
```tsx
fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)',
```
For a `--t-label` site, drop `text-xs` and render the text through the
existing `Label` component (`components/ui/Label.tsx`) rather than restating
its four properties by hand.

The two nav links in `SiteHeader.tsx:28,39` and the "My accounts" link are
names for destinations, not data: they are `--t-label`. But `Label` renders
uppercase with `.16em`, which would change the header's voice — so these move
to `--t-data` instead and the decision is recorded in a comment at the call
site, naming why the label step was refused.

- [ ] **Step 3: Run the vitest suite and lower the ratchet**

Run: `npx vitest run test/scaleUsage.test.ts`
Expected: FAIL with the new per-file counts. Lower each `RAW_TYPE_DEBT` entry
to the number printed; delete entries that reached 0.

- [ ] **Step 4: Run the full vitest suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Lower the ceilings and confirm 12px is gone**

Run from `/Users/vanhuy/Desktop/celo`:
```bash
pnpm -F @leash/app test:e2e -- faces.spec.ts
```
No route's face list may contain a `12px` entry. Lower each `CEILING` to the
count now rendered and re-run until green.

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components app/app/setup/page.tsx app/test/scaleUsage.test.ts app/e2e/faces.spec.ts
git commit -m "fix(app): twelve pixels was a size this project never defined"
```

---

### Task 6: One `--t-display` per screen, and the landing has none

**Files:**
- Modify: `app/components/landing/Hero.tsx:13-20`
- Modify: `app/e2e/faces.spec.ts`
- Modify: `docs/design-system.md` §7 (Landing)

**Interfaces:**
- Consumes: `CEILING` and `faces()` from Task 3.
- Produces: a second assertion in `faces.spec.ts` — at most one element per route at `--t-display`.

- [ ] **Step 1: Write the failing test**

Append to `app/e2e/faces.spec.ts`:

```ts
/**
 * §2: --t-display appears at most once per screen, and is only ever a number.
 * §7: the landing carries none at all -- "nothing here is a number".
 *
 * Measured 2026-09-11, Hero.tsx rendered at 44px, which is the display step.
 * Meter.tsx:26-34 meanwhile declines to render a 44px figure on that screen,
 * citing §7, because "a 44px figure in LiveProof would outrank the headline it
 * is supposed to support" -- a precaution that is only coherent if the
 * headline is not itself at 44px. The component was protecting a rule the
 * hero broke.
 */
const DISPLAY_ELEMENTS: Record<string, number> = {
  '/': 0,
  '/setup': 0,
  '/accounts': 0,
  // The dashboard's row is added in Task 7, with the change that earns it.
}

for (const [route, allowed] of Object.entries(DISPLAY_ELEMENTS)) {
  test(`${route} renders ${allowed} element(s) at the display step`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const count = await page.evaluate(() => {
      const display = getComputedStyle(document.documentElement)
        .getPropertyValue('--t-display').trim()
      let n = 0
      for (const el of document.querySelectorAll('*')) {
        if (!el.firstChild || el.firstChild.nodeType !== 3) continue
        if (!el.textContent?.trim()) continue
        if (getComputedStyle(el).fontSize === display) n++
      }
      return n
    })
    expect(count).toBe(allowed)
  })
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run from `/Users/vanhuy/Desktop/celo`: `pnpm -F @leash/app test:e2e -- faces.spec.ts`
Expected: `/` FAILS with "expected 1 to be 0".

The dashboard entry is deliberately **not** in `DISPLAY_ELEMENTS` yet. The
mainnet account is paused, so it renders no display element at all — which is
Task 7's defect, not this one, and a plan that commits a known-red test
teaches the next reader that red is normal here. Task 7 adds its row.

- [ ] **Step 3: Move the hero to `--t-title`**

In `app/components/landing/Hero.tsx`, replace the `style` block:

```tsx
        style={{
          fontFamily: 'var(--mono)',
          // --t-title, not --t-display. §2 reserves the display step for a
          // number and §7 says this screen carries none: if a sentence can be
          // 44px, the dashboard's 44px figure stops meaning "this is the
          // number", which is the whole load that step carries. The step is
          // already responsive -- 30px, 36px from 640px up.
          fontSize: 'var(--t-title)',
          lineHeight: 'var(--t-title-line)',
          fontWeight: 600,
          color: 'var(--text)',
        }}
```

The `clamp()` goes with it: `--t-title` carries its own breakpoint in
`globals.css`, and a second responsive mechanism on the same element is how
two rules come to disagree.

- [ ] **Step 4: Run the spec again**

Run: `pnpm -F @leash/app test:e2e -- faces.spec.ts`
Expected: PASS, all routes.

- [ ] **Step 5: Record the decision in §7**

In `docs/design-system.md` §7, under **Landing — `/`**, append:

```markdown
**The hero was at `--t-display` until 2026-09-11.** `Hero.tsx` set
`clamp(2.25rem, 8vw, var(--t-display))`, which measures 44px on a desktop —
the display step, on the screen this section says carries none. `Meter.tsx`
had meanwhile been written to *avoid* a 44px figure here, citing this
paragraph, so the component was protecting a rule the hero broke. The hero is
`--t-title` now, and `e2e/faces.spec.ts` asserts the count per route rather
than trusting either of them.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components/landing/Hero.tsx app/e2e/faces.spec.ts docs/design-system.md
git commit -m "fix(app): the hero wore the step reserved for the one number on screen"
```

---

### Task 7: The dashboard shows a figure in all five states

**Files:**
- Modify: `app/components/Meter.tsx:87-117`
- Modify: `app/lib/meter.ts` (add `bandFigure`)
- Test: `app/test/meter.test.ts`
- Modify: `docs/design-system.md` §7 (Dashboard)

**Interfaces:**
- Consumes: `SpendBand` and `refusalThreshold` from `lib/meter.ts`.
- Produces: `export function bandFigure(band: SpendBand): bigint | null` — the amount to render at the display step, or `null` when the chain has not been read yet (`loading`). Consumed only by `Meter.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `app/test/meter.test.ts`:

```ts
describe('bandFigure', () => {
  /**
   * The dashboard's dominant element is the refusal threshold (§7), and until
   * 2026-09-11 it rendered only for `ceiling`. In the other four bands the
   * meter showed a sentence at --t-label -- 11px, uppercase -- so the
   * hierarchy inverted exactly when something was wrong, at the one moment an
   * owner most needs a number.
   */
  it('is zero for every band that refuses a spend', () => {
    expect(bandFigure({ kind: 'paused' })).toBe(0n)
    expect(bandFigure({ kind: 'unfunded' })).toBe(0n)
    expect(bandFigure({ kind: 'exhausted' })).toBe(0n)
  })

  /**
   * §5: "not observed" is not "failed". A 0.00 during a read would be an
   * assertion about the chain that nobody has made, so loading has no figure
   * and Stat renders its em dash.
   */
  it('is null while the chain has not been read', () => {
    expect(bandFigure({ kind: 'loading' })).toBeNull()
  })

  it('is the ceiling amount when a spend is possible', () => {
    expect(bandFigure({
      kind: 'ceiling', amount: 250000n, limitedBy: 'balance',
      restrictedToApprovedPayees: false,
    })).toBe(250000n)
  })
})
```

Add `bandFigure` to the existing import from `../lib/meter.js` at the top of
the file.

- [ ] **Step 2: Run it to make sure it fails**

Run from `/Users/vanhuy/Desktop/celo/app`: `npx vitest run test/meter.test.ts`
Expected: FAIL with "bandFigure is not a function".

- [ ] **Step 3: Implement it**

Append to `app/lib/meter.ts`:

```ts
/**
 * The figure the dashboard renders at --t-display, for every band.
 *
 * §7 names the refusal threshold as the dashboard's dominant element, and it
 * was rendered for `ceiling` alone. In the other four bands the screen had no
 * dominant element at all: the largest thing on it was the status headline
 * and the meter said its piece at 11px. The threshold in those bands is not
 * unknown, it is zero -- so it is stated.
 *
 * `loading` is the exception and the reason this returns a nullable rather
 * than a bigint: zeroes are not observations (§5), and a 0.00 drawn while the
 * first read is in flight is a claim about the chain that nobody has made.
 */
export function bandFigure(band: SpendBand): bigint | null {
  if (band.kind === 'loading') return null
  if (band.kind === 'ceiling') return band.amount
  return 0n
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run test/meter.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the figure in every band**

In `app/components/Meter.tsx`, replace the `{band.kind === 'ceiling' && (…)}`
block with one that always renders. Import `bandFigure` alongside
`bandSentence`, `meterState` and `spendBand`.

```tsx
      {/* The figure is present in all five bands; only the clause under it
          changes. It used to render for `ceiling` alone, which meant the
          screen lost its dominant element in the four states where something
          was wrong -- the same shape of defect as the §4 badge drawn in the
          colour behind it. docs/design-system.md §7. */}
      <div className="mb-3" role="status" aria-atomic="true">
        <Stat
          label="Maximum next direct payment"
          value={figure === null
            ? `— ${symbol}`
            : `${formatDisplayAmount(figure, decimals)} ${symbol}`}
          size={dominant ? 'display' : 'data'}
          tone={figure === 0n ? 'bad' : 'normal'}
        />
        <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
          {band.kind === 'ceiling'
            ? <>limited by the {band.limitedBy}
                {band.restrictedToApprovedPayees && ' · approved recipients only'}</>
            : bandSentence(band, symbol)}
        </p>
      </div>
```

Above the `return`, add:

```tsx
  const figure = bandFigure(band)
```

The four `bandSentence` strings are §5's state vocabulary and are not to be
reworded. `Stat` already accepts `tone` (`components/ui/Stat.tsx:14`), which
paints the value `--bad` — 4.71:1 on `--panel`, so the ground rule holds.

- [ ] **Step 6: Delete the now-dead label**

The `bandSentence` call that rendered at `--t-label` below the meter (the
`{band.kind !== 'ceiling' && <Label>…</Label>}` block around `Meter.tsx:176`)
now says the same sentence twice. Remove the `Label` copy, keeping the one in
the paragraph above.

- [ ] **Step 7: Claim the dashboard's display element**

In `app/e2e/faces.spec.ts`, add the row Task 6 deferred:

```ts
  '/a/0xA73DB76f20c5ede3ABE883565D22905760F83982': 1,
```

The account is paused on mainnet, so this asserts exactly what this task
changed: the figure is there in a refusing state, and there is still only one
of it.

- [ ] **Step 8: Run the suites**

Run: `npx vitest run`
Expected: PASS. Then from `/Users/vanhuy/Desktop/celo`:
`pnpm -F @leash/app test:e2e`
Expected: PASS, all routes.

- [ ] **Step 9: Record it in §7**

In `docs/design-system.md` §7, under **Dashboard**, append:

```markdown
**In all five bands, not one.** Until 2026-09-11 the figure rendered only for
`ceiling`; in `paused`, `unfunded` and `exhausted` the meter said its piece at
`--t-label` and the screen had no dominant element at all. The hierarchy
inverted exactly when something was wrong. The threshold in those three bands
is not unknown, it is zero, so it is stated — and `loading` shows an em dash,
because a 0.00 during a read is a claim about the chain nobody has made (§5).

This is also the meter's empty state. At zero balance the bar is a black track
with a cap line at the far right and no fill, which reads as broken; a
`0.00 USDC` above it with a sentence naming why reads as zero. **The empty
state needed a number, not an illustration.**
```

- [ ] **Step 10: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/lib/meter.ts app/components/Meter.tsx app/test/meter.test.ts \
  app/e2e/faces.spec.ts docs/design-system.md
git commit -m "fix(app): the dashboard lost its dominant number whenever something was wrong"
```

---

### Task 8: One chrome, not four

**Files:**
- Create: `app/components/ui/AppHeader.tsx`
- Modify: `app/components/landing/SiteHeader.tsx`
- Modify: `app/app/a/[address]/page.tsx:241-264`
- Modify: `app/components/AccountsPage.tsx:188`
- Modify: `app/app/setup/page.tsx:641`
- Modify: `docs/design-system.md` §6
- Test: `app/e2e/faces.spec.ts` (no change expected; it must stay green)

**Interfaces:**
- Consumes: `BrandLink`, `PAGE`.
- Produces: `AppHeader` with props `{ band?: 'none' | 'danger'; nav?: React.ReactNode; actions?: React.ReactNode }`, default `band='none'`.

- [ ] **Step 1: Write the failing test**

Create `app/test/chrome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Four screens, four hand-built headers, and no primitive owning any of them
 * -- which is how /accounts came to show the bare word CELO in its top right
 * with nothing saying it is a network. §6's own rule: a screen needing
 * something none of the primitives provides is a new primitive, not a one-off.
 *
 * Shell and SiteFooter are the two legitimate exceptions. Shell is the frame
 * for the message screens and predates this; the footer's brand is a
 * different element in a different place.
 */
const ALLOWED = [
  'components/ui/AppHeader.tsx',
  'components/ui/Shell.tsx',
  'components/ui/BrandLink.tsx',
  'components/landing/SiteFooter.tsx',
]

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (entry.startsWith('.')) continue
      sources(rel, found)
    } else if (entry.endsWith('.tsx')) found.push(rel)
  }
  return found
}

describe('the chrome', () => {
  it('is built once, not per screen', () => {
    const offenders = [...sources('app'), ...sources('components')]
      .filter((f) => !ALLOWED.includes(f))
      .filter((f) => /BrandLink/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/chrome.test.ts`
Expected: FAIL listing `app/a/[address]/page.tsx`, `app/setup/page.tsx`,
`components/AccountsPage.tsx`, `components/landing/SiteHeader.tsx`.

- [ ] **Step 3: Write the primitive**

Create `app/components/ui/AppHeader.tsx`:

```tsx
import BrandLink from './BrandLink'
import { PAGE } from './page'

/**
 * The frame every screen wears above its content.
 *
 * Before this there were four: the landing's nav, the dashboard's full-bleed
 * band, the accounts page's brand-and-badge, and the wizard's bare wordmark.
 * §6 says a screen needing something none of the primitives provides is a
 * seventh primitive rather than a one-off, and four screens needing it is the
 * strongest case that rule will ever get.
 *
 * `band="danger"` is the paused dashboard. It puts --bad on an outer element
 * and PAGE on the content inside, so the ground spans the viewport while what
 * it holds stays on the page's column (§3), and it propagates `onBright` to
 * the brand so nothing downstream re-derives which ground it sits on -- the
 * arithmetic §4 exists to make impossible.
 */
export default function AppHeader({
  band = 'none', nav, actions,
}: {
  band?: 'none' | 'danger'
  nav?: React.ReactNode
  actions?: React.ReactNode
}) {
  const danger = band === 'danger'
  return (
    <header
      style={danger
        ? { background: 'var(--bad)' }
        : { borderBottom: '1px solid var(--line)' }}
    >
      <nav
        aria-label="Primary"
        className={`${PAGE} flex min-h-16 items-center justify-between gap-3`}
      >
        <BrandLink onBright={danger} />
        {nav && <div className="hidden items-center gap-6 md:flex">{nav}</div>}
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </nav>
    </header>
  )
}
```

`gap-6` and `gap-3` are §3 steps; the `gap-5` the landing used is not.

- [ ] **Step 4: Move all four screens onto it**

`SiteHeader.tsx` keeps its `NAV_ITEMS` and its two action links but renders
them *through* `AppHeader`, passing them as `nav` and `actions`. It no longer
imports `BrandLink` or `PAGE`.

`app/a/[address]/page.tsx:241-264` — replace the hand-built `<header>` with
`<AppHeader band={state.paused ? 'danger' : 'none'} actions={…} />`, moving
`AccountSwitcher`, `NetworkBadge` and `ConnectButton` into `actions`.
`NetworkBadge` keeps its `onDangerBand={state.paused}` prop.

`components/AccountsPage.tsx:188` — `<AppHeader actions={<NetworkBadge />} />`.
This is the fix for the bare `CELO`: it now sits in the same slot, next to the
same brand, as it does on the dashboard.

`app/setup/page.tsx:641` — `<AppHeader />`. The `large` wordmark goes: the
wizard is not the landing, and a second brand size on a screen with a `--t-title`
page title beneath it is a rank nobody assigned.

- [ ] **Step 5: Run the test to make sure it passes**

Run: `npx vitest run test/chrome.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suites**

Run: `npx vitest run` — expected PASS.
Then from `/Users/vanhuy/Desktop/celo`: `pnpm -F @leash/app test:e2e` — expected
PASS. `e2e/landing.spec.ts` asserts the primary journey links landing, setup
and the account directory; if a nav link moved, fix the component, not the test.

- [ ] **Step 7: Add the primitive to §6**

In `docs/design-system.md` §6, change "Six primitives" to "Seven primitives"
and add the row:

```markdown
| `AppHeader` | the frame above every screen's content. `band="danger"` is the paused dashboard; `nav` and `actions` are slots. |
```

Then append:

```markdown
**`AppHeader` replaces four hand-built headers.** The landing had a nav, the
dashboard a full-bleed band, `/accounts` a brand and a badge, and the wizard a
bare oversized wordmark — and because no primitive owned the chrome,
`/accounts` showed the word `CELO` in its top right with nothing saying it was
a network. `test/chrome.test.ts` asserts that nothing outside `AppHeader`,
`Shell` and the footer imports `BrandLink`.
```

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components/ui/AppHeader.tsx app/components/landing/SiteHeader.tsx \
  app/app/a/\[address\]/page.tsx app/components/AccountsPage.tsx \
  app/app/setup/page.tsx app/test/chrome.test.ts docs/design-system.md
git commit -m "fix(app): four screens each built their own header and one lost its label"
```

---

### Task 9: The phone

**Files:**
- Modify: `app/components/Meter.tsx:181`
- Modify: `app/app/a/[address]/page.tsx:402-408`
- Test: `app/e2e/reach.spec.ts`

**Interfaces:**
- Consumes: `PAGE`, `Panel`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `app/e2e/reach.spec.ts`:

```ts
/**
 * Measured at 375px on 2026-09-11: the meter's three stats were laid out
 * `grid-cols-2`, so the third sat alone on its own row and its 11px .16em
 * label wrapped onto two lines. Three stats go in one column on a phone.
 */
test('the meter stacks its three stats in one column on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/a/0xA73DB76f20c5ede3ABE883565D22905760F83982')
  await page.waitForLoadState('networkidle')
  const lefts = await page.locator('[data-testid="meter-stat"]').evaluateAll(
    (els) => els.map((el) => Math.round(el.getBoundingClientRect().left)),
  )
  expect(lefts.length).toBe(3)
  expect(new Set(lefts).size, `stat left edges: ${lefts.join(', ')}`).toBe(1)
})

/**
 * "Recent activity" was the one section heading rendered outside its panel.
 * At 375px it started at the page gutter while the panel's content started
 * 24px further in, and the misalignment was plainly visible.
 */
test('every section heading aligns with the content it titles', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/a/0xA73DB76f20c5ede3ABE883565D22905760F83982')
  await page.waitForLoadState('networkidle')
  const heading = await page.getByRole('heading', { name: 'Recent activity' })
    .boundingBox()
  const feed = await page.locator('[data-testid="feed-body"]').boundingBox()
  expect(heading).not.toBeNull()
  expect(feed).not.toBeNull()
  expect(Math.round(heading!.x)).toBe(Math.round(feed!.x))
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run from `/Users/vanhuy/Desktop/celo`: `pnpm -F @leash/app test:e2e -- reach.spec.ts`
Expected: FAIL on both — the first because the testids do not exist yet, the
second for the same reason. Add `data-testid="meter-stat"` to each of the
three `<Stat>` wrappers in `Meter.tsx` and `data-testid="feed-body"` to the
`Feed` container, then re-run; expected FAIL on the assertions themselves
(three different left edges; two different x values).

- [ ] **Step 3: Stack the stats and fix the gap**

In `app/components/Meter.tsx:181`, change:
```tsx
      <div className="grid grid-cols-2 gap-5 mt-4 sm:grid-cols-3">
```
to:
```tsx
      {/* One column below 640px. grid-cols-2 left the third stat alone on its
          own row with its 11px .16em label wrapped onto two lines. gap-5 and
          mt-4 were both off §3's scale. */}
      <div className="grid gap-3 mt-6 sm:grid-cols-3">
```

- [ ] **Step 4: Give `Feed` one frame, then put the heading in it**

`Feed` cannot simply receive the heading: it has five `return` branches
(reading the chain, no policy set, loading, the failed-scan case, and the
rows) and **each one builds its own `<Panel className="p-6">`**. A heading
passed in would have to be repeated five times, and the sixth branch someone
adds next year would forget it.

So extract the frame first. At the top of `Feed`'s body, above the branches:

```tsx
  // Five branches each built their own Panel, which is why the heading had to
  // live outside the component and ended up misaligned with the column it
  // titles. One frame, so a sixth branch cannot forget the heading.
  const Frame = ({ children }: { children: React.ReactNode }) => (
    <Panel className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <h2 style={{
          fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)',
          lineHeight: 'var(--t-heading-line)', fontWeight: 500,
        }}>
          Recent activity
        </h2>
        <Label>Last 24 hours</Label>
      </div>
      <div data-testid="feed-body">{children}</div>
    </Panel>
  )
```

Then change every `return <Panel className="p-6">…</Panel>` in `Feed` to
`return <Frame>…</Frame>`, dropping the inner `Panel`.

The `lineHeight` and `fontWeight` this `<h2>` now carries are the two
properties `app/a/[address]/page.tsx:404` omitted — the stray `18px mono 600`
in the spec's face table.

In `app/app/a/[address]/page.tsx:402-408`, delete the `<section>`'s heading
row entirely, leaving `<Feed … />` as the section's only child.

- [ ] **Step 5: Run the specs to make sure they pass**

Run: `pnpm -F @leash/app test:e2e -- reach.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run everything**

Run: `npx vitest run` from `app/`, then `pnpm -F @leash/app test:e2e` from the
repo root. Both expected PASS. Lower any `CEILING` entry in `faces.spec.ts`
that the `<h2>` fix reduced.

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components/Meter.tsx app/app/a/\[address\]/page.tsx app/e2e/reach.spec.ts app/e2e/faces.spec.ts
git commit -m "fix(app): the meter's third stat sat alone and a heading missed its column"
```

---

### Task 10: Pay the padding and focus-ring debt

**Files:**
- Modify: the 15 files in `OFF_SCALE_PAD_DEBT` and the 7 in `HAND_ROLLED_RING_DEBT`
- Modify: `app/test/scaleUsage.test.ts`

**Interfaces:**
- Consumes: `.focus-ring` / `.focus-ring-inset` from `globals.css`; the four padding steps from §14.
- Produces: nothing new.

- [ ] **Step 1: List the debt**

Run from `/Users/vanhuy/Desktop/celo/app`:
```bash
npx vitest run test/scaleUsage.test.ts --reporter=verbose
```
Then read `OFF_SCALE_PAD_DEBT` (38 across 15 files) and
`HAND_ROLLED_RING_DEBT` (11 across 7 files) in `test/scaleUsage.test.ts`.

- [ ] **Step 2: Replace the hand-written rings**

At each of the 11 sites, delete
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`
from `className` and add `focus-ring` in its place. The site at
`components/landing/SecurityBoundary.tsx:67` uses
`focus-visible:outline-offset-[-2px]` and takes `focus-ring-inset` instead.
**Keep every `outlineColor`** — the colour is per-variant by §11 and the class
only defaults to `currentColor`.

- [ ] **Step 3: Move the padding onto the four steps**

§14: 2, 3, 6, 12, and `4` on the horizontal axis only. `p-4` on a panel
becomes `p-6`; `p-5` and `pt-5` become `p-6`/`pt-6`; `pt-4`/`py-8`/`py-10`/
`py-14`/`pt-14`/`pt-20`/`pb-12`/`pb-16` become the nearest step that does not
change which rank the block reads as — when in doubt on a full-bleed landing
band, `py-12`. `pr-16` is an inset for an absolutely-positioned `USDC` suffix
in the wizard and is a horizontal value, so it stays.

- [ ] **Step 4: Lower both ratchets**

Run: `npx vitest run test/scaleUsage.test.ts`
Expected: FAIL with "cleaned up without lowering the debt list", naming every
file and its new count. Lower each entry to the number printed and delete
entries that reached 0.

- [ ] **Step 5: Run everything**

Run: `npx vitest run` from `app/`, then `pnpm -F @leash/app test:e2e` from the
repo root, then `npx tsc --noEmit` from `app/`. All three expected clean.

- [ ] **Step 6: Verify the rings still draw in a real browser**

Run `pnpm run start` from `app/`, then tab through the landing page and
confirm the focus ring is 2px solid at 2px offset on each control. A class can
be present and beaten by a more specific rule — this is the same reason
`e2e/reach.spec.ts` measures the rendered box.

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/components app/app app/test/scaleUsage.test.ts
git commit -m "fix(app): the padding scale and the focus ring were rules the code had not read"
```

---

## Closing check, after Task 10

Run all three suites and record the numbers in `docs/RESUME.md`:

```bash
cd /Users/vanhuy/Desktop/celo/app && npx vitest run && npx tsc --noEmit
cd /Users/vanhuy/Desktop/celo && pnpm -F @leash/app test:e2e
```

Then re-take the screenshots the spec was measured from — `/`, `/setup`,
`/accounts` and the paused mainnet account at 1280px and 375px — and read
them. The spec deliberately left one question open: whether the landing's
seven sections, each built as eyebrow + title + paragraph + card grid, still
read as monotonous once the type ranks are right. That is a judgement to make
with fresh screenshots, not a task to schedule in advance.
