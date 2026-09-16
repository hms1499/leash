import Panel from '../ui/Panel'
import { DATA, PROSE, SUBHEAD } from '../ui/prose'
import { GRID } from '../ui/page'

const STEPS = [
  // "permanently own" until 2026-09-16, which was a v1 sentence: v1's owner was
  // `immutable` and this one is not. Nobody can take the account from you, and
  // you can still hand it on -- "outright" says the first without denying the
  // second.
  { n: '1', title: 'Create the account', body: 'You deploy and own the protected account outright. It holds the agent’s budget.' },
  { n: '2', title: 'Set protection', body: 'Choose a cap per payment, a cap per UTC day, and optional approved recipients.' },
  { n: '3', title: 'Authorize and fund', body: 'Fund the protected budget, then give a separate agent wallet limited access and a small USDC gas balance.' },
  // The second sentence is the only place on this page that says /accounts
  // exists. It was reachable from the header and the footer and described
  // nowhere, so the one thing it saves a reader from -- losing the address --
  // was something they found out by losing it.
  { n: '4', title: 'Review and monitor', body: 'Verify readiness, watch activity, and stop the agent whenever needed. Connect the owner wallet on any machine and its accounts are found again, so there is no address to write down.' },
]

export default function HowItWorks() {
  return (
    <div className={GRID}>
      {STEPS.map((s) => (
        <Panel key={s.n} className="col-span-12 p-6 md:col-span-6">
          <span className="num" style={{ ...DATA, color: 'var(--celo)' }}>{s.n}</span>
          <h3 className="mt-2" style={{ ...SUBHEAD, color: 'var(--text)' }}>{s.title}</h3>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{s.body}</p>
        </Panel>
      ))}
    </div>
  )
}
