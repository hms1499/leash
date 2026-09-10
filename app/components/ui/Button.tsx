type Variant = 'primary' | 'ghost' | 'stop'

/**
 * `min-h-[44px]` is a touch target, not a type decision. The face below is
 * --t-data (13px), which with px-4 py-2 measured ~36px tall -- over WCAG 2.2's
 * 24 CSS px but under the 44pt iOS asks for, and MiniPay runs this on a phone
 * (spec §2.1). The extra height goes into the box, so the label keeps its step
 * and the scale is untouched. `inline-flex` is what makes the min-height do
 * anything: on an inline-block button the text would sit at the top of a
 * taller box.
 */
const BASE =
  'inline-flex items-center justify-center min-h-[44px] ' +
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
   * A control is looked at, not read, so it is mono (design-system §1) at the
   * one mono step in its neighbourhood. Neither the design system's type table
   * nor the plan assigns controls a step, but leaving them at the browser's
   * 16px default put a seventh size on every screen -- the exact defect the
   * scale exists to remove. NetworkBadge already renders this component at
   * label size, so a button below 16px is not new here.
   */
  const face: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 'var(--t-data)',
    lineHeight: 'var(--t-data-line)',
  }

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
      style={{ ...face, ...tone[variant], ...style }}
      {...rest}
    />
  )
}
