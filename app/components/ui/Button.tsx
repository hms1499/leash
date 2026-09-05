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
  variant = 'ghost', className = '', style, onDangerBand = false, ...rest
}: {
  variant?: Variant
  /** This button sits on the paused header, whose ground is --bad. */
  onDangerBand?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  /**
   * `onDangerBand` says this button sits on the paused header, whose ground is
   * --bad. The ghost and stop variants are drawn in --text and --bad, which are
   * 3.16 and 1.00 against that ground -- the second being invisible. --bg is
   * 5.10 there, the same dark-on-bright treatment `primary` already uses on
   * Celo yellow. docs/design-system.md §4.
   */
  const tone: Record<Variant, React.CSSProperties> = {
    primary: { background: 'var(--celo)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--celo)' },
    ghost: onDangerBand
      ? { border: '1px solid var(--bg)', color: 'var(--bg)', outlineColor: 'var(--bg)' }
      : { border: '1px solid var(--line-control)', color: 'var(--text)', outlineColor: 'var(--text)' },
    stop: onDangerBand
      ? { border: '1px solid var(--bg)', color: 'var(--bg)', fontWeight: 700, outlineColor: 'var(--bg)' }
      : { border: '1px solid var(--bad)', color: 'var(--bad)', fontWeight: 700, outlineColor: 'var(--bad)' },
  }
  // Appended, not spread through `rest`. A caller passing className="mt-3"
  // would otherwise replace BASE outright and silently lose the cursor, the
  // focus ring and the disabled treatment -- the three things this component
  // exists to guarantee.
  return (
    <button
      className={`${BASE} ${className}`.trimEnd()}
      style={{ ...tone[variant], ...style }}
      {...rest}
    />
  )
}
