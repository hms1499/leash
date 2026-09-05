import Hero from '../components/landing/Hero'
import Contrast from '../components/landing/Contrast'
import HowItWorks from '../components/landing/HowItWorks'
import AgentTools from '../components/landing/AgentTools'
import LiveProof from '../components/landing/LiveProof'
import ProofTable from '../components/landing/ProofTable'
import Questions from '../components/landing/Questions'
import Footer from '../components/landing/Footer'
import Section from '../components/ui/Section'

/**
 * The order is the order a reader asks the questions, not the order the
 * sections were written:
 *
 *   what is it        the hero
 *   is it real        the live account, read from mainnet
 *   why bother        without Leash, and with it
 *   how does it work  three steps
 *   prove it          five claims, each with a transaction
 *   what breaks       the questions worth asking, answered
 *   how do I use it   the tools and the .mcp.json block
 *
 * The last two used to be reversed, so a reader who is not a developer met a
 * wall of JSON before reaching the evidence. Implementation is the last thing
 * anyone needs and the first thing that stops a non-developer reading.
 */
export default function Landing() {
  return (
    <main>
      <Hero />
      <Section title="What an account looks like right now"><LiveProof /></Section>
      <Section title="Why not just give the agent a wallet?"><Contrast /></Section>
      <Section title="How it works"><HowItWorks /></Section>
      <Section title="Proven on Celo mainnet"><ProofTable /></Section>
      <Section title="Questions worth asking"><Questions /></Section>
      <Section title="What your agent gets"><AgentTools /></Section>
      <Section><Footer /></Section>
    </main>
  )
}
