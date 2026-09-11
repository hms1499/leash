import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { PROSE, SUBHEAD } from '../ui/prose'

const CAPABILITIES = [
  {
    label: 'Spending policy',
    title: 'Two hard limits',
    body: 'Set a maximum for one payment and a separate maximum for each UTC day.',
  },
  {
    label: 'Recipients',
    title: 'Optional direct-pay allowlist',
    body: 'Restrict execute payments to known addresses when the workflow has a fixed recipient set.',
  },
  {
    label: 'Owner controls',
    title: 'Pause and recover',
    body: 'Stop every operator path, then sweep funds as the owner without being blocked by the agent policy.',
  },
  {
    label: 'Operations',
    title: 'Separate gas health',
    body: 'Track the protected budget and the agent’s small USDC gas reserve as two different balances.',
  },
  {
    label: 'Agent tools',
    title: 'Pay, check and fetch',
    body: 'Expose status, direct payment and x402 purchasing through the MCP server or TypeScript SDK.',
  },
  {
    label: 'Observability',
    title: 'Public, verifiable activity',
    body: 'Read limits, remaining allowance, balance and recent events without connecting a wallet.',
  },
] as const

export default function CoreCapabilities() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CAPABILITIES.map((capability) => (
        <Panel key={capability.title} className="p-5">
          <Label>{capability.label}</Label>
          <h3
            className="mt-3"
            style={{ ...SUBHEAD, color: 'var(--text)' }}
          >
            {capability.title}
          </h3>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            {capability.body}
          </p>
        </Panel>
      ))}
    </div>
  )
}
