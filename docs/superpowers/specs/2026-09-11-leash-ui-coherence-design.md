# Leash — UI coherence: closing the gap between the system and the screen

**Date:** 2026-09-11
**Status:** design, ready to plan
**Supersedes nothing.** Extends `docs/design-system.md` §2, §7, §10 and adds §16.

---

## 1. The problem, measured

`docs/design-system.md` defines six type steps. The landing page, built and
measured in Chromium at 1280px on 2026-09-11, renders **17 distinct type faces
across 8 distinct sizes**:

```
14px sans 400  ×35    -- --t-body                        legal
11px mono 400  ×26    -- --t-label                       legal
12px mono 400  ×13    -- not on the scale
12px sans 400  ×12    -- not on the scale
14px mono 600  ×9     -- not on the scale
13px mono 400  ×8     -- --t-data                        legal
14px sans 600  ×7     -- not on the scale
18px mono 500  ×6     -- --t-heading                     legal
14px mono 400  ×4     -- not on the scale
13px mono 700  ×3     -- not on the scale
11px mono 700  ×2     -- not on the scale
36px mono 600  ×2     -- --t-title                       legal
16px sans 400  ×2     -- browser default, not on the scale
12px mono 600  ×2     -- not on the scale
44px mono 600  ×1     -- --t-display, on a screen §7 says has none
13px sans 400  ×1     -- not on the scale
18px mono 600  ×1     -- --t-heading at the wrong weight
```

Six steps in the document, seventeen faces on the screen. **That gap is what
reads as unprofessional**, and no amount of new token work closes it.

`test/scaleUsage.test.ts` cannot see this. It counts *class names*
(`text-sm`, `text-xs`); the table above counts *what the eye receives* after
inline styles, font-weight utilities and family switches have been applied.
Two different instruments, and only the second measures the defect.

### A measurement in §10 that was wrong

§10 was written on 2026-09-11 and claims three radii, "measured in place". The
measurement grepped `rounded*` classes and `border-radius` in CSS. It **did not
count inline numeric `borderRadius`**, and there are four:

| Site | Value |
|---|---|
| `components/ui/Panel.tsx:14` | `8` |
| `app/a/[address]/page.tsx:317` (meter card) | `8` |
| `app/setup/page.tsx:84` (`STATUS_BOX`) | `6` |
| `components/McpHandoff.tsx:81` (code well) | `4` |

So the app has **five** radii, not three, and the most-used container in the
product — `Panel` — is at a value §10 says does not exist. §10 is corrected
here rather than defended. This is §9's own rule applied to §9's own author:
count it, do not recall it.

---

## 2. Decisions

### 2.1 Radius: four, one per kind of object

§10 said three and no fourth. The measurement says the app needs four, and the
fourth has a real job: **a surface is not a control.**

| Token | Value | For |
|---|---|---|
| `--r-surface` | 8px | a panel, a card, a band — something the layout sits *on* |
| `--r-box` | 4px | a control or a well — `Button`, `ActionLink`, `.field`, a code block |
| `--r-mark` | 2px | a mark laid over text — a focus ring on an inline link, the wordmark |
| `--r-dot` | 9999px | a state dot, and only ever that |

`STATUS_BOX`'s 6px is the only genuine stray and becomes `--r-box`: it is a
`--well` box holding a choice, which is a control.

§10's principle survives intact — the corner says what kind of thing it is —
and gains the distinction it was missing. What it loses is the sentence "there
is no fourth", which was asserting a count nobody had finished measuring.

### 2.2 Type: a seventh step, and why §2's own rule demands it

§2 says: *"Six steps. Each has one job; a seventh means one of these is doing
two."*

Apply that test to the evidence. `text-sm font-semibold` — 14px sans 600 —
appears at **16 call sites**, every one of them the title of a block sitting
*below* a section title: landing cards, wizard sub-steps, the claims in
`SecurityBoundary`, the two wallet boxes in `AgentPanel`. The scale offers
nothing between `--t-heading` (18px) and `--t-body` (14px), so sixteen call
sites invented the same rank independently.

Putting them on `--t-heading` makes a card title rank equal to the section
title above it, which destroys the hierarchy §2 exists to build. Putting them
on `--t-label` is what §2 already rejected: *"Section.tsx rendered every
landing heading through Label, which is 11px dim uppercase."*

