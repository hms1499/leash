export type AccountHealth = {
  badge: string
  title: string
  body: string
  tone: 'normal' | 'ok' | 'bad'
  action?: { href: string; label: string }
}

/**
 * The dashboard's one-line verdict on an account, as data.
 *
 * Extracted from DashboardOverview.tsx so it can be tested at all:
 * app/vitest.config.ts runs in the node environment and no component-testing
 * dependency may be added (spec §2.2). It is here for the same reason
 * meterState and spendBand are.
 */
export function accountHealth({
  account, paused, loading, daily, perTx, balance, allowlistEnabled, operator,
  operatorLoading, agentTransactionsLeft, isOwner,
}: {
  account: `0x${string}`
  paused: boolean
  loading: boolean
  daily: bigint
  perTx: bigint
  balance: bigint
  allowlistEnabled: boolean
  operator: string | null
  operatorLoading: boolean
  agentTransactionsLeft: number | null
  isOwner: boolean
}): AccountHealth {
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
      action: isOwner ? { href: '#agent-management', label: 'Manage agent' } : undefined,
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
  // Recipient protection is a real precondition on the direct-payment path,
  // and the one condition this function cannot verify. payeeAllowlist is a
  // mapping(address => bool) and is not enumerable, so the app cannot ask the
  // contract whether ANY payee is approved -- an account with protection on
  // and an empty allowlist reads exactly like a healthy one and refuses every
  // execute() with PayeeNotAllowed.
  //
  // So this does not claim the allowlist is populated. It names the
  // restriction and stops short, which is the only true thing available. Same
  // failure shape as the full allowance on an empty account; see lib/meter.ts.
  if (allowlistEnabled) {
    return {
      badge: 'Ready',
      title: 'Agent is ready to spend',
      body: 'Policy, protected funds, operator access and agent gas are all available. Recipient protection is on, so direct payments reach approved addresses only \u2014 every other payee is refused.',
      tone: 'ok',
      action: isOwner ? { href: '#policy-controls', label: 'Review recipients' } : undefined,
    }
  }
  return {
    badge: 'Ready',
    title: 'Agent is ready to spend',
    body: 'Policy, protected funds, operator access and agent gas are all available.',
    tone: 'ok',
  }
}

