import Link from 'next/link'
import Mark from './Mark'

/** The brand is always an escape route, including from public account links. */
export default function BrandLink({
  large = false, onBright = false,
}: {
  large?: boolean
  onBright?: boolean
}) {
  return (
    <Link
      href="/"
      aria-label="Leash home"
      // The 44px floor goes in the box, as it does on Button and ActionLink,
      // not in a .tap-tall pseudo-element: that one extends the hit area
      // without extending the box, and e2e/reach.spec.ts measures the
      // rendered box on purpose -- a class can be present and beaten by a
      // more specific rule. Address wears the pseudo-element because its 42
      // characters have to stay free to wrap; a six-letter wordmark does not.
      //
      // Measured 2026-09-11 at 375px: 14.3px. Every screen had this and only
      // the wizard was checked, where `large` was hiding it. Moving the four
      // headers onto AppHeader made the brand one size everywhere and the
      // test finally saw it.
      className="motion-press focus-ring inline-flex items-center gap-2 min-h-[44px]"
      style={{
        // A mark laid over text, not a box: the wordmark has no inside. §10.
        borderRadius: 'var(--r-mark)',
        fontFamily: 'var(--mono)',
        fontSize: large ? 'var(--t-title)' : 'var(--t-label)',
        lineHeight: large ? 'var(--t-title-line)' : 'var(--t-label-line)',
        color: onBright ? 'var(--bg)' : 'var(--celo)',
        letterSpacing: '.26em',
        fontWeight: large ? 500 : 700,
        outlineColor: onBright ? 'var(--bg)' : 'var(--celo)',
      }}
    >
      {/* The mark is 1:2.1 -- tall and narrow -- so sized at the type step
          beside it, it would be seven pixels wide and read as a smudge. §17:
          a mark is set by its height against the cap height of the type it
          sits with, and this one needs twice the step to carry. */}
      <Mark size={large ? 'calc(var(--t-title) * 1.6)' : 'calc(var(--t-label) * 2)'} />
      LEASH
    </Link>
  )
}
