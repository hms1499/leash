import Link from 'next/link'
import ActionLink from '../ui/ActionLink'
import BrandLink from '../ui/BrandLink'
import { PAGE } from '../ui/page'

const NAV_ITEMS = [
  { href: '#how-it-works', label: 'How it works', external: false },
  { href: '#security', label: 'Security', external: false },
  { href: 'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md', label: 'Developers', external: true },
] as const

export default function SiteHeader() {
  return (
    <header style={{ borderBottom: '1px solid var(--line)' }}>
      <nav
        aria-label="Primary"
        className={`${PAGE} flex min-h-16 items-center justify-between gap-4`}
      >
        <BrandLink />

        {/* --t-data, not --t-label. These name destinations, which is the
            label step's job, but --t-label is uppercase and tracked .16em --
            a nav set that way shouts over the wordmark beside it. The step is
            refused deliberately rather than by oversight. §2. */}
        <div className="hidden items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              className="focus-ring"
              style={{ borderRadius: 'var(--r-mark)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)', outlineColor: 'var(--text)' }}
            >
              {item.label}{item.external ? ' ↗' : ''}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/accounts"
            className="focus-ring"
            style={{ borderRadius: 'var(--r-mark)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)', outlineColor: 'var(--text)' }}
          >
            My accounts
          </Link>
          <ActionLink href="/setup" variant="primary" className="px-3 py-1.5">
            Create account
          </ActionLink>
        </div>
      </nav>
    </header>
  )
}
