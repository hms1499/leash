# Leash Frontend Redesign — Design Spec

**Date:** 2026-09-04
**Status:** Approved in chat 2026-09-04. Supplements `2026-09-01-leash-design.md`,
which stays the binding authority for everything this document does not touch.
**Supersedes:** `2026-09-03-leash-frontend-design.md` §1.4 (Café Terrace palette)
and §1.5 (the slim-current meter), and with them the visual half of
`2026-09-01-leash-design.md` §4.1. The *discipline* in §4.1 — painterly chrome,
clinical data — is retired along with the painting; the *failure modes* it names
survive as plain rules in §2.3 below.
**Covers:** a new landing page at `/`, the route move of the onboarding wizard,
a replacement visual direction, and a component system extracted from the
existing ad-hoc CSS.
**Does not cover:** the contract, the SDK, the MCP server, or any chain-reading
logic. This is a presentation layer change plus one new route.

---

## 1. Why this exists

The app has two screens and no front door. `/` is the onboarding wizard, so the
first thing a stranger meets is step 1 of a six-step setup for a product they
have not yet been told about. Nothing anywhere in the UI says what Leash is.

The five mainnet proofs — the strongest asset this project has — live in
`docs/deployments.md` and, since 2026-09-04, `README.md`. A visitor to the app
never sees them.

`judges-favorite` is decided by a human panel. The gap being closed here is not
"the UI could be prettier"; it is "a judge cannot tell what this is in fifteen
seconds, and cannot see that it is real without being told."

## 2. Decisions taken

Recorded so they can be re-argued rather than re-discovered.

### 2.1 Café Terrace is dropped entirely. Owner's call, against the spec's own bet.

`2026-09-01-leash-design.md` §4.1 argued the painterly direction *as a
competitive asset*: "Sixty projects will submit near-identical shadcn
dashboards; visual distinctiveness is a real asset here." That reasoning was put
to the owner on 2026-09-04 and the owner chose to drop the direction anyway.

This is recorded as a decision, not a discovery. Anyone reading the code later
and finding no trace of the painting should find the reason here rather than
assume it was lost.

### 2.2 No component library. A design system is written by hand.

shadcn/ui was offered and declined. No new runtime dependency enters `app/`.
Tailwind and hand-written tokens remain the whole toolchain.

The practical consequence: accessibility that a library would have supplied —
focus rings, disabled semantics, dialog focus traps — is now this project's own
responsibility and must be built, not assumed.

### 2.3 The replacement direction has a thesis: the limit is the design.

A neutral dark theme with no argument behind it is how a redesign becomes a
template. The thesis that replaces the painting:

> Every screen must make the boundary visible — the line the money does not
> cross.

The three failure modes from §4.1 are retired with the painting but restated
here as plain rules, because they were right about legibility regardless of
style: no texture behind numerals, no decorative typeface anywhere, no
background imagery.

### 2.4 The meter keeps its behaviour and loses its brushwork.

`Meter.tsx` today is a current that grows turbulent toward the cap. The
metaphor — a thing held inside a limit — is the clearest statement of the
product on screen, and it survives. The painterly rendering does not.

The replacement is a precise bar with a hard **cap line**. The fill runs toward
the line; at the cap it strikes the line and locks, and the line turns from
Celo yellow to the blocked colour. The existing `prefers-reduced-motion`
handling is preserved exactly: a viewer who asked the OS to stop animation gets
a still meter that is still correct, enforced by not mounting the animation
rather than by hiding it.

### 2.5 Celo yellow stays, and stays rare.

`--celo: #FCFF52` was verified on 2026-09-03 by fetching celo.org/brand-kit and
reading that page's own rendered CSS. It is not re-derived here. It appears in
exactly two roles: the primary action, and the cap line. A third use dilutes
both.

## 3. Visual system

### 3.1 Tokens

Replaces the `:root` block in `app/globals.css`.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0B0D10` | Page ground, neutral not teal |
| `--panel` | `#14171C` | One step up from the ground |
| `--well` | `#07090B` | Recessed: meter track, code blocks |
| `--line` | `rgba(255,255,255,0.10)` | Hairline borders, 1px |
| `--text` | `#E8EAED` | Primary text |
| `--dim` | `#8A9199` | Labels, secondary text |
| `--celo` | `#FCFF52` | Primary action, cap line. Nowhere else |
| `--ok` | `#4E9E7E` | Within limit |
| `--bad` | `#C4544F` | Blocked, paused, locked cap |
| `--meter-fill` | `#2C3540` | Meter fill below the cap line |

Every text-on-background pair must be measured against WCAG AA (4.5:1 for body,
3:1 for large text and UI boundaries) during implementation. The values above
are proposals, not verified ratios; any pair that fails is adjusted and the
adjustment recorded here.

### 3.2 Type and motion

