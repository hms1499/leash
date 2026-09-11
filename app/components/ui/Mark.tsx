/**
 * The mark: two cubes, stacked, meeting at a point.
 *
 * §15 said there was no iconography and that a real icon would need a rule
 * about size, stroke and alignment before it could arrive. This is that icon,
 * and §17 is that rule.
 *
 * ## What it is drawn from
 *
 * Everything here is `currentColor` and nothing is a stroke. A stroke has a
 * width that does not scale with the type step the mark is set at, so a
 * wordmark at `--t-label` and a hero at `--t-title` would carry two different
 * line weights; filled geometry scales exactly. It also means the mark takes
 * §4's ground rule for free -- on the paused header it inherits `--bg` from
 * `.on-bright` along with everything else, and there is no second place where
 * a colour has to be remembered.
 *
 * The viewBox is 10 wide and 21 tall, which is the source drawing's
 * proportion (measured 1:2.12) resolved onto whole units: each cube is a
 * 10-wide rhombus 5 tall over a 5.5-tall body, and the lower cube's top
 * vertex is the upper cube's bottom vertex.
 *
 * The top faces are open -- an outline rather than a fill -- which is the
 * whole character of the drawing: a container with its lid off, which is what
 * this product is. The outline is 0.5 units, 5% of the mark's width, because
 * at 16px a thinner one disappears into a grey smudge. The seam down the
 * middle of each cube is a wedge 0.7 wide under the rhombus tapering to
 * nothing at the bottom vertex, and it is what keeps the two side faces from
 * reading as one black shape.
 */
export default function Mark({
  size = 'var(--t-label)', className = '', style,
}: {
  /** Any CSS length. A type step by default, so the mark rides the scale. */
  size?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 10 21"
      // Height drives it and the width follows from the viewBox, so the mark
      // is measured the way the type beside it is: by how tall it is.
      style={{ height: size, width: 'auto', display: 'block', ...style }}
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {/* Upper cube: the open lid, then the two faces under it. */}
      <path fillRule="evenodd" d="M5 0 10 2.5 5 5 0 2.5Z M5 0.56 8.88 2.5 5 4.44 1.12 2.5Z" />
      <path d="M0 2.5 4.65 5 5 10.5 0 8Z" />
      <path d="M10 2.5 5.35 5 5 10.5 10 8Z" />
      {/* Lower cube: the same, dropped by one cube. */}
      <path fillRule="evenodd" d="M5 10.5 10 13 5 15.5 0 13Z M5 11.06 8.88 13 5 14.94 1.12 13Z" />
      <path d="M0 13 4.65 15.5 5 21 0 18.5Z" />
      <path d="M10 13 5.35 15.5 5 21 10 18.5Z" />
    </svg>
  )
}
