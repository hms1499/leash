import Hero from '../components/landing/Hero'
import SiteHeader from '../components/landing/SiteHeader'
import UseCaseGrid from '../components/landing/UseCaseGrid'
import ProtectionModel from '../components/landing/ProtectionModel'
import HowItWorks from '../components/landing/HowItWorks'
import LiveProof from '../components/landing/LiveProof'
import CoreCapabilities from '../components/landing/CoreCapabilities'
import SecurityBoundary from '../components/landing/SecurityBoundary'
import FinalCta from '../components/landing/FinalCta'
import SiteFooter from '../components/landing/SiteFooter'
import Section from '../components/ui/Section'

export default function Landing() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Section
          id="use-cases"
          eyebrow="Use cases"
          title="Built for agents that need to spend, not hold unlimited funds"
          description="Use Leash when an automated workflow needs real payment capability and you need a hard ceiling on the damage it can cause."
        >
          <UseCaseGrid />
        </Section>
        <Section
          id="protection-model"
          eyebrow="Protection model"
          title="Keep the budget and the hot key separate"
          description="Most funds stay in a contract you own. The agent gets permission to request bounded spends plus only a small operating balance."
        >
          <ProtectionModel />
        </Section>
        <Section
          id="live-proof"
          eyebrow="Live product proof"
          title="A real account, not a mockup"
          description="This dashboard reads policy, balance and recent activity directly from a deployed account on Celo mainnet. No wallet connection is required."
        >
          <LiveProof />
        </Section>
        <Section
          id="capabilities"
          eyebrow="Core capabilities"
          title="The controls a production agent wallet actually needs"
        >
          <CoreCapabilities />
        </Section>
        <Section
          id="how-it-works"
          eyebrow="Setup"
          title="From owner wallet to ready agent in four stages"
          description="Provisioning stays focused on the on-chain account. Connect MCP or the SDK afterwards, when the protected agent is already ready."
        >
          <HowItWorks />
        </Section>
        <Section
          id="security"
          eyebrow="Security boundary"
          title="Know exactly what is—and is not—protected"
          description="Leash limits an operator; it does not make a hot key safe. The boundary below is part of the product, not fine print."
        >
          <SecurityBoundary />
        </Section>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
