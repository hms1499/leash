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

export default function Label({
  className = '', style, children,
}: {
  className?: string
  /** Merged last, so a caller can recolour a label -- an error label is
   *  --bad -- without restating what makes it a label. */
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <span className={className} style={{ ...LABEL_STYLE, ...style }}>
      {children}
    </span>
  )
}
