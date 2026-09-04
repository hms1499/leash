import Link from 'next/link'

export default function Landing() {
  return (
    <main className="p-8">
      <h1 style={{ color: 'var(--celo)', letterSpacing: '.26em' }}>LEASH</h1>
      <Link href="/setup">Build your own</Link>
    </main>
  )
}
