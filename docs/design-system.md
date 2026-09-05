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

Six steps. Each has one job; a seventh means one of these is doing two.

| Token | Size / line-height | Face | Used for |
|---|---|---|---|
| `--t-display` | 44px / 1.0 | mono 600 | **one** number per screen |
| `--t-title` | 30px / 1.2, **36px ≥640px** | mono 600 | hero headline, page title |
| `--t-heading` | 18px / 1.35 | mono 500 | section titles, wizard steps |
| `--t-body` | 14px / 1.65 | **sans** | prose |
| `--t-data` | 13px / 1.55 | mono | numbers, addresses, feed rows |
| `--t-label` | 11px / 1.3, `.16em`, uppercase | mono | field labels, badges |

`--t-heading` is the rank that was missing. Moving `Section` and the wizard's
steps onto it rebuilds the whole hierarchy without touching a single colour.

### Rules

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

- **Motion.** Nobody has complained that the app feels dead, and the meter
  already honours `prefers-reduced-motion` by not mounting the animation
  (`Meter.tsx` — a `display:none` on `<animate>` does nothing, since SMIL has
  no renderer to suppress). Left alone deliberately.
- **Light mode.** The palette is dark-only and the contrast work assumes it.
- **Mobile beyond what exists.** Spec §2.1 asks for mobile-first because
  MiniPay is a phone; the current layout is responsive and untested at width.

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
