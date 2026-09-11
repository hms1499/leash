import Link from 'next/link'
import ActionLink from '../ui/ActionLink'
import AppHeader from '../ui/AppHeader'

const NAV_ITEMS = [
  { href: '#how-it-works', label: 'How it works', external: false },
  { href: '#security', label: 'Security', external: false },
  { href: 'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md', label: 'Developers', external: true },
] as const

/**
 * --t-data, not --t-label. These name destinations, which is the label step's
 * job, but --t-label is uppercase and tracked .16em -- a nav set that way
 * shouts over the wordmark beside it. The step is refused deliberately rather
 * than by oversight. design-system.md §2.
 */
const NAV_LINK: React.CSSProperties = {
  fontSize: 'var(--t-data)',
  lineHeight: 'var(--t-data-line)',
  borderRadius: 'var(--r-mark)',
  color: 'var(--dim)',
  outlineColor: 'var(--text)',
}

export default function SiteHeader() {
  const nav = NAV_ITEMS.map((item) => (
    <a
      key={item.href}
      href={item.href}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noreferrer' : undefined}
      className="focus-ring"
      style={NAV_LINK}
    >
      {item.label}{item.external ? ' ↗' : ''}
    </a>
  ))

  const actions = (
    <>
      <Link href="/accounts" className="focus-ring" style={NAV_LINK}>
        My accounts
      </Link>
      <ActionLink href="/setup" variant="primary" className="px-3 py-1.5">
        Create account
      </ActionLink>
    </>
  )

  return <AppHeader nav={nav} actions={actions} />
}
