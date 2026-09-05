import Link from 'next/link'
import Button from './Button'

/**
 * The frame the app's message screens share: not found, a render error, and
 * an address that is not an address.
 *
 * Before this, all three fell through to something that did not look like
 * this product -- and the invalid-address case answered HTTP 200 with a bare
 * sentence and no way back.
 */
export default function Shell({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <main className="w-full max-w-3xl mx-auto px-4 py-12">
      <p style={{
        fontFamily: 'var(--mono)', color: 'var(--celo)',
        letterSpacing: '.26em', fontWeight: 700, fontSize: 'var(--t-label)',
      }}>
        LEASH
      </p>
      <h1 className="mt-6" style={{
        fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)',
        lineHeight: 'var(--t-heading-line)', fontWeight: 500, color: 'var(--text)',
      }}>
        {title}
      </h1>
      <div className="mt-3" style={{
        fontFamily: 'var(--sans)', fontSize: 'var(--t-body)',
        lineHeight: 'var(--t-body-line)', color: 'var(--dim)', maxWidth: '68ch',
      }}>
        {children}
      </div>
      <div className="mt-6">
        <Link href="/"><Button variant="ghost">Back to the start</Button></Link>
      </div>
    </main>
  )
}
