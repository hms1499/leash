import Link from 'next/link'
import Hero from '../components/landing/Hero'
import Contrast from '../components/landing/Contrast'
import HowItWorks from '../components/landing/HowItWorks'
import AgentTools from '../components/landing/AgentTools'
import LiveProof from '../components/landing/LiveProof'
import ProofTable from '../components/landing/ProofTable'
import Section from '../components/ui/Section'
import Button from '../components/ui/Button'

export default function Landing() {
  return (
    <main>
      <Hero />
      <Section><LiveProof /></Section>
      <Section title="The difference"><Contrast /></Section>
      <Section title="How it works"><HowItWorks /></Section>
      <Section title="What your agent gets"><AgentTools /></Section>
      <Section title="Proven on Celo mainnet"><ProofTable /></Section>
      <Section>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/setup"><Button variant="primary">Build your own</Button></Link>
          <a className="text-sm" style={{ color: 'var(--dim)' }}
             href="https://github.com/hms1499/leash" target="_blank" rel="noreferrer">
            github ↗
          </a>
        </div>
      </Section>
    </main>
  )
}
