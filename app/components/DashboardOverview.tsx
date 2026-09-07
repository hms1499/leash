import Address from './ui/Address'
import Label from './ui/Label'
import Panel from './ui/Panel'
import { formatAmount } from '../lib/policy.js'

export function AccountStatus({
  account, owner, connected, paused, loading, updatedAt,
}: {
  account: `0x${string}`
  owner: `0x${string}` | null
  connected?: `0x${string}`
  paused: boolean
  loading: boolean
  updatedAt: number | null
}) {
  const role = !connected
    ? 'View-only — connect the owner wallet to manage this account'
    : owner?.toLowerCase() === connected.toLowerCase()
      ? 'Owner controls enabled'
      : 'View-only — the connected wallet is not the owner'

  return (
    <Panel as="section" className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Label className="block">Account status</Label>
          <p className="mt-2" style={{ fontSize: 'var(--t-heading)', color: paused ? 'var(--bad)' : 'var(--text)' }}>
            {loading ? 'Reading account status' : paused ? 'Agent stopped' : 'Agent active'}
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>{role}</p>
        </div>
        <div className="text-right">
          <Address address={account} copy explorer className="num" />
          <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
            {updatedAt === null
              ? 'Reading Celo…'
              : `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
      </div>
    </Panel>
  )
}

export function RecommendedAction({
  account, paused, daily, balance, operator, operatorLoading,
}: {
  account: `0x${string}`
  paused: boolean
  daily: bigint
  balance: bigint
  operator: string | null
  operatorLoading: boolean
}) {
  let title = 'Everything is ready'
  let body = 'The agent can make direct payments within the limits below.'
  let tone: 'normal' | 'bad' = 'normal'

  if (paused) {
    title = 'The agent is stopped'
    body = 'Every agent payment is refused until the owner resumes this account.'
    tone = 'bad'
  } else if (daily === 0n) {
    title = 'Set spending limits'
    body = 'The account refuses every payment until a daily and per-payment limit are configured.'
    tone = 'bad'
  } else if (operatorLoading) {
    title = 'Verifying the agent wallet'
    body = 'Reading recent account history and checking agent access on chain.'
  } else if (!operator) {
    title = 'Verify the agent wallet'
    body = 'No active agent was found in the recent account history. Return to setup to add or verify one.'
    tone = 'bad'
  } else if (balance === 0n) {
    title = 'Add protected funds'
    body = `Send USDC on Celo to ${account}. The agent cannot make a direct payment while the policy account is empty.`
    tone = 'bad'
  }

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Recommended action</Label>
      <p className="mt-2" style={{ fontSize: 'var(--t-heading)', color: tone === 'bad' ? 'var(--bad)' : 'var(--text)' }}>
        {title}
      </p>
      <p className="text-sm mt-2" style={{ color: 'var(--dim)', maxWidth: '68ch' }}>{body}</p>
    </Panel>
  )
}

export function SecurityPolicy({
  daily, perTx, allowlistEnabled, operator, operatorLoading, decimals, symbol,
}: {
  daily: bigint
  perTx: bigint
  allowlistEnabled: boolean
  operator: string | null
  operatorLoading: boolean
  decimals: number
  symbol: string
}) {
  const rows = [
    ['Daily limit', daily === 0n ? 'Not set' : `${formatAmount(daily, decimals, 2)} ${symbol}`],
    ['Maximum direct payment', perTx === 0n ? 'Not set' : `${formatAmount(perTx, decimals, 2)} ${symbol}`],
    ['Approved recipients', allowlistEnabled ? 'On' : 'Off — any address'],
    ['Primary agent', operator ?? (operatorLoading ? 'Checking…' : 'Not discovered')],
  ]

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Security policy</Label>
      <div className="mt-3">
        {rows.map(([name, value], index) => (
          <div
            key={name}
            className="flex flex-wrap justify-between gap-2 py-2 text-sm"
            style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line)' }}
          >
            <span style={{ color: 'var(--dim)' }}>{name}</span>
            <span className={name === 'Primary agent' && operator ? 'num' : ''}>{value}</span>
          </div>
        ))}
      </div>
      <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
        x402 payments move funds to the agent wallet first. Recipient restrictions
        no longer apply after those funds leave the policy account.
      </p>
    </Panel>
  )
}
