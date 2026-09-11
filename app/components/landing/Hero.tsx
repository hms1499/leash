import ActionLink from '../ui/ActionLink'
import Label from '../ui/Label'
import { PAGE } from '../ui/page'
import { PROSE } from '../ui/prose'

export default function Hero() {
  return (
    <section className={`${PAGE} pb-12 pt-14 sm:pb-16 sm:pt-20`} aria-labelledby="hero-title">
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
          this is read rather than looked at. 68ch is the measure rule from §2. */}
      <p
        className="mt-5"
        style={{
          ...PROSE,
          maxWidth: '68ch',
          color: 'var(--dim)',
        }}
      >
        Spend limits are enforced by a contract on Celo, not by a sentence in a
        prompt. Most funds stay protected; the agent receives only permission
        to spend within policy and a small operating balance for gas or x402.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ActionLink href="/setup" variant="primary">Create protected account</ActionLink>
        <ActionLink href="#live-proof">View live dashboard</ActionLink>
      </div>
      <ul
        className="mt-6 flex flex-wrap gap-x-6 gap-y-2"
        aria-label="Product facts"
        style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)' }}
      >
        <li>Celo mainnet</li>
        <li>· Open source</li>
        <li>· No custody</li>
      </ul>
    </section>
  )
}
