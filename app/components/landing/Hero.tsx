import Link from 'next/link'
import Button from '../ui/Button'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

export default function Hero() {
  return (
    <header className="w-full max-w-3xl mx-auto px-4 pt-16 pb-10">
      <p style={{ color: 'var(--celo)', letterSpacing: '.26em', fontWeight: 700 }}>LEASH</p>
      <h1 className="mt-6 text-3xl sm:text-4xl font-semibold leading-tight" style={{ color: 'var(--text)' }}>
        Give an AI agent a wallet without trusting it.
      </h1>
      <p className="mt-4 text-base sm:text-lg" style={{ color: 'var(--dim)' }}>
        Spend limits are enforced by a contract on Celo, not by a sentence in a
        prompt. The money never sits in the agent&apos;s wallet — the agent can
        only ask, and the contract refuses.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
        <Link href={`/a/${ACCOUNT}`}><Button variant="ghost">See the live account →</Button></Link>
      </div>
    </header>
  )
}
