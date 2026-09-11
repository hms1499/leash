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
      // Same 44px floor as Button, and for the same reason: this renders at
      // --t-data, which leaves a ~36px box on a phone. Keeping the two in step
      // matters because they sit side by side in the wizard header.
      className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 focus-ring ${className}`.trimEnd()}
      style={{
        fontFamily: 'var(--mono)', fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)',
        // Same corner as Button, from the same token. §10.
        borderRadius: 'var(--r-box)',
        ...tone[variant],
      }}
    >
      {children}
    </Link>
  )
}
