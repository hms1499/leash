import AgentTools from '../components/landing/AgentTools'
import Hero from '../components/landing/Hero'
import SiteHeader from '../components/landing/SiteHeader'
import UseCaseGrid from '../components/landing/UseCaseGrid'
import ProtectionModel from '../components/landing/ProtectionModel'
import HowItWorks from '../components/landing/HowItWorks'
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
        {/* After the four stages, because that section's own description ends
            "Connect MCP or the SDK afterwards, when the protected agent is
            already ready" -- this is the answer to that "afterwards". Before
            the security boundary, which stays second-to-last: "what breaks" is
            the last question a reader asks, not the one before they know what
            they would be installing. */}
        <Section
          id="developers"
          eyebrow="Agent tools"
          title="Three tools, and nothing else the agent can call"
          description="The MCP server is published on npm. Point any MCP client at it and the agent gets these three — every one of them bounded by the policy on your account."
        >
          <AgentTools />
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
