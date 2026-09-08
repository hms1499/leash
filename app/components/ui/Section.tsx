import { PAGE } from './page'
import { PROSE } from './prose'

export default function Section({
  id, eyebrow, title, description, children,
}: {
  id?: string
  eyebrow?: string
  title?: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={`${PAGE} scroll-mt-20 py-10 sm:py-14`}>
      {eyebrow && (
        <p
          className="mb-2"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-label)',
            lineHeight: 'var(--t-label-line)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--dim)',
          }}
        >
          {eyebrow}
        </p>
      )}
      {title && (
        <h2
          className={description ? '' : 'mb-4'}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-heading)',
            lineHeight: 'var(--t-heading-line)',
            fontWeight: 500,
            color: 'var(--text)',
          }}
        >
          {title}
        </h2>
      )}
      {description && (
        <p className="mt-2 mb-6" style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>
          {description}
        </p>
      )}
      {children}
    </section>
  )
}
