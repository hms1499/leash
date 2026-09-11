# Leash — Design System

The rules the interface follows, and the measurements behind them.

This is a working reference, not a record of a meeting. Read it before changing
anything in `app/`. If a rule here is wrong, change the rule here first and the
code second, so the two never drift — the same discipline `tokens.ts` and
`globals.css` already keep with a test.

**Superseded:** spec §4.1, "Visual direction: Van Gogh". That palette was
dropped on 2026-09-04 and nothing replaced it, so for a day the direction
existed only in a comment. This file is the replacement.

---

## 1. Direction: a terminal, committed

The product's own thesis, from the spec: *every screen makes visible the line
the money does not cross.* The interface is the instrument that shows that
line, and it speaks in the register of the thing it is watching — a machine
spending money under a rule.

So: monospace, dense, high contrast, no ornament. The character comes from
precision, not decoration.

**Committed is the operative word.** Before this document the app was an
accidental terminal — mono in places, sans in others, one type size doing
thirty-nine jobs. That reads as unfinished rather than as a choice. A terminal
done deliberately, with a real scale and real spacing, is a different thing
from one arrived at by default.

**The one exception is prose.** Long-form explanation is set in the system
sans. Mono is for everything a reader *looks at* — headings, labels, numbers,
controls — and sans for what they *read*. The landing page has to persuade
someone skimming, and that is exactly where monospace costs most.

### What changed on 2026-09-11, and what did not

The direction was challenged directly: the interfaces people actually enjoy
using — a swap screen, say — feel *smooth*, and this one did not. Taking that
seriously meant separating the two things "terminal" had been carrying.

One is the register: mono, dense, precise, no ornament. That is load-bearing —
it is the product's own thesis, an instrument for watching a machine spend
money — and none of it moved.

The other was a set of numbers that had drifted into meaning "austere":
grounds a point or two off black, 8px and 4px corners, and no movement at all
because §12 had been written as a ceiling. Those were never the thesis. §4
lifted the grounds so a card reads as a card (8.2 points of L*, from 4.1),
§10 doubled the radii, and §12 spent both of its durations on the three states
a reader causes — a press, a disclosure, a control coming back to life — on
one easing curve that settles rather than stops.

What was refused, and why, is as much the direction as what was taken:

- **Animated digits.** Money changes in one frame. A counted-up figure shows a
  sequence of values that were never true, on a screen someone is watching
  while an agent spends real money (§12).
- **Ambient motion.** Nothing moves that the reader did not cause, so the one
  movement that matters — the meter — stays a signal (§12).
- **Shadows.** Re-measured after the lift: a black shadow at 45% buys 3.5
  points of L* where the ground step already buys 8.2, and nothing in this app
  sits above the page anyway (§13).
- **A hover that fills.** The lift made it possible and it is still refused: a
  ground says *what kind of surface this is*, and a control borrowing
  `--panel` claims for a moment to be a card (§4).

The test suite is what keeps that distinction honest. Every number above is
asserted, so the next person who wants a softer interface gets the parts that
are free and is stopped at the parts that are not.

---

## 2. Typography

### The problem this replaces

Measured 2026-09-05 across `app/`:

```
text-sm (14px)      39 uses      ← nearly everything
text-xs              3
text-lg              1
text-base            1
text-3xl / 4xl       2           ← the hero, and nowhere else
0.6875rem inline     2
```

Two effective sizes: 14px, and a hero. `Section.tsx` rendered every landing
heading — "The difference", "How it works", "What your agent gets", "Proven on
Celo mainnet" — through `Label`, which is 11px dim uppercase. The same
treatment as the label on a text input.

That leaves a cliff from 36px to 11px with nothing between. An eye given no
middle rank has nowhere to land, which is precisely the complaint that started
this work: *you cannot tell what to look at first.*

### The scale

Seven steps and six sizes. Each has one job; an eighth means one of these is
doing two.

`--t-subhead` is the seventh, and it arrived by applying that rule to the
evidence rather than by wanting another size. Measured 2026-09-11,
`text-sm font-semibold` — 14px sans 600 — appeared at **16 call sites**, every
one of them the title of a block below a section title: landing cards, wizard
sub-steps, the claims in `SecurityBoundary`, the two wallet boxes in
`AgentPanel`. The scale offered nothing between `--t-heading` (18px) and
`--t-body` (14px), so sixteen call sites invented the same rank independently.

Putting them on `--t-heading` ranks a card title equal to the section title
above it, which destroys the hierarchy this section exists to build. Putting
them on `--t-label` is what this section already rejected. So `--t-heading`
was doing two jobs — section title *and* sub-block title — and by the rule's
own test, that is what a seventh step is for.

It shares 14px with `--t-body` and is separated from it by family, not size.
That is §1 made structural: mono is what a reader looks at, sans is what they
read, and a card title is looked at. All 16 sites were sans, so all 16 were §1
violations before they were off-scale. `test/type.test.ts` asserts the tie is
this pair and no other.

| Token | Size / line-height | Face | Used for |
|---|---|---|---|
| `--t-display` | 44px / 1.0 | mono 600 | **one** number per screen |
| `--t-title` | 30px / 1.2, **36px ≥640px** | mono 600 | hero headline, page title |
| `--t-heading` | 18px / 1.35 | mono 500 | section titles, wizard steps |
| `--t-subhead` | 14px / 1.35 | mono 500 | the title of a block below a section title |
| `--t-body` | 14px / 1.65 | **sans** | prose |
| `--t-data` | 13px / 1.55 | mono | numbers, addresses, feed rows |
| `--t-label` | 11px / 1.3, `.16em`, uppercase | mono | field labels, badges |

`--t-heading` is the rank that was missing. Moving `Section` and the wizard's
steps onto it rebuilds the whole hierarchy without touching a single colour.

### A face is a size, a family and a weight

The table above always named all three. Only the size was ever enforced, and
measured in Chromium on 2026-09-11 the app drew **eight faces the scale does
not define** — with every source test green, because they read sizes:

```
36px mono 400   /accounts' page title
36px mono 500   the wizard's page title
36px mono 600   the landing's                 ← one rank, three faces
18px mono 600   FinalCta, beside six 18px mono 500 headings
14px mono 400   a step number, and <code> in the wizard's prose
13px sans 400   the header and footer navs -- --t-data's size, sans family
16px mono 400   Address, inheriting the browser's default
16px sans 400   two flow arrows that set no size at all
```

Three of one rank is the case worth keeping in mind: nothing could see it,
because all three were 36 pixels.

`lib/type.ts` carries `face` and `weight` for every step now, and
`e2e/faces.spec.ts` asserts the stronger thing a count could never say —
**every face a route renders is one of the declared steps.** A ceiling stops
drift growing; this stops it existing.

