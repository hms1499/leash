import { formatDisplayAmount } from './policy.js'

export type SetupStage = 1 | 2 | 3 | 4

export type SetupReadiness = {
  accountCreated: boolean
  limitsConfirmed: boolean
  agentAuthorized: boolean
  protectedFundsDetected: boolean
  agentGasReady: boolean
  ready: boolean
}

/**
 * A setup is operational only when the agent can actually send a transaction.
 * Integration is deliberately absent: SDK/MCP installation is a separate
 * journey and must never turn an otherwise usable account into "not ready".
 */
export function setupReadiness(input: {
  account: string | null
  limitsConfirmed: boolean
  agentAuthorized: boolean
  protectedBalance: bigint | null
  agentTransactionsLeft: number
}): SetupReadiness {
  const accountCreated = Boolean(input.account)
  const protectedFundsDetected = input.protectedBalance !== null && input.protectedBalance > 0n
  const agentGasReady = input.agentTransactionsLeft > 0
  return {
    accountCreated,
    limitsConfirmed: input.limitsConfirmed,
    agentAuthorized: input.agentAuthorized,
    protectedFundsDetected,
    agentGasReady,
    ready: accountCreated && input.limitsConfirmed && input.agentAuthorized &&
      protectedFundsDetected && agentGasReady,
  }
}

/** The first place an interrupted setup needs attention. */
export function firstSetupStage(readiness: SetupReadiness): SetupStage {
  if (!readiness.accountCreated) return 1
  if (!readiness.limitsConfirmed) return 2
  if (!readiness.agentAuthorized || !readiness.protectedFundsDetected || !readiness.agentGasReady) return 3
  return 4
}

/**
 * One balance read, and whether it has happened.
 *
 * `bigint | null` carried this until 2026-09-09 and could not: `null` meant
 * both "not read yet" and "the read threw", which are opposite things to a
 * reader. A failed read therefore rendered "Checking…" for ever, with the
 * balance's badge saying "Required", "Review setup" disabled, and nothing on
 * screen saying a read had failed or that Refresh balances would retry it.
 */
export type BalanceRead =
  | { status: 'reading' }
  | { status: 'failed' }
  | { status: 'ok'; value: bigint }

/**
 * The figure, or nothing.
 *
 * `setupReadiness` takes this rather than the read itself, so a failed read
 * fails closed exactly as an unread one does. Readiness is a positive
 * observation of the chain: not knowing and knowing it is zero must both
 * refuse to unlock the last step.
 */
export function balanceValue(read: BalanceRead): bigint | null {
  return read.status === 'ok' ? read.value : null
}

/**
 * What to print for a balance, and whether it is bad news.
 *
 * Here rather than inside the wizard because app/vitest.config.ts runs the
 * node environment and a decision inside a component cannot be tested (spec
 * §2.2) -- the same reason describeDeployReceipt lives in lib/deploy.ts.
 *
 * formatDisplayAmount, not formatAmount: the latter pads to the token's full
 * precision, so a balance of five dollars read "5.000000". These figures are
 * displayed, never submitted, and lib/policy.ts fixes that split.
 */
export function describeBalance(
  read: BalanceRead, decimals: number, minimumPlaces = 2,
): { text: string; failed: boolean } {
  if (read.status === 'reading') return { text: 'Checking…', failed: false }
  if (read.status === 'failed') return { text: 'Could not read', failed: true }
  // The unit belongs inside the sentence, not appended by the caller: there is
  // no such amount as "Could not read USDC".
  return { text: `${formatDisplayAmount(read.value, decimals, minimumPlaces)} USDC`, failed: false }
}

/**
 * What a balance becomes when a later read fails.
 *
 * A figure the chain has already given us is not made untrue by a subsequent
 * forno failure, and useAccountState deliberately keeps its last observed
 * snapshot visible across a failed refresh. This column must not disagree with
 * it: only a balance that was never read successfully becomes 'failed'. The
 * failure itself is reported separately, so nothing is hidden.
 */
export function afterFailedRead(previous: BalanceRead): BalanceRead {
  return previous.status === 'ok' ? previous : { status: 'failed' }
}
