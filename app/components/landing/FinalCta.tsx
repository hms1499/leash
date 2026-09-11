import ActionLink from '../ui/ActionLink'
import Panel from '../ui/Panel'
import { PAGE } from '../ui/page'
import { HEADING, PROSE } from '../ui/prose'

export default function FinalCta() {
  return (
    <section className={`${PAGE} py-12 sm:py-12`} aria-labelledby="final-cta-title">
      <Panel className="p-6 sm:p-12">
        <h2
          id="final-cta-title"
          style={{ ...HEADING, color: 'var(--text)' }}
        >
          Ready to give your agent a hard spending limit?
        </h2>
        <p className="mt-3" style={{ ...PROSE, maxWidth: '60ch', color: 'var(--dim)' }}>
          Create an account you own, choose the limits, and verify every readiness condition before the agent starts working.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ActionLink href="/setup" variant="primary">Create protected account</ActionLink>
          <ActionLink href="#live-proof">View live dashboard</ActionLink>
        </div>
      </Panel>
    </section>
  )
}
