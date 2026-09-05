import Panel from '../ui/Panel'
import { PROSE } from '../ui/prose'

const STEPS = [
  { n: '1', title: 'Deploy your account', body: 'One transaction. You are the owner; nobody else can change the limits.' },
  { n: '2', title: 'Set the limits', body: 'A cap per transaction and a cap per day, in USDC. Until you set them, every spend is refused.' },
  { n: '3', title: 'Hand your agent the key', body: 'Paste one block into .mcp.json. The key it receives cannot raise its own limits.' },
]

export default function HowItWorks() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {STEPS.map((s) => (
        <Panel key={s.n} className="p-6">
          <span className="num text-sm" style={{ color: 'var(--celo)' }}>{s.n}</span>
          <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.title}</p>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{s.body}</p>
        </Panel>
      ))}
    </div>
  )
}
