import { PAGE } from './page'
export default function Section({
  id, title, children,
}: { id?: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${PAGE} py-12`}>
      {title && (
        <h2
          className="mb-3"
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
      {children}
    </section>
  )
}
