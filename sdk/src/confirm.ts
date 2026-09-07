/**
 * Wait for the chain to show a change, and never mistake a failed read for a
 * failed write.
 *
 * Every write path in this project confirms by polling the value it changed
 * rather than by trusting a receipt — forno is load-balanced and serves stale
 * reads right after a transaction lands. But a poll that throws is a
 * different event from a write that throws: the same load balancer that
 * serves stale reads also returns 500s, and letting one reach the caller's
 * catch reports a landed transaction as "not sent". On the Stop button that
 * means telling an owner their kill switch failed while the agent is, in
 * fact, already paused.
 *
 * So this swallows per-iteration failures and returns whether the change was
 * ACTUALLY OBSERVED. False means "we stopped waiting", never "it failed".
 *
 * It lives in the SDK rather than in `app/` because the rule has to travel
 * with the code that sends transactions. It did not, twice: `examples/` grew
 * its own copy and shipped a demo that printed an allowance which had not
 * moved, and `mcp/` had none at all and told an agent "paid" about a
 * transaction nobody had observed. `app/lib/confirm.ts` now re-exports this.
 */
export async function pollUntil(
  check: () => Promise<boolean>,
  { attempts = 20, intervalMs = 3000 }: { attempts?: number; intervalMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      if (await check()) return true
    } catch {
      // A single node refusing the read says nothing about the transaction.
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}
