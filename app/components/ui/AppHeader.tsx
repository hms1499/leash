import BrandLink from './BrandLink'
import { PAGE } from './page'

/**
 * The frame every screen wears above its content.
 *
 * Before this there were four: the landing's nav, the dashboard's full-bleed
 * band, the accounts page's brand-and-badge, and the wizard's bare oversized
 * wordmark. §6 says a screen needing something none of the primitives provides
 * is a seventh primitive rather than a one-off, and four screens needing it is
 * the strongest case that rule will ever get.
 *
 * It is also what let `/accounts` render the bare word CELO in its top right
 * with nothing beside it saying that is a network. In a slot shared with the
 * dashboard's, it reads as the same thing it reads as there.
 *
 * `band="panel"` is the dashboard when it is not paused. The chrome sits on
 * --panel there so it reads as a layer above the page rather than as part of
 * it -- §13's rule that depth is a change of ground, never a shadow. The
 * landing, the wizard and the account list keep the page ground and a hairline.
 *
 * `band="danger"` is the paused dashboard. It puts --bad on the outer element
 * and PAGE on the content inside, so the ground spans the viewport while what
 * it holds stays on the page's column (§3) -- which is what makes the paused
 * state read as red edge to edge. It propagates `onBright` to the brand, so
 * nothing downstream re-derives which ground it is sitting on: that is the
 * arithmetic §4 exists to make impossible.
 */
export default function AppHeader({
  band = 'none', nav, actions,
}: {
  band?: 'none' | 'panel' | 'danger'
  /** The landing's three links. Hidden below the md breakpoint. */
  nav?: React.ReactNode
  /** Switcher, network badge, connect, create -- whatever the screen owns. */
  actions?: React.ReactNode
}) {
  const danger = band === 'danger'
  const ground: React.CSSProperties = danger
    ? { background: 'var(--bad)' }
    : band === 'panel'
      ? { background: 'var(--panel)', borderBottom: '1px solid var(--line)' }
      : { borderBottom: '1px solid var(--line)' }
  return (
    <header style={ground}>
      <nav
        aria-label="Primary"
        className={`${PAGE} flex min-h-16 items-center justify-between gap-3`}
      >
        <BrandLink onBright={danger} />
        {nav && <div className="hidden items-center gap-6 md:flex">{nav}</div>}
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </nav>
    </header>
  )
}
