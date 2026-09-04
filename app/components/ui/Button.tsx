type Variant = 'primary' | 'ghost' | 'stop'

const BASE =
  'rounded cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 px-4 py-2'

/**
 * Tailwind 3's preflight resets button cursors to `auto`, so the pointer is
 * set here rather than inherited. And a disabled button used to render
 * identically to a live one -- only the label changed -- which on a control
 * that spends real money is the wrong thing to leave ambiguous.
 *
 * The focus ring is ours to build: no component library ships in this project
 * (spec §2.2), so nothing supplies it if this does not.
 */
export default function Button({
  variant = 'ghost', style, ...rest
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone: Record<Variant, React.CSSProperties> = {
    primary: { background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--celo)' },
    ghost: { border: '1px solid var(--line)', color: 'var(--text)', outlineColor: 'var(--text)' },
    stop: { border: '1px solid var(--bad)', color: 'var(--bad)', fontWeight: 700, letterSpacing: '0.1em', outlineColor: 'var(--bad)' },
  }
  return <button className={BASE} style={{ ...tone[variant], ...style }} {...rest} />
}