The style constants in `components/ui/prose.ts` are how a call site gets a
whole face rather than a size: `TITLE`, `HEADING`, `SUBHEAD`, `PROSE`, `DATA`.
A component that writes `fontSize: 'var(--t-title)'` and stops has chosen a
size and left the weight to whoever reads it next.

### Three faces that are not steps

Each is a decision, listed in `DECLARED_EXCEPTIONS` in `lib/type.ts`, and that
list is the only way to have one:

| Face | Why |
|---|---|
| `11px mono 700` | the wordmark — six letters at 11px need the weight to hold `.26em` open |
| `13px mono 700` | the `primary` and `stop` controls — the one action you are meant to press, and the one you are meant to find in a hurry |
| `14px sans 700` | `<strong>` inside prose — semantic emphasis, in the family and size the prose already has |

`<code>` is deliberately **not** on that list. It was drawing 14px mono 400,
which is no step: the browser supplies the family and inherits the size, and
the pair lands between `--t-subhead` and `--t-data`. `globals.css` puts it on
`--t-data`, because inline code is looked at rather than read (§1).

### What the scale actually replaced, measured again on 2026-09-10

Less than this section claimed. The six steps were introduced and then applied
where the work happened to reach; the rest of the app kept the two sizes it
had. Counted across `app/` and `components/`:

```
text-sm      93          ← the 39 above, grown
text-xs      27          ← never a step at all; 12px is not on this scale
             ---
             120 raw sizes, 53 of them in app/setup/page.tsx
```

`test/type.test.ts` stayed green through all of it, because it asserts that
`globals.css` matches `lib/type.ts` — that the tokens agree with each other,
not that anything uses them.

`test/scaleUsage.test.ts` is the missing half. It counts the raw sizes per
file against a recorded figure and fails when one grows, when a file appears
that is not on the list, or when a file is cleaned up without its number being
lowered. The debt is therefore visible, countable, and can only shrink.

`e2e/faces.spec.ts` is the half that was missing from *both*. The two vitest
suites read source: one checks the tokens agree with each other, the other
counts class names. Neither can see a face produced by an inline style, a
font-weight utility or a family switch — and measured in Chromium on
2026-09-11 the landing page rendered **17 distinct faces** while every source
test was green. It counts what the eye receives, per route, and ratchets down:
17 on the landing, 9 on the wizard, 6 on the account list, 12 on the
dashboard.

It is a ratchet on purpose. 120 call sites is not a mechanical substitution:
`text-sm` on prose is `--t-body`, on a feed row it is `--t-data`, and each
`text-xs` is a decision between 13px and 11px that wants a person looking at
the screen.

### Rules

### `text-xs` was never a step, and what replaced it

12px appeared at 27 call sites and is on no scale in this project. §2 said
each one "is a decision between 13px and 11px that wants a person looking at
the screen". Looking at them on 2026-09-11, there were **three** answers, not
two, and the third is the one that made the rule work:

> **A sentence a reader reads is `--t-body`, dimmed.** A number, an address,
> a hash or a block of code is `--t-data`. A name for something else on the
> screen — a badge, a state, the label on a row — is `--t-label`.

Most of the 27 were supporting prose: "Best for agents with changing payees",
"Enabling for the first time requires two wallet confirmations". Setting a
sentence in the mono data face is a category error, and setting it in the
uppercase tracked label step is worse. **Supporting prose is not a smaller
size; it is `--dim` at the same size.** The scale does not need a small-prose
step and should not get one.

Two sites refused the label step deliberately and say so in a comment: the
header nav and the footer nav name destinations, which is the label step's
job, but `--t-label` is uppercase and tracked `.16em`, and a nav set that way
shouts over the wordmark beside it. They are `--t-data`.

- **`--t-display` appears at most once per screen.** Two numbers at the same size means
  neither is the number. Choosing which one is a design decision per screen —
  see §7.
- **Money is always mono and always `tabular-nums`.** The `.num` class already
  does this; it is now a rule rather than a habit, because a figure that
  changes live must not reflow (`CLAUDE.md`).
- **A step that names a weight is not optional.** `--t-heading` is mono 500,
  and twelve call sites set the size and left the weight to the browser — so
  the app drew 18px mono 400 and 18px mono 500 side by side and neither was
  wrong on purpose. `HEADING` in `components/ui/prose.ts` holds it now, beside
  `PROSE` and `SUBHEAD`, for the reason that file already gives: four property
  values about to be typed out by hand in a dozen components is how the app
  came to have two type sizes doing six jobs. `e2e/faces.spec.ts` counts a
  weight difference as a separate face, because a reader sees one.
- **Prose lines cap at ~68 characters.** Wider is unreadable; the mono
  exception in §1 does not exempt sans from measure.
- **`--t-title` keeps its responsive step.** The hero is `text-3xl sm:text-4xl`
  today — 30px, 36px from 640px up. A flat 30px would shrink it on desktop,
  which is a regression dressed as a system.
- **A link says where it goes; it does not point.** The four labels reading
  "… →" were decoration appended to text that already said what it did, and
  nothing here ever chose them. `↗` stays: on an external link it is the
  affordance for "opens on Celoscan", and on the address it is the whole link.
- **Letter-spacing has two values, not three.** `.16em` on `--t-label`, `.26em`
  on the wordmark. The stray `0.1em` on the stop button goes.
- **The wordmark is the one declared exception to the scale's weights.** It is
  `--t-label` at **700** with `.26em`, not the step's own 400 — six letters at
  11px need the weight to hold the tracking open. `BrandLink` is the only
  place this is allowed, and `e2e/faces.spec.ts` counts it as its own face on
  every route so it cannot spread.

### The font

JetBrains Mono, self-hosted through `next/font` — not fetched from Google at
runtime, which is faster and leaks no referrer.

Apple's SF Mono was considered and rejected as the *specified* face. It is
already reached on Apple devices through `ui-monospace`, and it looks excellent
there, but Apple's licence does not permit shipping it as a webfont. A judge
opening the deployed URL on Windows would get Consolas, and in a design where
everything is mono that substitution is not subtle. What is designed should be
what is seen.

System sans (`ui-sans-serif, system-ui, -apple-system, …`) carries prose. It
varies by platform by design: prose does not need to be identical everywhere,
only readable.

---

## 3. Spacing

### The problem this replaces

Nine steps in use, weighted toward the tightest:

```
mt-2 (8px)  ×26     p-4 ×21     mt-1 (4px) ×12     mt-3 ×9
6, 8, 10, 14, 16 — one or two uses each
```

14px text at 4–8px intervals is cramped, and the large steps appear only in
the hero, so the page has no rhythm.

### The scale

Four Tailwind steps, each with a fixed meaning. No new tokens — a second
spacing system fighting Tailwind's helps nobody.

| Step | px | Meaning |
|---|---|---|
| `2` | 8 | inside a single control |
| `3` | 12 | between related items |
| `6` | 24 | between blocks within a panel |
| `12` | 48 | between major sections |

Nothing else. `mt-1` and `mt-8/10/14/16` are removed.

