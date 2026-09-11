import Label, { LABEL_STYLE } from '../ui/Label'
import Panel from '../ui/Panel'
import { PROSE } from '../ui/prose'

function RoleRow({
  role, body,
}: {
  role: string
  body: string
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <span style={{ ...LABEL_STYLE, color: 'var(--text)' }}>
        {role}
      </span>
      <span style={{ ...PROSE, color: 'var(--dim)' }}>{body}</span>
    </div>
  )
}

export default function ProtectionModel() {
  return (
    <Panel className="overflow-hidden">
      <div className="grid sm:grid-cols-[1fr_auto_1fr]">
        <div className="p-6">
          <Label>Protected account</Label>
          <p
            className="num mt-4 font-semibold"
            style={{ fontSize: 'var(--t-title)', color: 'var(--text)' }}
          >
            Most USDC
          </p>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            Held by the contract. Per-payment and daily limits are enforced
            before funds can move.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2" style={LABEL_STYLE} aria-label="Protected account controls">
            {['Per-payment cap', 'Daily cap', 'Optional payees'].map((item) => (
              <li
                key={item}
                className="rounded-full px-3 py-1.5"
                style={{ border: '1px solid var(--line-control)', color: 'var(--dim)' }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="flex items-center justify-center border-y px-4 py-3 sm:flex-col sm:border-x sm:border-y-0 sm:px-3 [border-color:var(--line)]"
          style={{ color: 'var(--dim)' }}
        >
          <span className="num text-center" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)' }}>capped top-up</span>
          <span className="ml-2 sm:hidden" aria-hidden="true">↓</span>
          <span className="mt-2 hidden sm:inline" aria-hidden="true">→</span>
        </div>

        <div className="p-6">
          <Label>Agent wallet</Label>
          <p
            className="num mt-4 font-semibold"
            style={{ fontSize: 'var(--t-title)', color: 'var(--text)' }}
          >
            Small USDC float
          </p>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            A hot operator key for gas and x402. Anything already here is
            outside the contract&apos;s protections.
          </p>
          <p className="mt-6" style={{ ...PROSE, color: 'var(--dim)' }}>
            Keep only what the next few tasks need.
          </p>
        </div>
      </div>

      <div className="px-6" style={{ borderTop: '1px solid var(--line)' }}>
        <RoleRow
          role="Owner wallet"
          body="Creates the account, sets policy, authorizes operators, pauses activity and recovers funds."
        />
        <div style={{ borderTop: '1px solid var(--line)' }} />
        <RoleRow
          role="Agent operator"
          body="Requests payments or a bounded top-up. It cannot change limits, unpause itself or sweep the protected balance."
        />
      </div>
    </Panel>
  )
}
