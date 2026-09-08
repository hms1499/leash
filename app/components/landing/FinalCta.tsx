import ActionLink from '../ui/ActionLink'
import Panel from '../ui/Panel'
import { PAGE } from '../ui/page'
import { PROSE } from '../ui/prose'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2'

export default function FinalCta() {
  return (
    <section className={`${PAGE} py-10 sm:py-14`} aria-labelledby="final-cta-title">
      <Panel className="p-6 sm:p-8">
        <h2
          id="final-cta-title"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--t-heading)',
            lineHeight: 'var(--t-heading-line)',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          Ready to give your agent a hard spending limit?
        </h2>
        <p className="mt-3" style={{ ...PROSE, maxWidth: '60ch', color: 'var(--dim)' }}>
          Create an account you own, choose the limits, and verify every readiness condition before the agent starts working.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ActionLink href="/setup" variant="primary">Create protected account</ActionLink>
          <ActionLink href={`/a/${ACCOUNT}`}>View live dashboard</ActionLink>
        </div>
      </Panel>
    </section>
  )
}
