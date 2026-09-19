import ActionLink from '../ui/ActionLink'
import Label from '../ui/Label'
import LiveProof from './LiveProof'
import { GRID, PAGE } from '../ui/page'
import { PROSE } from '../ui/prose'

/**
 * The claim and the evidence for it, side by side.
 *
 * This used to be the claim alone, in a single column capped at 68ch. Measured
 * in a browser at 1280x900 on 2026-09-14, that left the entire right half of
 * the screen empty while every section below it ran three-up card grids on the
 * full container -- so the one screen a reader is guaranteed to see was the
 * one screen that looked like a phone layout stretched wide. Worse, the live
 * meter had just been promoted to second on the page (e043158) and STILL
 * opened below the fold at that height: the reader was told the contract
 * refuses, and had to scroll to see anything refuse.
 *
 * Both halves are the same grid the rest of the page uses, and both collapse
 * to one column below `md`, in this order -- claim, then proof -- which is
 * exactly the stacked page that existed before. So the phone loses nothing.
 */
export default function Hero() {
  return (
    <section className={`${PAGE} pb-12 pt-12 sm:pb-12 sm:pt-12`} aria-labelledby="hero-title">
      <div className={GRID}>
        {/* `landing-stagger`: §12's landing exception, amended 2026-09-19 --
            each line enters one beat after the last. Pure CSS, and inside
            prefers-reduced-motion: no-preference, so it costs a reader who
            asked for less motion nothing and a page without script nothing. */}
        <div className="landing-stagger col-span-12 md:col-span-6">
          <Label>On-chain spending controls for AI agents</Label>
          <h1
            id="hero-title"
            className="mt-4"
            style={{
              fontFamily: 'var(--mono)',
              // --t-title, not --t-display. §2 reserves the display step for a
              // number and §7 says this screen carries none: if a sentence can be
              // 44px, the dashboard's 44px figure stops meaning "this is the
              // number", which is the whole load that step carries. Meter.tsx was
              // already declining to draw a 44px figure here on that authority.
              //
              // Moving the meter up beside this heading does not change that,
              // and checked rather than assumed: Meter takes `dominant` and
              // LiveProof does not pass it, so the figure on the right renders
              // at --t-data. The headline stays the dominant element of the
              // screen, which is what §7 is asking for -- it just no longer has
              // the screen to itself.
              //
              // The clamp() goes with it. --t-title carries its own breakpoint in
              // globals.css -- 30px, 36px from 640px up -- and a second responsive
              // mechanism on the same element is how two rules come to disagree.
              fontSize: 'var(--t-title)',
              lineHeight: 'var(--t-title-line)',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Give an AI agent a wallet without trusting it.
            {/* A terminal's cursor, drawn rather than typed: a block glyph
                depends on the face carrying it, and this is a box in the
                headline's own colour -- not --celo, which §4 has spoken for
                twice. Hidden from assistive tech; it is punctuation for the
                eye. At rest for a reader who asked for less motion. */}
            <span
              aria-hidden="true"
              className="landing-cursor"
              style={{
                display: 'inline-block', width: '0.55ch', height: '0.9em',
                marginLeft: '0.15em', verticalAlign: '-0.1em', background: 'currentColor',
              }}
            />
          </h1>
          {/* The prose exception from design-system §1: sans, not mono, because
              this is read rather than looked at. 68ch is the measure rule from
              §2, and it no longer decides the column: the grid does. */}
          {/* "gas or x402" until 2026-09-16, two undefined terms in the second
              paragraph of the page. A reader who does not already know both
              meets them before they know what the product is. "Transaction
              fees" costs nothing to say plainly, and x402 -- the thing that
              most distinguishes this -- earns its one clause of definition
              here, at its first use on the page. */}
          <p className="mt-5" style={{ ...PROSE, color: 'var(--dim)' }}>
            Spend limits are enforced by a contract on Celo, not by a sentence in a
            prompt. Most funds stay protected; the agent receives only permission
            to spend within policy, plus a small balance of its own for
            transaction fees and for x402 — the pay-per-request standard an agent
            uses to buy an API call.
          </p>
          {/* One CTA, not two. The second was a "View live dashboard" jump to
              #live-proof, which earned its place while that section was fourth
              and three screens of prose away. It is now beside this button,
              which retires the argument for the link entirely. */}
          <div className="mt-6 flex flex-wrap gap-3">
            <ActionLink href="/setup" variant="primary">Create protected account</ActionLink>
          </div>
          <ul
            className="mt-6 flex flex-wrap gap-x-6 gap-y-2"
            aria-label="Product facts"
            style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)' }}
          >
            <li>Celo mainnet</li>
            <li>· Open source</li>
            <li>· No custody</li>
            <li>· Any MCP agent</li>
          </ul>
          {/* The runtime requirement used to be said here, because it used to be
              said only in docs/quickstart.md -- which a reader reaches AFTER the
              wizard, five mainnet transactions and real money in. That drop-off
              is real and this line was a fair answer to it at the time.

              It is not the answer any more, and it was being paid for twice. The
              guard now stands where the money is: app/setup/page.tsx:909 states
              it on stage 1, outside the shut <details>, before the deploy and the
              four writes that follow. `AgentTools` says it again for the reader
              who wants to know before they start. A third copy here bought
              nothing and cost the page its third paragraph -- a developer
              prerequisite, above the fold, to a reader who has not yet been told
              what the product is. */}
        </div>

        {/* Carries id="live-proof" because FinalCta still links to it from the
            foot of the page, and because that anchor is the one a reader may
            already have bookmarked. `scroll-mt-20` matches Section's, so the
            sticky header does not cover the panel on arrival. */}
        {/* Two beats behind the claim, so the evidence follows it in. */}
        <div id="live-proof" className="landing-stagger landing-stagger-late col-span-12 md:col-span-6 scroll-mt-20">
          <h2
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-heading)',
              lineHeight: 'var(--t-heading-line)',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            Live account, real money
          </h2>
          <p className="mt-2 mb-6" style={{ ...PROSE, color: 'var(--dim)' }}>
            Policy, balance and recent activity, read straight from a deployed
            account on Celo mainnet. No wallet connection is required.
          </p>
          <LiveProof />
        </div>
      </div>
    </section>
  )
}
