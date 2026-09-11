import Link from 'next/link'

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
      className="focus-ring inline-flex items-center min-h-[44px]"
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
      LEASH
    </Link>
  )
}
