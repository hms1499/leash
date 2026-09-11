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
      className="focus-ring"
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