So `--t-heading` **is** doing two jobs — section title and sub-block title —
and by §2's own test that is what a seventh step is for.

| Token | Size / line-height | Face | Used for |
|---|---|---|---|
| `--t-subhead` | 14px / 1.35 | **mono 500** | the title of a block below a section title |

**It shares 14px with `--t-body` deliberately.** The scale now has seven steps
and six sizes, and the pair is separated by family, not size — which is not a
special case but §1's central rule made structural: *mono is what a reader
looks at; sans is what they read.* A card title is looked at. It is currently
sans, which is a §1 violation on all sixteen sites; mono 500 at the same size
as the sans 400 body under it reads as a different rank immediately, because
JetBrains Mono and the system sans share no letterforms.

A seventh step is the one moment §2 warns about, so it carries the burden of
proof: sixteen sites, one job, no existing step that fits.

### 2.3 `text-xs` is not a step and never was

27 call sites render 12px. **12px is on no scale in this project.** Each is a
decision between `--t-data` (13px) and `--t-label` (11px), and §2 already says
so: *"each `text-xs` is a decision between 13px and 11px that wants a person
looking at the screen."*

The rule for making that decision, so it is not re-argued 27 times:

> **A number, an address or a transaction hash is `--t-data`. A name for
> something else on the screen is `--t-label`.**

### 2.4 The hero drops to `--t-title`

§7: *"Landing — Dominant: the headline, at `--t-title`. No `--t-display` on
this screen: nothing here is a number."*

`components/landing/Hero.tsx:15` sets
`fontSize: 'clamp(2.25rem, 8vw, var(--t-display))'`, which measures **44px at
1280px** — the display step, on the screen §7 says carries none.

The code wins arguments about facts; the document wins arguments about rules,
and this is a rule. Two reasons to move the code:

1. §2: *"`--t-display` … is only ever a number."* The hero is a sentence. If a
   sentence can be 44px, the dashboard's 44px figure stops meaning "this is
   the number" — which is the entire load `--t-display` carries.
2. `components/Meter.tsx:26-34` declines to render a 44px figure on the
   landing, citing §7, *"a 44px figure in LiveProof would outrank the headline
   it is supposed to support."* That precaution is only coherent if the
   headline is not itself at 44px. Today the component is protecting a rule
   the hero breaks.

The hero becomes `--t-title`: 30px on a phone, 36px from 640px up. It is a
visible shrink from 44px on desktop and it is the correct one.

### 2.5 The dashboard has a dominant figure in all five states, not one

`Meter.tsx:93` gates the `--t-display` figure on `band.kind === 'ceiling'`.
There are five bands: `loading`, `paused`, `unfunded`, `exhausted`, `ceiling`.

In the other four, the meter renders only `bandSentence` at `--t-label` —
11px, uppercase, `.16em`. Measured on the paused mainnet account
`0xA73D…3982`, the dashboard has **no `--t-display` anywhere**: §7's dominant
element is absent, and the screen's largest text is the status headline.

So the hierarchy inverts exactly when something is wrong. The one moment an
owner most needs a number is the one moment the screen does not show one — the
same shape of defect as the invisible "Wrong network" badge in §4.

**The figure is always present. Only the clause under it changes.**

| Band | Figure | Clause |
|---|---|---|
| `loading` | `— USDC` | Reading the chain… |
| `paused` | `0.00 USDC` | Paused by the owner — every spend is refused |
| `unfunded` | `0.00 USDC` | This account holds no USDC — every spend will fail |
| `exhausted` | `0.00 USDC` | The allowance is spent — resets at UTC midnight |
| `ceiling` | the threshold | limited by the {balance / daily allowance / per-transaction cap} |

`loading` is an em dash, not `0.00`, and this is not cosmetic: §5's first rule
is that **"not observed" is not "failed"**, and `0.00` during a read would be
an assertion about the chain that nobody has made. `Stat` already renders
`— ${symbol}` while loading.

This resolves the meter's empty state at the same time. At zero balance the
bar is a black track with a yellow cap line at the far right and no fill,
which reads as broken; a `0.00 USDC` at 44px above it, with a sentence naming
why, reads as zero. **The empty state needs a number, not an illustration.**

