/**
 * Every failure an agent sees is JSON it can act on.
 *
 * An agent routes around a structured refusal and stalls on a revert hex, so
 * the shape matters more than the prose: a machine-readable `error` code,
 * whatever numbers make the refusal concrete, and one instruction.
 */
export function toolError(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ error: code, message, ...extra }, null, 2) },
    ],
    isError: true as const,
  }
}

export function toolOk(payload: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

/** USDC and USDT on Celo are both 6-decimal. */
export function human(atomic: bigint, decimals = 6): string {
  const s = atomic.toString().padStart(decimals + 1, '0')
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`
}

/** Seconds until the next UTC midnight, when the daily window rolls over. */
export function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0,
  )
  return Math.floor((next - now.getTime()) / 1000)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}m`
}
