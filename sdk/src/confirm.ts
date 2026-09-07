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

/** What the chain was actually seen to do with a transaction. */
export type TxOutcome = 'success' | 'reverted' | 'unobserved'

/**
 * Turns a transaction hash into one of three answers, and never into two.
 *
 * A hash is not a payment. `sendTransaction` resolves as soon as a node accepts
 * the transaction, which says nothing about whether it was mined, and
 * `waitForTransactionReceipt` resolves on revert — so neither is evidence that
 * money moved. The three outcomes here are deliberately not collapsible:
 *
 * - `success`    — a receipt was read and it says the transaction succeeded.
 * - `reverted`   — a receipt was read and it says the transaction reverted.
 *                  Nothing moved; only gas was spent.
 * - `unobserved` — no receipt was read inside the window. This is NOT failure.
 *                  The transaction may be mined a second later, so a caller
 *                  that retries here pays twice.
 *
 * `getReceipt` is expected to throw while the transaction is still pending —
 * that is how viem reports a missing receipt — and forno's load balancer
 * throws for its own reasons too. Both are polled through, not surfaced.
 *
 * The default window is 60s: Celo produces one block per second, so a
 * transaction that is going to land has landed long before that.
 */
export async function confirmTransaction(
  getReceipt: () => Promise<{ status: 'success' | 'reverted' }>,
  { attempts = 30, intervalMs = 2000 }: { attempts?: number; intervalMs?: number } = {},
): Promise<TxOutcome> {
  let seen: 'success' | 'reverted' | undefined
  await pollUntil(async () => {
    seen = (await getReceipt()).status
    return true
  }, { attempts, intervalMs })
  return seen ?? 'unobserved'
}
