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

        <div className="hidden items-center gap-5 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              className="rounded-sm text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: 'var(--dim)', outlineColor: 'var(--text)' }}
            >
              {item.label}{item.external ? ' ↗' : ''}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/accounts"
            className="rounded-sm text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--dim)', outlineColor: 'var(--text)' }}
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
