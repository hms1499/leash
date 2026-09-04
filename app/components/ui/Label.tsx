export default function Label({
  className = '', children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={className}
      style={{
        fontSize: '0.6875rem', letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--dim)',
      }}
    >
      {children}
    </span>
  )
}
