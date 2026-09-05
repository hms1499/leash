import Link from 'next/link'
import Button from '../ui/Button'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

export default function Hero() {
  return (
    <header className="w-full max-w-3xl mx-auto px-4 py-12">
      <p style={{
        fontFamily: 'var(--mono)', fontSize: 'var(--t-label)',
        color: 'var(--celo)', letterSpacing: '.26em', fontWeight: 700,
      }}>
        LEASH
      </p>
      <h1
        className="mt-6"
        style={{
          fontFamily: 'var(--mono)',
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
        className="mt-3"
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--t-body)',
          lineHeight: 'var(--t-body-line)',
          maxWidth: '68ch',
          color: 'var(--dim)',
        }}
      >
        Spend limits are enforced by a contract on Celo, not by a sentence in a
        prompt. The money never sits in the agent&apos;s wallet — the agent can
        only ask, and the contract refuses.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
        <Link href={`/a/${ACCOUNT}`}><Button variant="ghost">See the live account</Button></Link>
      </div>
    </header>
  )
}