**They were not.** Re-measured 2026-09-10: `mt-1` appears 17 times, `mt-4` 32,
`mt-5` 17, and `mt-8`/`mt-20` survive — 90 off-scale margins and gaps, 44 of
them in the wizard. `test/scaleUsage.test.ts` holds the same ratchet over
these that it holds over the type sizes.

That test watches margins, gaps and `space-y` only. Padding is left to a
person: `PAGE` is itself `px-4`, and the table above never claimed the four
steps governed padding — the `p-4 ×21` in the measurement below is a count of
the problem, not a rule about it.

### The page is one width

`PAGE` in `components/ui/page.ts` — `w-full max-w-5xl mx-auto px-4`, so 1024px
with a 16px gutter. Every screen uses it: landing, wizard, dashboard, and the
three message screens.

There was no rule here until 2026-09-05, and measured at a 1920px viewport the
app had four screens at three widths — 768px for the landing and the message
screens, 672px for the wizard, and **no constraint at all** on the dashboard.

That was not only untidy. `Meter` is rendered on the landing *and* the
dashboard, and it measured **702px on one and 1888px on the other**. At the
larger width its fill is a dot against the left edge and its cap line a dot
against the right, nearly two thousand pixels apart — and the relationship
between those two marks is the entire information content of the component.
§3.1 of the spec spends a rule on the 2px gap between them.

**That width was 768px until 2026-09-11, and the reason was in the wrong
place.** `Meter` is an SVG with `viewBox="0 0 600 14"`: it magnifies rather
than reflows, so the constraint was never "the page is 768px" but "the meter
is about 700px". Enforced at the page, one component's geometry also decided
the width of every card grid in the app — and the landing's three-up cards ran
their body text at **21 characters a line**. `Meter` carries `--meter-max`
itself now and the page is 1024. §16 has the measurements and the grid that
replaced the guesswork.

The gutter stays 16px: it is the edge of the viewport rather than a
relationship between two elements, and 24px gutters waste width on the phone
MiniPay runs on.

**A full-bleed band puts its background on an outer element and `PAGE` on the
content inside it.** The dashboard header and the meter's ground both do this,
so the band spans the viewport — which is what makes the paused state read as
red edge to edge — while what it holds stays on the page's column.

---

## 4. Colour

The palette itself does not change. What changes is that **grounds are now
named**, because they were not, and that omission cost a real bug.

### The five grounds

| Ground | Hex | L* | Where |
|---|---|---|---|
| `--bg` | `#12151B` | 6.7 | page |
| `--panel` | `#20262F` | 14.9 | `Panel`, the meter band |
| `--well` | `#0B0E12` | 3.9 | inputs, code blocks |
| `--bad` | `#DE7A72` | — | **the header band while paused** |
| `--celo` | `#FCFF52` | — | **the primary button** |

**The three dark grounds were lifted off black on 2026-09-11.** They had been
`#0B0D10` / `#14171C` / `#07090B`, and this section had measured them against
each other with `contrastRatio` — 1.03 to 1.11 — and concluded that a surface
could never be told from the page behind it. The ratio was right and the unit
was wrong: a contrast ratio is built for a glyph on a ground, and between two
dark neighbours it compresses to nothing. In **L***, the perceptual lightness
an eye actually uses on two adjacent fills, `--panel` stood 4.1 above `--bg`
and `--well` 1.2 below it. They stand at **8.2** and **2.8** now, and
`test/tokens.test.ts` holds a floor under both.

Two foregrounds had to move with them, which is the whole cost of the lift:
on the lighter panel `--bad` fell to 3.99 and `--line-control` to 2.77, both
under their bars. `--bad` went `#D0605B` → `#DE7A72` (5.17 on panel) and
`--line-control` `#626A73` → `#7B838E` (3.97). `--dim` was lifted with them,
`#8A9199` → `#959CA5`, for the same reason. The bright-ground rule improved as
a side effect: `--bg` on `--bad` was 4.79 and is 6.21.

The last two are the ones nobody had written down. The contrast test checked
`bg` and `panel` only, so a foreground could sit on a bright ground unchecked —
and one did.

### The rule

Measured again on 2026-09-11 after the lift, every foreground against every
ground:

```
                  bg  panel   well    bad   celo
--text         15.17  12.63  16.05   2.44   1.12
--dim           6.60   5.49   6.98   1.06   2.58
--celo         17.03  14.18  18.02   2.74   1.00
--ok            5.67   4.72   6.00   1.09   3.00
--bad           6.21   5.17   6.57   1.00   2.74
--bg            1.00   1.20   1.06   6.21  17.03
```

Two lines fall out of it, and they replace every argument about colour:

> **Dark grounds** (`--bg`, `--panel`, `--well`) take any foreground except
> `--bg`.
>
> **Bright grounds** (`--bad`, `--celo`) take **only** `--bg`.

`--well` had never been tested as a ground and turns out to be safe: it is
darker than `--bg`, so everything on it clears by more.

### What the pointer may change

Added 2026-09-11. The obvious hover is the one every consumer app uses: fill
the control with the next ground along. It was rejected that morning because
the grounds were 1.03 to 1.11 apart and the fill would have been invisible —
and the lift above has since made it possible, at 8.2 points of L*.

It stays rejected, on a different argument. A ground says *what kind of
surface this is*: page, card, recess. A control that borrows `--panel` on
hover claims for a moment to be a card, which is the one thing §13 spends its
whole section keeping straight. The line has the room to say it instead —
`--line-control` is 4.77 on `--bg` and `--dim` is 6.60. So:

> **On hover a control moves toward the colour it already wears**, at
> `--m-fast`, in `globals.css` and nowhere else.

