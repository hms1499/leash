import Link from 'next/link'

type Variant = 'primary' | 'ghost'

/** A navigation action with the same hierarchy as Button, without nesting a button inside a link. */
export default function ActionLink({
  href, variant = 'ghost', className = '', children,
}: {
  href: string
  variant?: Variant
  className?: string
  children: React.ReactNode
}) {
  const tone: Record<Variant, React.CSSProperties> = {
    primary: {
      background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700,
      outlineColor: 'var(--celo)',
    },
    ghost: {
      border: '1px solid var(--line-control)', color: 'var(--text)',
      outlineColor: 'var(--text)',
    },
  }
  return (
    <Link
      href={href}
      className={`rounded px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`.trimEnd()}
      style={{
        fontFamily: 'var(--mono)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)',
        ...tone[variant],
      }}
    >
      {children}
    </Link>
  )
}
