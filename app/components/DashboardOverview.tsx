import ActionLink from './ui/ActionLink'
import Address from './ui/Address'
import Label from './ui/Label'
import Panel from './ui/Panel'
import { formatDisplayAmount } from '../lib/policy.js'
import { PROSE } from './ui/prose'

type Summary = {
  badge: string
  title: string
  body: string
  tone: 'normal' | 'ok' | 'bad'
  action?: { href: string; label: string }
}

function accountSummary({
  account, paused, loading, daily, perTx, balance, operator, operatorLoading,
  agentTransactionsLeft, isOwner,
}: {
  account: `0x${string}`
  paused: boolean
  loading: boolean
  daily: bigint
  perTx: bigint
  balance: bigint
  operator: string | null
  operatorLoading: boolean
  agentTransactionsLeft: number | null
  isOwner: boolean
}): Summary {
  if (loading) {
    return {
      badge: 'Syncing',
      title: 'Reading the protected account',
      body: 'Checking policy, balance and owner controls directly on Celo.',
      tone: 'normal',
    }
  }
  if (paused) {
    return {
      badge: 'Paused',
      title: 'Agent spending is stopped',
      body: isOwner
        ? 'Every operator payment is refused. Use Resume in the header when it is safe to continue.'
        : 'Every operator payment is refused until the owner resumes this account.',
      tone: 'bad',
    }
  }
  if (daily === 0n || perTx === 0n) {
    return {
      badge: 'Needs setup',
      title: 'Set the spending limits',
      body: 'The contract refuses every payment until both a daily and per-payment limit are configured.',
      tone: 'bad',
      action: isOwner ? { href: '#policy-controls', label: 'Manage protection' } : undefined,
    }
  }
  if (operatorLoading) {
    return {
      badge: 'Checking',
      title: 'Verifying agent access',
      body: 'Reading account history and confirming the operator against the contract.',
      tone: 'normal',
    }
  }
  if (!operator) {
    return {
      badge: 'Needs setup',
      title: 'Add or verify an agent wallet',
      body: 'No active operator could be verified for this protected account.',
      tone: 'bad',
      action: isOwner ? { href: '#policy-controls', label: 'Manage protection' } : undefined,
    }
  }
  if (balance === 0n) {
    return {
      badge: 'Needs funds',
      title: 'Fund the protected account',
      body: `Send USDC on Celo to ${account}. Direct payments cannot succeed while the protected balance is empty.`,
      tone: 'bad',
    }
  }
  if (agentTransactionsLeft === null) {
    return {
      badge: 'Checking',
      title: 'Checking agent gas',
      body: 'Reading the agent wallet’s USDC balance before marking it ready.',
      tone: 'normal',
    }
  }
  if (agentTransactionsLeft === 0) {
    return {
      badge: 'Needs gas',
      title: 'Refuel the agent wallet',
      body: 'The protected account is funded, but the agent cannot send its next transaction.',
      tone: 'bad',
      action: isOwner ? { href: '#agent-funds', label: 'Refuel agent' } : undefined,
    }
  }
  return {
    badge: 'Ready',
    title: 'Agent is ready to spend',
    body: 'Policy, protected funds, operator access and agent gas are all available.',
    tone: 'ok',
  }
}

export function AccountOverview({
  account, owner, connected, paused, loading, updatedAt, daily, perTx, balance,
  operator, operatorLoading, agentTransactionsLeft,
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
  const summary = accountSummary({
    account, paused, loading, daily, perTx, balance, operator, operatorLoading,
    agentTransactionsLeft, isOwner,
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
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          style={{ border: `1px solid ${tone}`, color: tone, fontFamily: 'var(--mono)' }}
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
        className="mt-6 flex flex-col gap-3 pt-4 sm:flex-row sm:items-end sm:justify-between"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <div>
          <Label className="block">Protected account</Label>
          <Address address={account} copy explorer className="num mt-2" />
        </div>
        <div className="sm:text-right">
          <p className="text-sm" style={{ color: 'var(--dim)' }}>{role}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--dim)' }}>
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
    ['Daily limit', daily === 0n ? 'Not set' : `${formatDisplayAmount(daily, decimals)} ${symbol}`],
    ['Maximum direct payment', perTx === 0n ? 'Not set' : `${formatDisplayAmount(perTx, decimals)} ${symbol}`],
    ['Approved recipients', allowlistEnabled ? 'On' : 'Off — any address'],
  ] as const

  return (
    <Panel as="section" className="p-6">
      <Label className="block">Contract rules</Label>
      <h2
        className="mt-2"
        style={{ fontFamily: 'var(--mono)', fontSize: 'var(--t-heading)', color: 'var(--text)' }}
      >
        Protection policy
      </h2>
      <div className="mt-4">
        {rows.map(([name, value], index) => (
          <div
            key={name}
            className="flex flex-wrap justify-between gap-2 py-2 text-sm"
            style={{ borderTop: index === 0 ? 'none' : '1px solid var(--line)' }}
          >
            <span style={{ color: 'var(--dim)' }}>{name}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="flex flex-wrap justify-between gap-2 py-2 text-sm" style={{ borderTop: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--dim)' }}>Primary agent</span>
          {operator ? (
            <Address address={operator} explorer className="num" />
          ) : (
            <span>{operatorLoading ? 'Checking…' : 'Not discovered'}</span>
          )}
        </div>
      </div>
      <div
        className="mt-4 border-l-2 py-1 pl-3 text-sm [border-color:var(--bad)]"
        style={{ color: 'var(--dim)' }}
      >
        x402 moves funds to the agent wallet first. Recipient restrictions do
        not apply after those funds leave this account.
      </div>
    </Panel>
  )
}
