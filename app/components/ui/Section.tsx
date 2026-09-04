import Label from './Label'

export default function Section({
  id, title, children,
}: { id?: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="w-full max-w-3xl mx-auto px-4 py-10 sm:py-14">
      {title && <div className="mb-4"><Label>{title}</Label></div>}
      {children}
    </section>
  )
}
