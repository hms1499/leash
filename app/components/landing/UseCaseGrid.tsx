import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { PROSE, SUBHEAD } from '../ui/prose'
import { GRID } from '../ui/page'

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

/**
 * Three-up only from `lg`. Measured 2026-09-11: a third of the page holds a
 * 229px card at 768 and its body runs at **21 characters a line** -- the exact
 * figure §16 exists to fix. Half the page at 768 is 356px and 35ch; a third at
 * 1024 is 315px and 31ch. The span changes where the measure says it must.
 */
export default function UseCaseGrid() {
  return (
    <div className={GRID}>
      {USE_CASES.map((useCase) => (
        <Panel key={useCase.title} className="col-span-12 flex h-full flex-col p-6 md:col-span-6 lg:col-span-4">
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
