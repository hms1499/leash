import Panel from '../ui/Panel'
import { DATA, PROSE, SUBHEAD } from '../ui/prose'

const STEPS = [
  { n: '1', title: 'Create the account', body: 'You deploy and permanently own the protected account. It holds the agent’s budget.' },
  { n: '2', title: 'Set protection', body: 'Choose a cap per payment, a cap per UTC day, and optional approved recipients.' },
  { n: '3', title: 'Authorize and fund', body: 'Fund the protected budget, then give a separate agent wallet limited access and a small USDC gas balance.' },
  { n: '4', title: 'Review and monitor', body: 'Verify readiness, watch activity from the dashboard, and stop the agent whenever needed.' },
]

export default function HowItWorks() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {STEPS.map((s) => (
        <Panel key={s.n} className="p-6">
          <span className="num" style={{ ...DATA, color: 'var(--celo)' }}>{s.n}</span>
          <h3 className="mt-2" style={{ ...SUBHEAD, color: 'var(--text)' }}>{s.title}</h3>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{s.body}</p>
        </Panel>
      ))}
    </div>
  )
}
