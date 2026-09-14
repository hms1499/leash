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
        <div className="col-span-12 md:col-span-6">
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
          </h1>
          {/* The prose exception from design-system §1: sans, not mono, because
              this is read rather than looked at. 68ch is the measure rule from
              §2, and it no longer decides the column: the grid does. */}
          <p className="mt-5" style={{ ...PROSE, color: 'var(--dim)' }}>
            Spend limits are enforced by a contract on Celo, not by a sentence in a
            prompt. Most funds stay protected; the agent receives only permission
            to spend within policy and a small operating balance for gas or x402.
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
          {/* Said here because it used to be said only in docs/quickstart.md,
              which a reader reaches AFTER the wizard -- that is, after deploying
              a contract, setting a policy, authorising an agent and funding two
              balances, all with real money. Finding out what you need to finish,
              five mainnet transactions in, is the drop-off this line exists to
              prevent. Deliberately NOT "requires Claude Code": mcp/src/index.ts
              speaks stdio MCP and nothing else, so any MCP client works, and
              naming one would turn away the others for no reason.

              BELOW the facts rather than directly under the button, where it
              first landed. Three lines of dim prose in the gap between a CTA and
              everything else is three lines the eye crosses on its way to the
              one action this screen asks for. */}
          <p className="mt-6" style={{ ...PROSE, color: 'var(--dim)' }}>
            Connecting an agent afterwards needs Node 20 or newer and an MCP client
            — Claude Code, Cursor and Codex all work. The protected account itself
            needs none of that and is complete without it.
          </p>
        </div>

        {/* Carries id="live-proof" because FinalCta still links to it from the
            foot of the page, and because that anchor is the one a reader may
            already have bookmarked. `scroll-mt-20` matches Section's, so the
            sticky header does not cover the panel on arrival. */}
        <div id="live-proof" className="col-span-12 md:col-span-6 scroll-mt-20">
          <h2
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-heading)',
              lineHeight: 'var(--t-heading-line)',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            A real account, not a mockup
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
