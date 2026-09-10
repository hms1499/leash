/**
 * The type treatment, exported separately so a component that must render its
 * own element -- Address owns a <button> and its copy state -- can wear
 * the label look without a second copy of these four values.
 */
export const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--t-label)',
  lineHeight: 'var(--t-label-line)',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
}

/**
 * The remaining span attributes pass through. A label is a span with four
 * fixed values, and a closed prop list meant a caller that needed one ARIA
 * attribute -- Meter states its band in a label, and that band has to
 * announce itself -- had to abandon the primitive and hand-write the look.
 * That is how LABEL_STYLE came to be exported in the first place.
 */
export default function Label({
  className = '', style, children, ...rest
}: {
  /** Merged last, so a caller can recolour a label -- an error label is
   *  --bad -- without restating what makes it a label. */
  style?: React.CSSProperties
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'style' | 'children'>) {
  return (
    <span className={className} style={{ ...LABEL_STYLE, ...style }} {...rest}>
      {children}
    </span>
  )
}
