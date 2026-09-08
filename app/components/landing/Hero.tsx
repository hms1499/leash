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
          fontSize: 'clamp(2.25rem, 8vw, var(--t-display))',
          lineHeight: 'var(--t-display-line)',
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
        className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs"
        aria-label="Product facts"
        style={{ color: 'var(--dim)', fontFamily: 'var(--mono)' }}
      >
        <li>Celo mainnet</li>
        <li>· Open source</li>
        <li>· No custody</li>
      </ul>
    </section>
  )
}
