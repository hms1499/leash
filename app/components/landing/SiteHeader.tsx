import Link from 'next/link'
import ActionLink from '../ui/ActionLink'
import AppHeader from '../ui/AppHeader'
import { DATA } from '../ui/prose'

const NAV_ITEMS = [
  { href: '#how-it-works', label: 'How it works', external: false },
  { href: '#security', label: 'Security', external: false },
  // In-page since the developer section exists again. It pointed at
  // docs/mcp-setup.md on GitHub while the homepage carried no package name at
  // all -- the one nav item that answered its own question by leaving the site.
  { href: '#developers', label: 'Developers', external: false },
] as const

/**
 * --t-data, not --t-label. These name destinations, which is the label step's
 * job, but --t-label is uppercase and tracked .16em -- a nav set that way
 * shouts over the wordmark beside it. The step is refused deliberately rather
 * than by oversight. design-system.md §2.
 */
const NAV_LINK: React.CSSProperties = {
  ...DATA,
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
      className="motion-press control-text tap-tall focus-ring"
      style={NAV_LINK}
    >
      {item.label}{item.external ? ' ↗' : ''}
    </a>
  ))

  const actions = (
    <>
      <Link href="/accounts" className="motion-press control-text tap-tall focus-ring" style={NAV_LINK}>
        My accounts
      </Link>
      <ActionLink href="/setup" variant="primary" className="px-3 py-1.5">
        Create account
      </ActionLink>
    </>
  )

  return <AppHeader nav={nav} actions={actions} />
}
