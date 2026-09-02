import type { LeashConfig } from '../config.js'
import { human, secondsUntilUtcMidnight, formatDuration } from '../errors.js'

type StatusDeps = {
  leash: {
    remainingToday(token: `0x${string}`): Promise<bigint>
    operatorBalance(token: `0x${string}`): Promise<bigint>
    accountBalance(token: `0x${string}`): Promise<bigint>
    limits(token: `0x${string}`): Promise<{ perTx: bigint; daily: bigint; spentToday: bigint }>
  }
  config: LeashConfig
}

/**
 * What the agent is allowed to do right now.
 *
 * Both atomic and human figures are returned: the atomic ones are what the
 * other tools take as arguments, and the human ones are what an agent should
 * repeat back to a person.
 */
export async function statusTool({ leash, config }: StatusDeps): Promise<Record<string, unknown>> {
  const [remaining, operatorHeld, accountHeld, limits] = await Promise.all([
    leash.remainingToday(config.token),
    leash.operatorBalance(config.token),
    leash.accountBalance(config.token),
    leash.limits(config.token),
  ])

  const resets = secondsUntilUtcMidnight()
  return {
    account: config.accountAddress,
    token: config.token,
    remaining_today: human(remaining),
    remaining_today_atomic: remaining.toString(),
    daily_cap: human(limits.daily),
    per_tx_cap: human(limits.perTx),
    spent_today: human(limits.spentToday),
    account_balance: human(accountHeld),
    operator_balance: human(operatorHeld),
    can_spend: remaining > 0n && accountHeld > 0n,
    resets_in: formatDuration(resets),
    resets_in_seconds: resets,
  }
}
