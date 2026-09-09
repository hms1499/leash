export type DeployOutcome =
  | { ok: true; address: `0x${string}` }
  | { ok: false; message: string }

/**
 * What a deployment receipt actually means.
 *
 * `contractAddress` is not evidence of success. go-ethereum fills it in for
 * every transaction with `to == nil`, whatever the execution did, so a
 * reverted or out-of-gas creation comes back with an address that holds no
 * code. Saving it registers a junk account in /accounts, and the restore
 * effect's reads then fail and report a failed deployment as a network
 * problem -- "Check your connection and try again" for a transaction the
 * chain rejected.
 *
 * CLAUDE.md: a receipt is not confirmation, and `waitForTransactionReceipt`
 * resolves on revert. `examples/demo-agent.ts` already checks; the wizard was
 * the one place that did not, and it is the path a stranger walks first.
 *
 * Here rather than inline because app/vitest.config.ts runs in the node
 * environment and a decision inside a component cannot be tested (spec §2.2).
 */
export function describeDeployReceipt(
  receipt: { status: 'success' | 'reverted'; contractAddress?: `0x${string}` | null },
  hash: `0x${string}`,
): DeployOutcome {
  if (receipt.status !== 'success') {
    return {
      ok: false,
      message: `The deployment reverted on chain (${hash}). No account was created and nothing was saved. Check the transaction before trying again.`,
    }
  }
  if (!receipt.contractAddress) {
    return {
      ok: false,
      message: `Sent as ${hash}, but no contract address was returned. Check the transaction before trying again.`,
    }
  }
  return { ok: true, address: receipt.contractAddress }
}
