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

`PAGE` in `components/ui/page.ts` — `w-full max-w-3xl mx-auto px-4`, so 768px
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

768px because that is the width `Meter` was drawn for and already ran at
inside `LiveProof`. The gutter stays 16px: it is the edge of the viewport
rather than a relationship between two elements, and 24px gutters waste width
on the phone MiniPay runs on.

**A full-bleed band puts its background on an outer element and `PAGE` on the
content inside it.** The dashboard header and the meter's ground both do this,
so the band spans the viewport — which is what makes the paused state read as
red edge to edge — while what it holds stays on the page's column.

---

## 4. Colour

The palette itself does not change. What changes is that **grounds are now
named**, because they were not, and that omission cost a real bug.

### The five grounds

| Ground | Hex | Where |
|---|---|---|
| `--bg` | `#0B0D10` | page |
| `--panel` | `#14171C` | `Panel`, the meter band |
| `--well` | `#07090B` | inputs, code blocks |
| `--bad` | `#D0605B` | **the header band while paused** |
| `--celo` | `#FCFF52` | **the primary button** |

The last two are the ones nobody had written down. The contrast test checked
`bg` and `panel` only, so a foreground could sit on a bright ground unchecked —
and one did.

### The rule

Measured 2026-09-05, every foreground against every ground:

```
             bg    panel    well     bad    celo
--text     16.14   14.90   16.55    3.16    1.12
--dim       6.11    5.64    6.26    1.20    2.97
--celo     18.13   16.74   18.58    3.55    1.00
--ok        6.04    5.57    6.19    1.18    3.00
--bad       5.10    4.71    5.23    1.00    3.55
--bg        1.00    1.08    1.03    5.10   18.13
```

Two lines fall out of it, and they replace every argument about colour:

> **Dark grounds** (`--bg`, `--panel`, `--well`) take any foreground except
> `--bg`.
>
> **Bright grounds** (`--bad`, `--celo`) take **only** `--bg`.

`--well` had never been tested as a ground and turns out to be safe: it is
darker than `--bg`, so everything on it clears by more.

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

Six primitives. If a screen needs something none of them provides, that is a
seventh primitive, not a one-off.

| Component | Its one job |
|---|---|
| `Button` | `primary` (one per screen), `ghost`, `stop`. Takes `onDangerBand` when it sits on a bright ground. Borders use `--line-control`. |
| `Label` | field labels and badges at `--t-label`. **Not** section headings. |
| `Panel` | a block on `--panel` |
| `Section` | a landing section; its title is `--t-heading` |
| `Stat` | a label-and-value pair |
| `Address` | an address: truncated or full, optionally copyable, optionally linked to the explorer |

Two notes on the last two:

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
| `--r-surface` | 8px | a panel, a card, a band — something the layout sits *on* |
| `--r-box` | 4px | a control or a well: `Button`, `ActionLink`, `.field`, a code block |
| `--r-mark` | 2px | a mark laid over text: the ring on an inline link, the wordmark, a small badge |
| `--r-dot` | 9999px | a state dot, and only ever that |

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
- **`rounded` and `--r-box` are both 4px today. Prefer the token.** The
  coincidence is not the rule; the token is. `Button`, `ActionLink` and
  `BrandLink` set `borderRadius` from it.
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

`Button`, `ActionLink` and `BrandLink` moved onto `.focus-ring`; **11
hand-written rings remain**, in the seven files `test/scaleUsage.test.ts`
records. They are correct and they are debt. The ratchet means the count can
fall and cannot rise.

The rule for anything new: **a control does not build its own focus ring.**
Use a primitive, or `.focus-ring`.

---

## 12. Motion: the ground drifts, the data snaps

§8 left this undecided and the app has none at all — zero CSS transitions on
2026-09-11. So this is a ceiling, not a feature. Nothing here asks for
movement that does not exist; it says which movement would be allowed if
someone reached for it.

`globals.css` has carried the sentence *the ground drifts; the data snaps*
since the meter was built. This gives it numbers.

| Token | Value | For |
|---|---|---|
| `--m-fast` | 90ms | a state the reader just caused: a disclosure opening, a copy landing, a control enabling |
| `--m-slow` | 400ms | the meter's geometry moving to a new value |

### Rules

- **Money never animates its digits.** `.num` is `tabular-nums` so a figure
  that changes live does not reflow (`CLAUDE.md`); a counted-up number would
  reintroduce exactly the reflow the class exists to prevent, and would show a
  sequence of values that were never true. The meter's *geometry* may ease.
  The number it describes changes in one frame.
- **No ambient motion.** Nothing moves that the reader did not cause. No
  entrance on scroll, no transition on hover, no pulse on a live value. This
  is a screen someone watches while an agent spends real money; a page that
  moves on its own makes the one movement that matters — the meter — stop
  being a signal.
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

`test/surface.test.ts` holds a ratchet at zero over both `shadow-*` and
`z-*`, which at zero is a ban.

### If a real overlay is ever needed

Use `<dialog>`. It renders in the browser's top layer, above everything,
**without a `z-index`** — so the ban survives the feature. It also brings
focus trapping and Escape, which `LimitsDrawer` had to implement by hand
(and note what it chose for the destructive case: `window.confirm`, the
browser's own dialog, rather than a modal of ours).

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

**38 off-scale paddings on 2026-09-11**, `p-4` the largest share at 11, and 13
of the 38 in `app/setup/page.tsx` — the same file that holds 53 of the raw
type sizes and 43 of the off-scale margins. The wizard is where this design
system's debt lives, and that is now three ratchets pointing at one file.

Unlike §2's 120 and §3's 90, this one is small enough to pay off in a sitting.

---

## 15. Still not decided

- **Light mode.** Unchanged from §8: the palette is dark-only and the contrast
  work assumes it.
- **Mobile beyond reach.** §8's last bullet stands. Reach is fixed and
  measured; layout at width, landscape, and the wizard on a small screen are
  not.
- **Density.** One size of everything, on every screen. A dashboard watched on
  a phone and one watched on a desk may not want the same `Panel` padding, and
  nobody has measured whether that matters here.
- **Iconography.** There is none, deliberately — `↗` and `✓` are text. If a
  real icon ever arrives it needs a rule about size, stroke and alignment to
  the type scale, and none exists.
