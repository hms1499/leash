import { describeDeployReceipt } from './deploy.js'

/**
 * A deployment this browser sent and has not yet seen judged.
 *
 * deploy() used to save an account only after its receipt. A tab closed
 * during the wait -- the longest wait in the app -- left a real contract that
 * nothing remembered, and the next visit offered "Create protected account"
 * again: a second contract, and a second fee. The hash is written the moment
 * the wallet returns it, and a returning wallet asks Celo about it before step
 * 1 offers anything.
 */
export type PendingDeploy = { hash: `0x${string}`; owner: string; sentAt: number }

export function pendingDeployKey(owner: string): string {
  return `leash.pendingDeploy.${owner.toLowerCase()}`
}

export function serializePendingDeploy(record: PendingDeploy): string {
  return JSON.stringify(record)
}

/** Null for anything malformed, and for a record another owner wrote. */
export function parsePendingDeploy(raw: string | null, owner: string): PendingDeploy | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingDeploy>
    if (typeof value.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.hash)) return null
    if (typeof value.owner !== 'string' || value.owner.toLowerCase() !== owner.toLowerCase()) return null
    if (typeof value.sentAt !== 'number') return null
    return { hash: value.hash as `0x${string}`, owner: value.owner, sentAt: value.sentAt }
  } catch {
    return null
  }
}

export type PendingDeployCheck =
  | { kind: 'landed'; address: `0x${string}`; deployBlock: string }
  | { kind: 'failed'; message: string }
  /** The node knows the transaction; there is no receipt yet. */
  | { kind: 'waiting' }
  /**
   * The node knows neither. Not proof it was dropped: forno is load-balanced,
   * and one node may not have seen what another accepted. Only the owner may
   * decide to move past it.
   */
  | { kind: 'unknown' }
  /** The node did not answer. Says nothing about the transaction. */
  | { kind: 'unread' }

type DeployReceipt = {
  status: 'success' | 'reverted'
  contractAddress?: `0x${string}` | null
  blockNumber: bigint
}

/** Injected, so the decision can be tested without a node. */
export type PendingDeployClient = {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<DeployReceipt>
  getTransaction(args: { hash: `0x${string}` }): Promise<unknown>
}

function isNamed(error: unknown, name: string): boolean {
  let link: unknown = error
  for (let depth = 0; depth < 5 && link && typeof link === 'object'; depth++) {
    if ((link as { name?: unknown }).name === name) return true
    link = (link as { cause?: unknown }).cause
  }
  return false
}

export async function checkPendingDeploy(
  hash: `0x${string}`,
  client: PendingDeployClient,
): Promise<PendingDeployCheck> {
  try {
    const receipt = await client.getTransactionReceipt({ hash })
    // describeDeployReceipt, not receipt.status alone: a reverted creation
    // still carries a contractAddress. deploy() judges it the same way.
    const outcome = describeDeployReceipt(receipt, hash)
    return outcome.ok
      ? { kind: 'landed', address: outcome.address, deployBlock: receipt.blockNumber.toString() }
      : { kind: 'failed', message: outcome.message }
  } catch (error) {
    if (!isNamed(error, 'TransactionReceiptNotFoundError')) return { kind: 'unread' }
  }
  try {
    await client.getTransaction({ hash })
    return { kind: 'waiting' }
  } catch (error) {
    return isNamed(error, 'TransactionNotFoundError') ? { kind: 'unknown' } : { kind: 'unread' }
  }
}

export function pendingDeployNote(
  check: PendingDeployCheck | 'checking',
  hash: `0x${string}`,
): string | null {
  if (check === 'checking') return `Checking the deployment this browser sent earlier (${hash})…`
  switch (check.kind) {
    case 'landed': return null
    case 'failed': return check.message
    case 'waiting':
      return `A deployment sent from this browser (${hash}) has not confirmed yet. Wait for it before creating another account.`
    case 'unknown':
      return `Celo does not know the deployment this browser sent earlier (${hash}). It may have been dropped. Check it on the explorer; if it never landed, you can deploy again.`
    case 'unread':
      return `Could not check the deployment this browser sent earlier (${hash}). Try again in a moment.`
  }
}

/** Every state short of an answer from the chain keeps Create shut. */
export function pendingDeployBlocksCreate(check: PendingDeployCheck | 'checking'): boolean {
  if (check === 'checking') return true
  return check.kind !== 'landed' && check.kind !== 'failed'
}