### 2.6 One chrome, not four

Four screens, four different headers, and no primitive owns any of them:

| Screen | Chrome | Source |
|---|---|---|
| `/` | brand + 3 nav links + My accounts + Create account, `--line` rule | `components/landing/SiteHeader.tsx` |
| `/a/[address]` | full-bleed band (`--bad` when paused) + brand + switcher + network + connect | `app/a/[address]/page.tsx:241-264` |
| `/accounts` | brand + network badge only | `components/AccountsPage.tsx:188` |
| `/setup` | `BrandLink large`, nothing else | `app/setup/page.tsx:641` |
| 404 / error / bad address | brand + title + one way out | `components/ui/Shell.tsx` |

`Shell` exists but only frames the message screens. §6 lists six primitives
and none of them is the chrome, so each screen built its own — which is how
`/accounts` ends up showing the bare word `CELO` in the top right with nothing
saying it is a network.

**A seventh primitive: `AppHeader`.** §6's own rule applies — *"If a screen
needs something none of them provides, that is a seventh primitive, not a
one-off"* — and four screens needing it is the strongest possible case.

```
AppHeader
  band?: 'none' | 'danger'      the full-bleed --bad ground, dashboard-only
  nav?: ReactNode               the landing's three links
  actions?: ReactNode           switcher, network badge, connect, create
```

The brand is always present and always an escape route (`BrandLink`'s own
docstring). `onBright` propagates from `band`, so nothing downstream has to
re-derive which ground it sits on — the arithmetic §4 was written to make
impossible.

### 2.7 Phone

Measured at 375px on the paused account:

- **`Meter.tsx:181`** — `grid grid-cols-2 gap-5 mt-4 sm:grid-cols-3` puts
  three stats in a 2+1 layout. The orphan is "Per-transaction cap", whose
  11px `.16em` label wraps onto two lines. Three stats go in one column below
  640px. `gap-5` is also off §3's scale and becomes `gap-3`.
- **`app/a/[address]/page.tsx:402-408`** — "Recent activity" is the only
  section heading rendered *outside* its panel. At 375px it starts at the page
  gutter while the panel's content starts 24px further in, and the misalignment
  is plainly visible. It moves inside the panel, matching every other block.
  Its `<h2>` also sets `--t-heading` without `lineHeight` or `fontWeight`,
  which is the stray `18px mono 600` in §1's table.

### 2.8 Debt

Carried forward unchanged from the ratchets, to be paid where these tasks
already touch the file: 38 off-scale paddings, 11 hand-written focus rings.
`app/setup/page.tsx` holds 53 raw type sizes, 43 off-scale margins and 13
off-scale paddings — three ratchets pointing at one file.

---

## 3. What this explicitly does not do

- **No motion, gradients, shadows or hover effects.** §12 and §13 forbid them
  and the app's defect is not that it is too plain — it is that it says one
  thing in seventeen voices.
- **No light mode, no density scale, no iconography.** §15 leaves all three
  undecided and nothing here changes that.
- **No new colour.** The palette and the ground rule are untouched.
- **No restructuring of the landing's section rhythm.** Seven sections each
  built as eyebrow + title + paragraph + card grid is monotonous, and it is a
  separate argument from this one. Fixing the type ranks changes how that
  rhythm reads; whether it still needs breaking up is a judgement to make
  after, with fresh screenshots.

---

## 4. How this is verified

Every claim above came from a measurement, and each decision gets one:

| Decision | Instrument |
|---|---|
| 2.1 four radii | `test/surface.test.ts`, extended to catch inline numeric `borderRadius` |
| 2.2 seventh step | `test/type.test.ts` drift assertion, as for the other six |
| 2.3, 2.8 debt falls | `test/scaleUsage.test.ts` ratchets, lowered |
| 2.4, 2.5 hierarchy | a new Playwright spec counting **rendered** faces per page and asserting exactly one `--t-display` element per screen |
| 2.6 one chrome | `AppHeader` is the only component importing `BrandLink` outside `Shell` and the footer |
| 2.7 phone | existing `e2e/reach.spec.ts` pattern — measure the rendered box, not the class list |

The Playwright face-counter is the instrument this project did not have. It is
the only one that can see the defect in §1, because it measures the screen
rather than the source.