Type: system grotesk for UI. All money keeps the global `.num` class — mono,
`tabular-nums` — so digits do not reflow as values update live. This is a
`CLAUDE.md` convention and is not up for redesign.

Motion: the drifting ground is removed. Exactly one animation remains in the
app, in the meter. Data updates snap.

### 3.3 Comments that must survive

`app/globals.css` carries comments explaining hazards that were paid for: that
Tailwind 3's preflight resets button cursors, that a disabled button rendered
identically to a live one on a control that spends real money, and that
`display: none` on an `<animate>` element does not stop SMIL. `CLAUDE.md`
forbids stripping these when editing nearby code. They move to the new token
file intact.

## 4. Information architecture

| Route | Before | After |
|---|---|---|
| `/` | Onboarding wizard | **Landing page.** Public, no wallet |
| `/setup` | — | The wizard, moved unchanged in behaviour |
| `/a/<address>` | Dashboard | Dashboard, restyled only |

Two documents reference the old wizard path and change with it:
`README.md:83` and `docs/mcp-setup.md:9`.

The dashboard route is deliberately unchanged, so the three existing Playwright
specs keep passing without edit.

## 5. Landing page — `/`

Sections in order. Every number on this page is read from Celo mainnet at load
time; none is hard-coded.

1. **Hero.** One sentence that states what Leash is, one that states how it
   differs from a prompt instruction. Two actions: build your own, or view the
   live account.
2. **Live proof.** The mainnet account's real state — remaining today on the
   meter, the caps, and the three most recent feed rows — labelled as live and
   linked to celoscan. A visitor understands and verifies in the same glance,
   with no wallet and no trust.
3. **Without Leash / With Leash.** Two columns. The contrast is the pitch: a
   leaked key drains a wallet, versus a leaked key spends at most one day's
   allowance to addresses you named.
4. **Three steps.** Deploy, set limits, hand the agent a key it cannot abuse.
5. **What your agent gets.** The three MCP tools named, and the `.mcp.json`
   block with a copy button — reusing `McpHandoff`'s existing placeholder and
   tag-validation behaviour rather than duplicating it.
6. **Proven on mainnet.** The five-row table from `README.md`, each row linking
   to its transaction.
7. **Footer.** Repeat the primary action; link the repo and the docs.

### 5.1 The proof rows have one source

The five transactions appear in `README.md` and now on the landing page. They
move into `app/lib/proofs.ts` as data, so the page renders from a list rather
than from hand-written JSX. `README.md` stays hand-written prose; the shared
source prevents the *app* from drifting, and any future divergence between the
two is a documentation review problem, not a rendering one.

### 5.2 Cost of the live data

The landing page reads logs on load. It is capped at three feed rows over a
narrower block window than the dashboard uses, because `forno` refuses a
`getLogs` range wider than 5,000 blocks and every window costs
`window ÷ 5,000` sequential round trips.

`NEXT_PUBLIC_CELO_RPC_URL` must be set in the deployment environment. Without
it every visitor shares public forno, and the landing page becomes the most
expensive page in the app.

## 6. Component system

Extracted into `app/components/ui/`: `Button` (primary, ghost, stop), `Panel`,
`Label`, `Stat`, `AddressChip`, `Section`.

`.num` stays a global class and is deliberately **not** wrapped in a component:
it is applied to numerals inside otherwise unrelated markup, and a component
boundary there would buy nothing.

The eight existing components keep their logic untouched and change only which
primitives they render. `Meter.tsx` is the exception — it is redrawn per §2.4.

## 7. Testing

The existing suites must stay green with no edits: 67 vitest specs in `app`,
and the three Playwright specs, which survive because `/a/<address>` does not
move.

Added:

- A Playwright spec asserting the landing page renders live mainnet numbers
  with no wallet connected — the same guarantee the dashboard spec makes.
- A Playwright spec asserting no horizontal scroll at a mobile viewport.
  `2026-09-01-leash-design.md` §4 requires mobile-first for the MiniPay in-app
  browser and nothing currently tests it.
- Unit coverage for the meter's cap-lock state, which is pure given a value and
  a cap.

## 8. Risks

1. **The wizard has never been exercised by a browser wallet, and this change
   moves it.** No e2e covers the wizard's three writes, so the route move is
   confirmed only by a human connecting a wallet and clicking through. This was
   already the project's largest open risk; this change does not increase it,
   but it does not reduce it either, and the click-through must happen after
   this work rather than before.
2. **Accessibility is now hand-rolled.** See §2.2.
3. **Contrast ratios in §3.1 are unverified proposals.** See §3.1.

## 9. Out of scope

The contract, the SDK, the MCP server, and every chain-reading hook. No new
runtime dependency. No change to what any screen can *do* — the feature set
after this work is identical to the feature set before it.
