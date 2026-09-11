import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { PROSE, SUBHEAD } from '../ui/prose'

const USE_CASES = [
  {
    label: 'Metered services',
    title: 'Buy APIs and compute over x402',
    body: 'Let an agent quote and pay for a metered resource while every draw still counts against its daily budget.',
  },
  {
    label: 'Automated payouts',
    title: 'Pay known vendors or contributors',
    body: 'Use per-payment limits and an optional recipient allowlist for direct USDC transfers from the protected account.',
  },
  {
    label: 'Long-running agents',
    title: 'Give automation a fixed spending envelope',
    body: 'Run workflows without keeping the full budget beside the agent key. Pause the operator without locking the owner out.',
  },
] as const

export default function UseCaseGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {USE_CASES.map((useCase) => (
        <Panel key={useCase.title} className="flex h-full flex-col p-6">
          <Label>{useCase.label}</Label>
          <h3
            className="mt-4"
            style={{ ...SUBHEAD, color: 'var(--text)' }}
          >
            {useCase.title}
          </h3>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            {useCase.body}
          </p>
        </Panel>
      ))}
    </div>
  )
}
