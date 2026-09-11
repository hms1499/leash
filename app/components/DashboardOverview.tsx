import ActionLink from './ui/ActionLink'
import Address from './ui/Address'
import Label, { LABEL_STYLE } from './ui/Label'
import Panel from './ui/Panel'
import { formatDisplayAmount } from '../lib/policy.js'
import { accountHealth } from '../lib/accountHealth.js'
import { DATA, HEADING, PROSE } from './ui/prose'

export function AccountOverview({
  account, owner, connected, paused, loading, updatedAt, daily, perTx, balance,
  allowlistEnabled, operator, operatorLoading, agentTransactionsLeft,
}: {
  account: `0x${string}`
  owner: `0x${string}` | null
  connected?: `0x${string}`
  paused: boolean
  loading: boolean
  updatedAt: number | null
  daily: bigint
  perTx: bigint
  balance: bigint
  allowlistEnabled: boolean
  operator: string | null
  operatorLoading: boolean
  agentTransactionsLeft: number | null
}) {
  const isOwner = Boolean(owner && connected && owner.toLowerCase() === connected.toLowerCase())
  const role = !connected
    ? 'Public view — connect the owner wallet to manage this account.'
    : isOwner
      ? 'Owner controls enabled.'
      : 'Public view — the connected wallet is not the owner.'
  const summary = accountHealth({
    account, paused, loading, daily, perTx, balance, allowlistEnabled, operator,
    operatorLoading, agentTransactionsLeft, isOwner,
  })
  const tone = summary.tone === 'normal' ? 'var(--dim)' : `var(--${summary.tone})`

  return (
    <Panel as="section" className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Label className="block">Account status</Label>
          <h1
            className="mt-3"
            style={{
              color: summary.tone === 'bad' ? 'var(--bad)' : 'var(--text)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--t-title)',
              lineHeight: 'var(--t-title-line)',
              fontWeight: 600,
            }}
          >
            {summary.title}
          </h1>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ ...LABEL_STYLE, border: `1px solid ${tone}`, color: tone }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} aria-hidden="true" />
          {summary.badge}
        </span>
      </div>

      <p className="mt-3" style={{ ...PROSE, maxWidth: '62ch', color: 'var(--dim)' }}>
        {summary.body}
      </p>
      {summary.action && (
        <div className="mt-5">
          <ActionLink href={summary.action.href}>{summary.action.label}</ActionLink>
        </div>
      )}

      <div
        className="mt-6 flex flex-col gap-3 pt-6 sm:flex-row sm:items-end sm:justify-between"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <div>
          <Label className="block">Protected account</Label>
          <Address address={account} copy explorer className="num mt-2" />
        </div>
        <div className="sm:text-right">
          <p className="text-sm" style={{ color: 'var(--dim)' }}>{role}</p>
          <p className="mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>
            {updatedAt === null
              ? 'Reading Celo mainnet…'
              : `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
      </div>
    </Panel>
  )
}

export function SecurityPolicy({
  daily, perTx, allowlistEnabled, decimals, symbol,
}: {
  daily: bigint
  perTx: bigint
  allowlistEnabled: boolean
  decimals: number
  symbol: string
}) {
  // The third element says whether the value is money. CLAUDE.md: money on
  // screen uses `.num` (mono, tabular-nums) so digits do not reflow as values
  // update live -- and these come from the 4-second useAccountState poll, so
  // they do update live.
  const rows = [
    ['Daily limit', daily === 0n ? 'Not set' : `${formatDisplayAmount(daily, decimals)} ${symbol}`, daily !== 0n],
    ['Maximum direct payment', perTx === 0n ? 'Not set' : `${formatDisplayAmount(perTx, decimals)} ${symbol}`, perTx !== 0n],
    ['Approved recipients', allowlistEnabled ? 'On' : 'Off — any address', false],
  ] as const

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Contract rules</Label>
      <h2
        className="mt-2"
        style={{ ...HEADING, color: 'var(--text)' }}
      >
        Protection policy
      </h2>
      <div className="mt-4">
        {rows.map(([name, value, isMoney], index) => (
          <div
            key={name}
            className="flex flex-wrap justify-between gap-2 py-2"
            style={{ ...PROSE, borderTop: index === 0 ? 'none' : '1px solid var(--line)' }}
          >
            <span style={{ color: 'var(--dim)' }}>{name}</span>
            {/* Money is --t-data and mono (§2). This row is prose; the figure
                in it is not, and it was inheriting the row's 14px sans. */}
            <span className={isMoney ? 'num' : undefined} style={isMoney ? DATA : undefined}>{value}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-4 border-l-2 py-2 pl-3 text-sm [border-color:var(--bad)]"
        style={{ color: 'var(--dim)' }}
      >
        x402 moves funds to the agent wallet first. Recipient restrictions do
        not apply after those funds leave this account.
      </div>
    </Panel>
  )
}
