export default function Panel({
  as: Tag = 'div', className = '', children,
}: {
  /** The wizard's steps are <section> elements and were before this component
   *  existed. The surface is a look, not a semantic, so it does not get to
   *  decide the element. */
  as?: 'div' | 'section'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      className={className}
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}
    >
      {children}
    </Tag>
  )
}
