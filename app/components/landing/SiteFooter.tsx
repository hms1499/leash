import Link from 'next/link'
import BrandLink from '../ui/BrandLink'
import { PAGE } from '../ui/page'
import { PROSE } from '../ui/prose'

const LINKS = [
  { label: 'Setup guide', href: 'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md' },
  { label: 'Source code', href: 'https://github.com/hms1499/leash' },
  { label: 'Verified contract', href: 'https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2#code' },
] as const

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)' }}>
      <div className={`${PAGE} flex flex-col gap-6 py-8 sm:flex-row sm:items-end sm:justify-between`}>
        <div>
          <BrandLink />
          <p className="mt-3" style={{ ...PROSE, maxWidth: '44ch', color: 'var(--dim)' }}>
            Open-source spending controls for AI agents on Celo mainnet. You keep ownership; the contract takes no protocol fee.
          </p>
        </div>
        {/* Same refusal as the header nav: names for destinations, but not
            set in the uppercase tracked label step. §2. */}
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3"
          style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)' }}>
          <Link
            href="/accounts"
            className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--dim)', outlineColor: 'var(--text)' }}
          >
            My accounts
          </Link>
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: 'var(--dim)', outlineColor: 'var(--text)' }}
            >
              {link.label} ↗
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
