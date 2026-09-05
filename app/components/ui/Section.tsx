export default function Section({
  id, title, children,
}: { id?: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="w-full max-w-3xl mx-auto px-4 py-12">
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
