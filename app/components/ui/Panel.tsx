export default function Panel({
  className = '', children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}
    >
      {children}
    </div>
  )
}
