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
