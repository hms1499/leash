import Link from 'next/link'
import ActionLink from '../ui/ActionLink'
import BrandLink from '../ui/BrandLink'
import { PAGE } from '../ui/page'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

export default function Hero() {
  return (
    <header className={`${PAGE} py-12`}>
      <nav aria-label="Primary" className="flex items-center justify-between gap-4">
        <BrandLink />
        <Link
          href="/accounts"
          className="rounded-sm text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--dim)', outlineColor: 'var(--text)' }}
        >
          My accounts
        </Link>
      </nav>
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
        prompt. Most funds stay protected; the agent receives only permission
        to spend within policy and a small operating balance for gas or x402.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ActionLink href="/setup" variant="primary">Create protected account</ActionLink>
        <ActionLink href={`/a/${ACCOUNT}`}>View live dashboard</ActionLink>
      </div>
    </header>
  )
}
