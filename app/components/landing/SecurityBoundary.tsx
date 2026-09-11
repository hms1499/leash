import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { PROOFS } from '../../lib/proofs.js'
import { PROSE, SUBHEAD } from '../ui/prose'

const PROTECTED = [
  'Every operator draw is bounded by the per-payment and daily caps.',
  'Only the owner can change policy, authorize operators, pause or sweep.',
  'The deployed rules are not a proxy and cannot be upgraded behind you.',
] as const

const NOT_PROTECTED = [
  'USDC already in the agent wallet is outside the contract.',
  'The payee allowlist cannot constrain top-ups used for x402.',
  'A lost owner key cannot be replaced, and the contract has not been audited.',
] as const

const EVIDENCE = [PROOFS[0], PROOFS[2], PROOFS[4]]

function BoundaryList({
  title, items, tone,
}: {
  title: string
  items: readonly string[]
  tone: 'ok' | 'bad'
}) {
  return (
    <div className="p-6">
      <Label style={{ color: `var(--${tone})` }}>{title}</Label>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="grid grid-cols-[auto_1fr] gap-3">
            <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: `var(--${tone})` }} aria-hidden="true">
              {tone === 'ok' ? '✓' : '!'}
            </span>
            <span style={{ ...PROSE, color: 'var(--dim)' }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SecurityBoundary() {
  return (
    <div className="flex flex-col gap-4">
      <Panel className="grid overflow-hidden sm:grid-cols-2">
        <BoundaryList title="Protected by Leash" items={PROTECTED} tone="ok" />
        <div className="border-t sm:border-l sm:border-t-0 [border-color:var(--line)]">
          <BoundaryList title="Outside the boundary" items={NOT_PROTECTED} tone="bad" />
        </div>
      </Panel>

      <Panel>
        <div className="p-6" style={{ borderBottom: '1px solid var(--line)' }}>
          <Label>On-chain evidence</Label>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            The important claims below link to transactions you can inspect yourself.
          </p>
        </div>
        {EVIDENCE.map((proof, index) => (
          <a
            key={proof.url}
            href={proof.url}
            target="_blank"
            rel="noreferrer"
            className="grid gap-2 p-6 focus-ring-inset sm:grid-cols-[1fr_auto] sm:items-center"
            style={{
              borderTop: index === 0 ? 'none' : '1px solid var(--line)',
              color: 'var(--text)',
              outlineColor: 'var(--text)',
            }}
          >
            <span style={SUBHEAD}>{proof.claim}</span>
            {/* A name for a destination, but not the label step: uppercase and
                tracked inside a table row would shout over the claim beside it. */}
            <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: 'var(--dim)' }}>View transaction ↗</span>
          </a>
        ))}
      </Panel>
    </div>
  )
}
