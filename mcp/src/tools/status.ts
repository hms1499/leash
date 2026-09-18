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
 * The one ambiguity the `SPEND_TOKEN` default introduces, said out loud.
 *
 * `setPolicy` is per-token, so an account with its policy on some other token
 * answers `limits()` with `0/0/0` for USDC — byte for byte what an account
 * whose owner has not set a policy yet returns, and what an exhausted daily
 * allowance looks like from one field away. Before the default, the user had
 * typed `SPEND_TOKEN` themselves and at least knew which token they meant.
 *
 * Only emitted when the token was defaulted: a user who set `SPEND_TOKEN`
 * explicitly and sees a zero cap has a different problem, and telling them to
 * set a variable they already set would send them the wrong way.
 */
function noPolicyNote(
  config: LeashConfig,
  daily: bigint,
): { note?: string } {
  if (!config.tokenFromDefault || daily > 0n) return {}
  return {
    note:
      `No policy is set on ${config.token}, the default token (USDC on Celo mainnet), `
      + 'so the caps read zero and nothing can be spent. Either the owner has not called '
      + 'setPolicy yet, or this account\'s policy is on a different token — in which case '
      + 'set SPEND_TOKEN to that token and restart the server.',
  }
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
    ...noPolicyNote(config, limits.daily),
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
