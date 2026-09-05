import Link from 'next/link'
import Button from '../ui/Button'
import Address from '../ui/Address'
import { PROSE } from '../ui/prose'

/** The account the whole page reads from, so the footer ends on something
 *  checkable rather than on a link to us. */
const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

/**
 * Where the page ends, and the last chance to answer "who is behind this".
 *
 * It used to be one button and the word "github". For a product that holds
 * other people's money that is a bad signal: a reader who has scrolled this
 * far is deciding whether to trust it, and the things that earn that are the
 * chain it runs on, the contract's shape, and somewhere to read the code.
 *
 * The cost line is here rather than in the hero. It answers the question a
 * reader has at the moment they reach for the button, and nowhere earlier.
 */
export default function Footer() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
        <a
          style={{ ...PROSE, color: 'var(--dim)' }}
          href="https://github.com/hms1499/leash"
          target="_blank"
          rel="noreferrer"
        >
          Read the source on GitHub ↗
        </a>
      </div>

      <p style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>
        Deploying your account is one transaction, about $0.013 in gas. The
        contract takes no fee.
      </p>

      <p style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>
        Leash runs on Celo mainnet. Every account is its own contract — 3406
        bytes, solc 0.8.24, source-verified, not a proxy and not upgradeable.
        The account this page reads from is{' '}
        <Address
          address={ACCOUNT}
          explorer
          className="num"
          style={{ color: 'var(--dim)', fontSize: 'var(--t-data)' }}
        />
      </p>
    </div>
  )
}