| Variant | Rest | Hover |
|---|---|---|
| ghost | `--line-control` line, `--text` label | line → `--dim` |
| primary | `--celo` ground, `--bg` label | ground → `--celo-hover` (#E6E93C, 14.00 on `--bg`) |
| stop | `--bad` line and label | ground → `--bad`, label → `--bg` |
| ghost/stop on the paused header | `--bg` line and label on `--bad` | ground → `--bg`, label leaves it |
| text-only: a copy button, `↗`, a `<summary>` | — | underline |

`stop` takes the ground rather than the line because its line is already
`--bad` and cannot brighten inside this palette — and on the one control that
halts an agent mid-spend, a hover that fills red is not decoration. `--bg` is
also the only foreground §4 allows on a bright ground, so the flip is the rule
rather than an exception to it.

This is why `Button` and `ActionLink` keep their tone in CSS classes and not in
a style object: an inline style beats any rule a stylesheet can write, so the
hover could not have reached them. The two had already drifted while the tone
lived in TypeScript — only one of them had a `stop`.

**Not on it yet:** the wizard's stepper and its two recipient choices set
border and ground inline, conditional on which one is selected, so a rule
cannot reach them either. They answer a press and a focus, not a pointer.

### What the rule cost to learn

On 2026-09-05 a wrong-network test reported that the "Wrong network" badge
never appeared. It appeared every time. The badge is `--bad` on transparent and
the paused header band is `--bad`, so it was drawn in the background colour: a
contrast ratio of exactly **1.00**. The warning explaining why Resume did
nothing was painted in the colour behind it, at the one moment an owner most
needs to read it.

Under the rule above, that is impossible to write.

### Roles

| Token | Role | Rule |
|---|---|---|
| `--celo` | primary action, and the cap line | **exactly two roles.** A third dilutes both. |
| `--bad` | refusal, stop, over-limit | both a foreground *and* a ground — declare both |
| `--ok` | a thing that succeeded | wizard confirmations, and the feed's dot for any event that is not a pause |
| `--dim` | supporting text | the most-used token; never on a bright ground |
| `--line` | panel dividers | `rgba(255,255,255,.10)`, 1.32:1 — correct for a divider |
| `--line-control` | borders of controls | ≥3:1 against its ground |

Inputs wear it through the `.field` class in `globals.css`, which also
supplies their focus ring. Measured 2026-09-05: every input in the app was
still drawing its border in `--line` at 1.32:1, including the two that set how
much an agent may spend — `--line-control` was introduced for `Button` and the
fields were missed. They are 3.27:1 now. Their focus ring was Chrome's own
`auto 1px rgb(0,95,204)`: present, so not an accessibility hole, but browser
blue in a dark terminal UI. It is 2px `--text`, matching `Button`.

`--line-control` is new. Measured, `--line` gives 1.32:1 on `--panel` and
1.15:1 on the paused band, so a ghost button's border draws essentially
nothing — the control is identified by its text alone. That is tolerable for a
divider and not for **Resume** and **Disconnect**, two actions that must not be
ambiguous.

### The test asserts the rule, not a list

The old test enumerated pairs against two grounds. The new one walks the whole
matrix and asserts the two lines above, so a sixth ground added next year is
caught by the suite rather than by a person squinting at a screen.

---

## 5. The vocabulary of states

This already existed and was consistent; it had simply never been written down.
It is the most valuable thing in this document, because it encodes a
distinction that has twice saved this project from lying to its user: **"not
observed" is not "failed."**

| State | How it speaks | Example |
|---|---|---|
| Working | verb + `…`, **on the control itself** | `Sending…` `Stopping…` `Saving…` `Resuming…` `Switching…` |
| Empty | a label, then one sentence naming the **window** | "No activity yet — nothing spent in the last 24h" |
| Read failed | `Could not …`, and still retrying | "Could not read the agent wallet balance." |
| Write refused by the user | `The transaction was not sent.` | wallet rejection |
| Sent, not observed | `Sent, but the chain has not confirmed it yet.` | `pollUntil` timed out |

**Every block that can be in one of these states must say which.** Silence
reads as a broken button.

Two rules that follow:

- A poll that stops is **not** a failure. `pollUntil` returns whether the change
  was *observed*; false means "we stopped waiting". Never phrase it as failure.
- **`error.tsx` must say nothing about the chain.** A render error in the
  browser knows nothing about whether a transaction landed. It says something
  broke in the page and offers a reload — never "your transaction failed".

---

## 6. Components

Seven primitives. If a screen needs something none of them provides, that is
an eighth primitive, not a one-off.

| Component | Its one job |
|---|---|
| `Button` | `primary` (one per screen), `ghost`, `stop`. Takes `onDangerBand` when it sits on a bright ground. Borders use `--line-control`. |
| `Label` | field labels and badges at `--t-label`. **Not** section headings. |
| `Panel` | a block on `--panel` |
| `Section` | a landing section; its title is `--t-heading` |
| `Stat` | a label-and-value pair |
| `Address` | an address: truncated or full, optionally copyable, optionally linked to the explorer |
| `AppHeader` | the frame above every screen's content. `band` is `none`, `panel` (dashboard) or `danger` (paused); `nav` and `actions` are slots. |

**`AppHeader` replaces four hand-built headers.** The landing had a nav, the
dashboard a full-bleed band, `/accounts` a brand and a badge, and the wizard a
`large` wordmark sitting directly above a `--t-title` page heading — two
elements claiming one rank. Because no primitive owned the chrome,
`/accounts` showed the word `CELO` alone in its top right with nothing beside
it saying that was a network; in a slot shared with the dashboard's, it reads
as what it is.

`band="danger"` puts `--bad` on the outer element and `PAGE` on the content
inside, which is §3's full-bleed rule, and propagates `onBright` to the brand
so nothing downstream re-derives its ground — the arithmetic §4 exists to make
impossible. `test/chrome.test.ts` asserts that nothing outside `AppHeader`,
`Shell` and the footer imports `BrandLink`.

Two notes on two of the others:

**`Stat` was dead** — zero imports — while `Meter` and `LiveProof` each built
its label-and-value pair by hand, so the two drifted. The right component
existed and was forgotten. Use it.

**`Address` replaces `AddressChip` and `CopyAddress`.** They were not
duplicates — one was read-only text with an explorer link, the other an
interactive button owning the clipboard and its `copied` / `copy failed`
states. But the dashboard composed the second with a hand-written `↗` anchor,
which is the third shape. One component takes all three:

```tsx
<Address address={a} copy explorer />              // dashboard header
<Address address={a} explorer />                   // landing
<Address address={a} copy full className="num" />  // wizard
```

The clipboard failure state is not optional. A denied permission, an insecure
context and an unfocused document all reject silently, and "Copied" would then
be a claim about something that did not happen.

---

## 7. Screens: what dominates

Each screen names the one element that dominates it. Everything else ranks
below.

**`--t-display` and "dominant" are not the same word.** `--t-display` is the
44px step, and it is only ever a *number*. A screen whose dominant element is
a sentence uses `--t-title` for it and no `--t-display` at all. Two screens
here do exactly that.

### Dashboard — `/a/[address]`

**Dominant: the refusal threshold**, at `--t-display`. The smallest of the three constraints —
remaining daily allowance, per-transaction cap, and the account's actual
balance — with a line naming which one is currently biting.

Why that number and not the allowance: on 2026-09-05 the meter was fixed
(`50778cd`) because it *said what was permitted and never what was there* — an
empty account read as a full allowance and offered a next spend that would
revert. The allowance alone tells half the story and the balance alone tells
the other half. The threshold is the only figure that is always true, because
it is the minimum of all three. `refusalThreshold()` already computes it.

It also happens to be the number that moves on camera when the agent spends.

**In all five bands, not one.** Until 2026-09-11 the figure rendered only for
`ceiling`; in `paused`, `unfunded` and `exhausted` the meter said its piece at
`--t-label` — 11px, uppercase, tracked — and the screen had no dominant
element at all. The hierarchy inverted exactly when something was wrong, which
is the same shape of defect as the §4 badge drawn in the colour behind it.

The threshold in those three bands is not unknown, it is **zero**, so it is
stated: `0.00 USDC` at `--t-display` in `--bad`, with the §5 sentence under it
naming why. `loading` shows an em dash instead, because a `0.00` during a read
is a claim about the chain nobody has made (§5), and `bandFigure` returns
`null` rather than a bigint for exactly that reason.

This is also the meter's empty state. At zero balance the bar is a black track
with a cap line at the far right and no fill, which reads as broken; a figure
above it, with a sentence naming why, reads as zero. **The empty state needed
a number, not an illustration.**

Below it, at `--t-data`: remaining today, account holds, per-transaction cap.
Then limits, the agent panel, the feed.

### Landing — `/`

**Dominant: the headline**, at `--t-title`. No `--t-display` on this screen: nothing here is a number.

**The hero was at `--t-display` until 2026-09-11.** `Hero.tsx` set
`clamp(2.25rem, 8vw, var(--t-display))`, which measures 44px on a desktop —
the display step, on the screen this section says carries none. `Meter.tsx`
had meanwhile been written to *avoid* a 44px figure here, citing this
paragraph: "a 44px figure in LiveProof would outrank the headline it is
supposed to support." That precaution is only coherent if the headline is not
itself at 44px, so the component was protecting a rule the hero broke.

The hero is `--t-title` now — 30px, 36px from 640px up — and the `clamp()`
went with it, because the step already carries its own breakpoint and two
responsive mechanisms on one element is how two rules come to disagree.
`e2e/faces.spec.ts` asserts the count of display-step elements per route
rather than trusting either the document or the component.

The content here is already strong — the Without/With table, the three steps,
the tool list, the copyable `.mcp.json`. It was failing only because every part
of it was set at the same size. `--t-heading` on section titles is most of the
fix.

### Wizard — `/setup`

**Dominant: the current step**, at `--t-heading`. No `--t-display`: a wizard's
job is to say where you are, and no figure on it is worth 44px.

The steps reveal progressively and completed ones stay on screen, all six set
in the same 11px label, so nothing says "you are here". The current step takes
`--t-heading`; completed steps collapse to a one-line summary with a tick.

### Not found, invalid address, error

Three screens the app does not have. Today a bad path gets Next's default 404,
a render error gets Next's default error page, and an invalid address returns
**HTTP 200** with a single unstyled sentence — no header, no branding, no way
back.

All three wear the same shell: the header band, one sentence at
`--t-heading`, one at `--t-body`, one way out.

---

## 8. Not decided here

- **Motion.** ~~Nobody has complained that the app feels dead~~ — **decided in
  §12 on 2026-09-11.** The meter still honours `prefers-reduced-motion` by not
  mounting the animation (`Meter.tsx` — a `display:none` on `<animate>` does
  nothing, since SMIL has no renderer to suppress); what §12 adds is a ceiling
  on everything else.
- **Light mode.** The palette is dark-only and the contrast work assumes it.
- **Mobile beyond what exists.** Spec §2.1 asks for mobile-first because
  MiniPay is a phone; the current layout is responsive and was untested at
  width. Partly decided since: measured at 375px on 2026-09-10, "Connect
  wallet" drew a 36.1px target and "My accounts" 38.1px, and `Address` drew
  about seventeen pixels with no padding at all. `Button` and `ActionLink`
  now carry a 44px floor in the box rather than in the type, `Address` gets
  it from `.tap-tall` — a pseudo-element, because AccountsPage renders it
  `full break-all` and those 42 characters have to stay free to wrap.
  `e2e/reach.spec.ts` measures the rendered box, not the class list. The rest
  of mobile — layout at width, landscape, the wizard on a small screen — is
  still undecided.

---

## 9. Changing this document

Two claims in the first draft of this file were wrong, and both were caught by
re-measuring rather than by re-reading: `--ok` was called unused when it colours
two wizard confirmations and the feed's dot, and `--t-title` was going to be a
flat 30px, which would have shrunk a hero that is `text-3xl sm:text-4xl`
today. Counting `color: 'var(--x)'` had missed both the ternary and the
`background` forms.

The lesson is the one the rest of this repo already follows: **count it, do not
recall it.** A design system asserting a number it did not measure is worse
than no design system, because the number then gets built on.


The palette and the type scale exist twice — as data in `app/lib/` and as CSS
custom properties in `globals.css` — with a test that fails when the two
disagree. That is deliberate: the CSS is what runs, and the data is what the
contrast and scale tests can reason about.

So: edit both, or the suite will tell you. And when a rule here changes,
change it here first. A rule that lives only in a comment is a rule that gets
dropped and leaves nothing behind — which is exactly how spec §4.1 came to
describe a visual direction that had not existed for a day.

---

# v2 — the axes that were empty

Added 2026-09-11. §1–§9 decided type, spacing, colour, state language and
components, and nothing else. Five axes were left with no rule at all, which
is not the same as having no values: the app had values for every one of them,
arrived at by whoever wrote each line.

Counted across `app/` and `components/` before any of this was written:

```
radius        4px ×10, 2px ×8, 9999px ×4    three values, never named
focus ring    14 hand-written call sites in 10 files, colour set at 19
motion        0 CSS transitions
elevation     0 shadows, 0 z-index, 0 overlays
padding       p-6 ×27, p-4 ×11, p-3 ×8, p-5 ×5, and 20 more
```

Four of those five were already coherent. §9's lesson applies to them exactly
as it applies to a number — **a rule that lives only in the code is a rule
that gets dropped and leaves nothing behind.** What follows mostly names what
the app already does, and in the two places where it does not, records the
gap as a debt that can only shrink.

These sections come after §9 rather than before it because renumbering would
break every `§n` reference in the code comments. §9 is still the last word on
how to change this file.

---

## 10. Radius: the corner says what kind of thing it is

Four values, and the choice between them is about what a thing **is**, not
about how modern it looks.

| Token | Value | For |
|---|---|---|
| `--r-surface` | 16px | a panel, a card, a band — something the layout sits *on* |
| `--r-box` | 10px | a control or a well: `Button`, `ActionLink`, `.field`, a code block |
| `--r-mark` | 4px | a mark laid over text: the ring on an inline link, the wordmark, a small badge |
| `--r-dot` | 9999px | a state dot, and only ever that |

**The three finite values doubled on 2026-09-11** (8 → 16, 4 → 10, 2 → 4).
The set, the names and what they distinguish did not move: the argument below
is that a status dot and a submit button must not claim to be the same kind of
object, and no particular number carries that. 8px was the corner of a dialog
box; a card in 2026 has a softer one, and at 10px a 44px-tall button is still
nowhere near a pill.

### Why four and not one

One radius on everything is the tell of a kit rather than a system. It makes a
status dot and a submit button claim to be the same kind of object, and in an
interface whose entire job is to distinguish *a thing that happened* from *a
thing you can do*, that is a claim this design cannot afford.

So: **a pill in this UI means status.** The `rounded-full` marks in `Feed` and
`ProtectionModel` are events and states; none of them is pressable. A
pill-shaped control would read as a badge, and a badge that turns out to spend
money is the worst possible outcome of a shape.

### Rules

- **There is no fifth radius, and the fourth was found by re-measuring.** This
  section first claimed three, having grepped `rounded*` classes and
  `border-radius` in CSS but **not** inline `borderRadius` — where four more
  values were sitting: `Panel` at 8, the dashboard's meter card at 8,
  `STATUS_BOX` at 6, `McpHandoff`'s code well at 4. The most-used container in
  the product was at a value this rule said did not exist, on the same day the
  rule was written.

  A surface is not a control, and that is the distinction the missing fourth
  was carrying. `STATUS_BOX`'s 6px was the one genuine stray and is `--r-box`
  now: a `--well` box holding a choice is a control.

  `test/surface.test.ts` asserts the set *and* holds a ratchet at zero over
  inline numeric radii, so the next literal fails the suite rather than
  waiting a month to be counted. That second assertion is the one this section
  needed and did not have.
- **`rounded` was 4px and so was `--r-box`, and that coincidence has ended.**
  Tailwind's `rounded` is still 4px; the token is 10px. The three call sites
  that had been relying on the two agreeing — a `--well` row in
  `AgentAccessPanel` and the two balance boxes in `AgentPanel` — set
  `borderRadius: var(--r-box)` now. `rounded-full` stays: it is `--r-dot` by
  another name and only marks wear it.
- **Radius is never a state.** Nothing grows a corner on hover or on focus.
  The ring says focus (§11).

---

## 11. Focus: one ring, declared once

Measured 2026-09-11, the three Tailwind focus utilities

```
focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
```

were written out by hand at **14 call sites across 10 files**, with the
outline colour set separately at **19**. Every one of them was correct.

That is the point. Nothing made the fifteenth correct, and §4 already records
what this pattern costs: `--line-control` was introduced for `Button`, and
every input in the app was missed — including the two fields that set how much
an agent may spend. The ring had simply not yet had its turn.

### The tokens

| Token | Value | Why |
|---|---|---|
| `--ring-w` | 2px | 1px was the defect. Measured 2026-09-05, an enabled input fell back to Chrome's `auto 1px rgb(0,95,204)`. |
| `--ring-gap` | 2px | the ring sits outside the control, where there is room |
| `--ring-inset` | −2px | turned inward, for a full-bleed row whose outside ring would be clipped by the panel edge |

Two classes in `globals.css` spend them: `.focus-ring` and
`.focus-ring-inset`. The negative offset is the only reason a second class
exists; a third would mean the offset had become a free number again.

**Not `.ring`.** Tailwind ships `ring` and `ring-inset` as box-shadow
utilities. A class of ours under either name would be emitted alongside
Tailwind's and paint a shadow this design does not have (§13) — on the one
control state where a reader most needs to see the truth. The test asserts the
name is not taken.

### The colour is deliberately not a token

A ring is a non-text UI boundary drawn on the ground **outside** the control,
so it has to clear 3:1 against *that* ground — which is a per-variant
decision, not a constant.

`Button`'s `primary` rings in `--celo` while its own text is `--bg`. Its
`ghost` on the paused header rings in `--bg`, because `--text` measures 3.16
on that band and `--bad` measures 1.00 — the same invisible-warning arithmetic
§4 was written to make impossible. The classes default to `currentColor`,
which is right wherever a control is drawn in the colour it should ring in,
and every call site that differs says so with `outlineColor`.

### What is left

**Zero hand-written rings remain.** Every one of the 14 is now `.focus-ring`
or, for `SecurityBoundary`'s full-bleed rows, `.focus-ring-inset`, and
`test/scaleUsage.test.ts` holds the count at zero.

Tabbing the built app afterwards found four controls that had never had the
hand-written classes either, so no ratchet had ever counted them: the
"See the full history on Celoscan" link in both `Feed` and `LiveProof`, and
the `<summary>` in the wizard and in `McpHandoff`. All four were drawing
Chrome's own `auto 1px` — the same browser blue §4 found on the inputs, still
present two rounds of ring work later. **A class list cannot show you a
control that has no class**; only tabbing the page can.

The rule for anything new: **a control does not build its own focus ring.**
Use a primitive, or `.focus-ring`.

---

## 12. Motion: the ground drifts, the data snaps

§8 left this undecided and the app had none at all — zero CSS transitions on
2026-09-11. This was written as a ceiling: it named two durations for movement
that did not exist, and said which movement would be allowed if someone
reached for it.

Both are spent now, and on exactly the cases named below — a rule that lists
three uses and is spent on none of them is a note, not a rule.
`test/surface.test.ts` asserts each token is drawn from `var(--m-…)` at its
call site, that `--m-slow` has exactly one user, and that no component writes
a duration of its own.

`globals.css` has carried the sentence *the ground drifts; the data snaps*
since the meter was built. This gives it numbers.

| Token | Value | For | Spent by |
|---|---|---|---|
| `--ease-settle` | `cubic-bezier(0.34, 1.06, 0.64, 1)` | the one curve — a 6% overshoot, which reads as weight where `ease-out` read as a stop | every rule below, and `test/surface.test.ts` fails on a second curve |
| `--m-fast` | 90ms | a state the reader just caused | `.motion-press` — every control, on `:active`; `.motion-reveal` — `LimitsDrawer` opening in flow, `Address`'s copy outcome landing; `.motion-control` — `Button` crossing between enabled and disabled |
| `--m-slow` | 400ms | the meter's geometry moving to a new value | `.meter-fill`, and nothing else, ever |

### Rules

- **A transition does not run on first render, and that is load-bearing.**
  The meter's fill arrives at today's figure rather than sweeping up to it;
  what eases is the *next* change, when an agent spends and the bar moves
  towards a wall that is visibly where it was. An entrance on load is movement
  the reader did not cause, which the next rule but one refuses.
- **Money never animates its digits.** `.num` is `tabular-nums` so a figure
  that changes live does not reflow (`CLAUDE.md`); a counted-up number would
  reintroduce exactly the reflow the class exists to prevent, and would show a
  sequence of values that were never true. The meter's *geometry* may ease.
  The number it describes changes in one frame.
- **A press is not a hover.** `.motion-press` scales a control to 0.98 while
  it is held, and it is the one piece of a consumer app's feel that survives
  §1: it says the control took the press, which is information. A shadow
  lifting says the control floats, which §13 refuses, and a hover transition
  fires on a pointer merely passing over — the reader may not have meant it.
  The rule below is about the second kind and this is the first. A control
  that answers a press with nothing is also the case a reader notices: a
  wallet confirmation can take seconds, and until it opens this is the only
  thing that answered the finger. `test/surface.test.ts` fails on a file with
  a raw `<button>` or `<summary>` that does not take one.
- **No ambient motion.** Nothing moves that the reader did not cause. No
  entrance on scroll, no pulse on a live value, and no transition on hover
  **except a control's own colour**, at `--m-fast`. This is a screen someone
  watches while an agent spends real money; a page that moves on its own makes
  the one movement that matters — the meter — stop being a signal. A control
  answering the pointer that is on it is not that: it moves only where the
  reader is already looking, only while they are there, and only in colour —
  nothing reflows, and §4 defines what may change.
- **`--m-slow` has exactly one user.** A second thing at 400ms competes with
  the meter for the eye, and the meter is the instrument.
- **`prefers-reduced-motion` is handled once, globally.** A blanket rule at
  the end of `globals.css` collapses every transition and animation to 1ms.
  1ms rather than 0 so `transitionend` still fires and nothing waiting on it
  hangs. Per-component media queries are how the focus ring ended up written
  fourteen times.
- **The SMIL half cannot live in CSS.** `display: none` on an `<animate>`
  element applies and achieves nothing, so `Meter.tsx` does not mount it. The
  global guard covers CSS transitions; SMIL is still a mount decision.

---

## 13. Elevation: there is no layer above the page

Measured 2026-09-11: **zero shadows, zero `z-index`, zero overlays.**
`LimitsDrawer` expands in flow with `aria-expanded`/`aria-controls`;
`AccountSwitcher` is a native `<select>`, which puts its list in the browser's
own layer rather than ours.

That is a decision and it is now written down, which by §5's standard is the
most useful thing this section does.

### The rule

> **Depth is a change of ground, never a shadow.**
> `--well` (#07090B) sits below `--bg` (#0B0D10) sits below `--panel`
> (#14171C).

A soft grey shadow on a #0B0D10 ground is very nearly invisible, so it buys no
depth; what it delivers instead is the one ornament §1 refuses. Three grounds
already express every level this app has.

**Re-measured on 2026-09-11, after §4 lifted the grounds off black.** The
argument was worth re-testing, because a shadow has more to darken on
`#12151B` than it had on `#0B0D10`: a black shadow at 45% opacity drops the
ground by **3.5** points of L* now, against 1.7 before. But the step from
`--bg` to `--panel` is **8.2**, so the ground still says it more than twice as
loudly — and there is nothing in this app that sits *above* the page for a
shadow to lift. Panels sit on it. The rule stands, and now it stands on a
number rather than on an impression.

`test/surface.test.ts` holds a ratchet at zero over both `shadow-*` and
`z-*`, which at zero is a ban.

### If a real overlay is ever needed

Use `<dialog>`. It renders in the browser's top layer, above everything,
**without a `z-index`** — so the ban survives the feature. It also brings
focus trapping and Escape for free (and note what `LimitsDrawer` chose for the
destructive case: `window.confirm`, the browser's own dialog, rather than a
modal of ours).

**This section used to say `LimitsDrawer` had implemented that focus trap by
hand. It has not, and deliberately.** Read on 2026-09-11, the component
handles Escape in about eight lines and says why in a comment: *"this is a
disclosure rather than a modal — it does not cover the page and does not trap
focus"*. Leaving focus on the trigger, with the panel next in the DOM, is the
pattern a disclosure is supposed to use; trapping focus inside one that does
not cover the page would be the defect, not the fix.

The distinction matters because it is the whole test for whether a screen
needs this section. `showModal()` makes everything else inert, and on the form
that sets an agent's spending limits that would take the meter and the current
allowance off the screen — the numbers the limits are being set against. An
overlay has to earn itself by what it prevents. That one prevents nothing.

If that turns out to be wrong, §9 applies: change this section first and the
test second.

---

## 14. Padding: the fourth step, and the one exception

§3 gave margins and gaps four steps and then said of padding that *the table
above never claimed the four steps governed it* — reading `4` as an error was
left to a person, so `test/scaleUsage.test.ts` did not look.

It looks now, because the judgement the regex was missing turns out to be one
sentence.

### The rule

**The four steps of §3 govern padding too — 2, 3, 6, 12 — and `4` is legal on
the horizontal axis only.**

That exception is not a compromise; it is the measurement. `PAGE` is `px-4`
and §3 spends a paragraph on why the gutter is 16px and not 24. `Button` is
`px-4 py-2` because a control is wider than it is tall. Both are deliberate.
`p-4` on a panel is the one that drifted, at 11 uses.

| Step | px | Meaning |
|---|---|---|
| `2` | 8 | inside a single control |
| `3` | 12 | a tight inner box: a code block, a feed row |
| `6` | 24 | a panel — the dominant value already, at 27 uses |
| `12` | 48 | a full-bleed band |
| `x-4` | 16 | the page gutter, and the horizontal half of a control |

And the relationship that makes it feel composed rather than merely
consistent: **a container's padding is one step above the gap between its
children.** A `Panel` at `p-6` holds rows at `gap-3`. A control at `py-2`
holds its parts at `gap-2` — the floor, where the two meet.

### The debt

**38 off-scale paddings on 2026-09-11, cleared to 2 the same day.** `p-4` on a
panel becomes `p-6`; `p-5`/`pt-5` become the 6 step; the landing's
`py-8/10/14/20` bands become `py-12`.

The two that remain are the `pr-16` on the per-transaction and daily inputs.
They reserve room for the "USDC" suffix positioned over the field, so that
padding is measured against the width of another element and not against §3's
rhythm. No step is the right answer, and the honest move is to leave it
recorded in the ratchet rather than punch a hole in the rule.

---

## 15. Still not decided

- **Light mode.** Unchanged from §8: the palette is dark-only and the contrast
  work assumes it.
- **Mobile beyond reach.** §8's last bullet stands, less one clause: layout at
  width is measured now, in §16, at 768, 900 and 1024. Landscape and the
  wizard on a small screen are still not.
- **Density.** One size of everything, on every screen. A dashboard watched on
  a phone and one watched on a desk may not want the same `Panel` padding, and
  nobody has measured whether that matters here.
- **A second icon.** §17 settles the mark. It does not settle an icon *set*:
  the first interface icon that arrives will need a rule about what may be
  drawn at all, and `↗` and `✓` are still text until then.

---

## 16. The grid: twelve columns, and where a span may widen

§3 gave the page one width and nothing below it. Every block that divided
chose its own division: measured 2026-09-11, `sm:grid-cols-2` in four places,
`sm:grid-cols-3` in three, `grid-cols-2 gap-2 sm:grid-cols-4` in the stepper.
Two blocks on different screens lined up only when both had happened to pick
thirds.

### What it cost

The page was 768px because `Meter` was, and `Meter` is an SVG with
`viewBox="0 0 600 14"` — it magnifies rather than reflows, so at the 1888px it
reached on an unconstrained dashboard the 2px gap §3.1 spends a rule on
magnified with it. That is a fact about one component, and enforcing it at the
page made it a fact about every card grid in the app.

Measured at 1440px with the page still capped at 768, the landing's three-up
cards were **235px wide and ran their body text at 21 characters a line**.
Below about 30ch an eye spends more time returning to the left margin than
reading.

### The rule

> **Twelve columns, a 24px gutter, a 1024px container, and a 16px page
> gutter. A span starts at `col-span-12` and widens only where a measurement
> says it may.**

`COLUMNS`, `GUTTER`, `CONTAINER`, `PAGE_GUTTER` and `METER_MAX` are data in
`app/lib/layout.ts`, custom properties in `globals.css`, and
`test/layout.test.ts` fails when the two disagree — the arrangement the
palette and the type scale already keep (§9).

- `GRID` in `components/ui/page.ts` — `grid grid-cols-12 gap-6` — is the page
  grid: twelve because it divides by 2, 3, 4 and 6, and the gutter is §3's
  step 6 rather than a number of its own.
- `PANEL_GRID` — `grid grid-cols-12 gap-3` — is the same twelve inside a
  panel. The gutter differs on purpose: §14 asks a container's padding to sit
  one step above the gap between its children, and a `Panel` at `p-6` holds
  rows at `gap-3`. A panel's padding already breaks alignment with the page's
  columns, so what carries across is the division, not the gutter.
- `Meter` carries `max-width: var(--meter-max)` — 736px, the width its viewBox
  was proportioned against — so the page no longer enforces one component's
  geometry on everything else.

### Where a span may widen, measured

| Width | half the page | a third of it |
|---|---|---|
| 768 (`md`) | 356px · 35ch | 229px · **21ch** |
| 900 | 422px · 43ch | 273px · 26ch |
| 1024 (`lg`) | 484px · 50ch | 315px · 31ch |

So a prose card goes two-up at `md` and three-up only at `lg`. A block that
takes a third of the page at 768 reproduces the exact defect this section
exists to fix, and `e2e/measure.spec.ts` probes the rendered page at 768 to
say so — the counterpart to the 68ch ceiling §2 sets, at the other end.

31ch at 1024 is one character above the floor, and it is recorded rather than
rounded up: 1152 would give 36ch and 1280 would give 41ch, but the dashboard
is a stack of panels and a meter capped at 736, and the wider the page the
more of it is margin. One width for every screen is §3's rule and it is kept.

### What is not on this grid

A grid whose columns are sized by their contents is not a page grid and does
not divide by twelve: the feed row's `grid-cols-[auto_1fr_auto]`, the
`[9rem_1fr]` and `[1fr_auto_1fr]` of `ProtectionModel`. Those describe a
relationship between an icon, a label and a figure; twelve columns would say
nothing about it.

**The floor still applies to them.** `ProtectionModel` split its two halves at
`sm`, and the 768px probe found each one running at 29ch — so that split moved
to `lg` too. Being off the grid exempts a block from the division, not from
the measure.

### What widening the page broke

A max-width on prose was the caller's job, on the argument that a list item in
a narrow panel is already measured by its column. That held while every column
was narrow. Widening the container stretched two dashboard paragraphs to
**109 characters** the moment it landed — they had never needed a cap and so
had never been given one. `PROSE` carries `maxWidth: '68ch'` itself now, and
`overflowWrap: 'break-word'` with it, because prose here can name a 42-
character address that has nowhere to break and did push the document sideways
at 375px.

---

## 17. The mark: the one drawing this interface has

§15 said there was no iconography and that a real icon would need a rule about
size, stroke and alignment before it could arrive. One arrived on 2026-09-11 —
two cubes, stacked, meeting at a point, drawn by the maintainer — so this is
that rule. It governs *the mark*. An icon set is still undecided (§15).

### The rule

> **The mark is filled geometry in `currentColor`, set by its height against
> the type it sits with, and it carries no stroke.**

- **`currentColor`, never a hex.** The mark then takes §4's ground rule for
  free: inside `.on-bright` it inherits `--bg` along with everything else in
  the band, and there is no second place where a colour has to be remembered.
  `test/surface.test.ts` fails on a hex in `components/ui/Mark.tsx`.
- **No stroke.** A stroke has a width that does not scale with the type step
  the mark is set at, so a wordmark at `--t-label` and a hero at `--t-title`
  would carry two different line weights. Filled geometry scales exactly. The
  open lids are drawn as a rhombus with a rhombus knocked out of it, at
  `fill-rule="evenodd"` — an outline made of fill.
- **Height, not width.** The mark is measured the way the type beside it is.
  Its viewBox is 10 × 21, so a width follows from a height and never the
  other way round.
- **It needs about twice the step it sits with.** At 1:2.1 a mark set to the
  cap height of `--t-label` is seven pixels wide and reads as a smudge —
  measured at 375px before the size was doubled. `BrandLink` sets
  `calc(var(--t-label) * 2)`, and `calc(var(--t-title) * 1.6)` where the
  wordmark is large.

### The raster copies, and how they stay in step

A favicon and an Open Graph image are standalone files with no access to a CSS
custom property, so each is a copy of the palette — which is exactly how both
came to be wrong. After §4 lifted the grounds, `app/icon.svg` still painted
`#0B0D10` and `opengraph-image.png` still showed the old near-black with no
mark on it: the two images a reader sees *before the page loads* were the last
two surfaces still in the old palette.

- `app/icon.svg` holds the mark's geometry in a nested viewBox, so the inner
  coordinates stay comparable to `Mark.tsx` line for line, and
  `test/tokens.test.ts` fails on any hex in it that is not in the palette.

  **It also has to be well-formed XML, which this repo's comment style is
  not.** An XML comment cannot contain a double hyphen, and every comment here
  writes a dash as one. The file that was replaced spent three of them naming
  custom properties, so it had never parsed: measured 2026-09-11, a browser
  asking for the tab icon got a parser error, and this app had never had a tab
  icon at all. The suite checks both halves now — the comment rule in
  `tokens.test.ts`, and whether a browser actually parses it in
  `e2e/landing.spec.ts`, because only the second one is proof.
- `app/favicon.ico` is generated by `app/scripts/icons.mjs` from that same
  SVG, for everything that asks for `/favicon.ico` by path without reading the
  document — link unfurlers, feed readers, an old browser. It is a separate
  Next route from `icon.svg`, so the two links coexist; an `icon.png` does
  not, because Next routes it from the same `icon` basename and it *replaces*
  the SVG link instead of joining it.
- `app/opengraph-image.png` is generated by `app/scripts/og.mjs`, which reads
  its colours out of `globals.css` rather than keeping a third copy. Re-run
  `node scripts/og.mjs` after a change to the palette, the mark or the
  headline.
- `app/apple-icon.png` is the source artwork, cropped: a home-screen icon is
  the one place the mark keeps the ground it was drawn on rather than the
  app's.

---
