import { getAddress, toEventSelector } from 'viem'
import { isValidAddress } from './address.js'
import type { OperatorChange } from './feed.js'

/**
 * Computed, not written out: scripts/check-secrets.sh reads any bare 64-hex
 * value as a possible private key. Once per module load, not per request.
 * agentDiscovery.test.ts holds it to the event in the compiled ABI.
 */
export const OPERATOR_CHANGED_TOPIC = toEventSelector('OperatorChanged(address,bool)')

/**
 * The whole OperatorChanged history of one account, from the explorer.
 *
 * Not from forno: `operators` is a mapping and cannot be enumerated, and a
 * getLogs walk costs (age / 5,000) round trips -- the dashboard caps its walk
 * at 24 hours for exactly that reason, which is why an agent authorised last
 * week was invisible to it. The explorer answers the whole range in one call.
 */
export function etherscanLogsUrl(account: string, apiKey: string, page: number): string {
  const query = new URLSearchParams({
    chainid: '42220',
    module: 'logs',
    action: 'getLogs',
    address: account,
    topic0: OPERATOR_CHANGED_TOPIC,
    fromBlock: '0',
    toBlock: 'latest',
    page: String(page),
    offset: '1000',
    apikey: apiKey,
  })
  return `https://api.etherscan.io/v2/api?${query}`
}

function hexNumber(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return null
  // Etherscan writes zero as a bare "0x": measured 2026-09-17 on 0xBE380aa7,
  // whose only OperatorChanged log came back with `logIndex: "0x"`.
  return value === '0x' ? 0n : BigInt(value)
}

/**
 * Explorer logs as OperatorChange, dropping anything that does not parse.
 * Only candidates: operators() on the account decides.
 */
export function operatorChangesFromExplorer(value: unknown, account: string): OperatorChange[] {
  if (!Array.isArray(value)) return []
  const changes: OperatorChange[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { address?: unknown; topics?: unknown; data?: unknown; blockNumber?: unknown; logIndex?: unknown }
    if (typeof entry.address !== 'string' || entry.address.toLowerCase() !== account.toLowerCase()) continue
    if (!Array.isArray(entry.topics)) continue
    const [topic0, topic1] = entry.topics as unknown[]
    if (typeof topic0 !== 'string' || topic0.toLowerCase() !== OPERATOR_CHANGED_TOPIC) continue
    if (typeof topic1 !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(topic1)) continue
    if (typeof entry.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(entry.data)) continue
    const blockNumber = hexNumber(entry.blockNumber)
    const logIndex = hexNumber(entry.logIndex)
    if (blockNumber === null || logIndex === null) continue
    changes.push({
      operator: getAddress(`0x${topic1.slice(26)}`),
      enabled: BigInt(entry.data) !== 0n,
      blockNumber,
      logIndex: Number(logIndex),
    })
  }
  return changes
}

/** The route's answer. Throws on anything but a list, so recoverAgent fails closed. */
export async function fetchOperatorCandidates(
  account: string,
  signal?: AbortSignal,
): Promise<readonly `0x${string}`[]> {
  const response = await fetch(`/api/accounts/operators?account=${encodeURIComponent(account)}`, { signal })
  if (!response.ok) throw new Error(`Operator lookup returned ${response.status}`)
  const body = await response.json() as { operators?: unknown }
  if (!Array.isArray(body.operators)) throw new Error('Operator lookup returned no list')
  return body.operators.filter((item): item is `0x${string}` => typeof item === 'string' && isValidAddress(item))
}

/**
 * The authorised agent this browser was not told about, or null.
 *
 * Never throws: a failed lookup leaves the wizard exactly where it was
 * before this existed, at step 3, where pasting the address still works.
 */
export async function recoverAgent(input: {
  owner: string
  candidates: () => Promise<readonly `0x${string}`[]>
  isOperator: (candidate: `0x${string}`) => Promise<boolean>
}): Promise<`0x${string}` | null> {
  try {
    // The wizard refuses the owner as its own agent (addAgent).
    const list = (await input.candidates())
      .filter((candidate) => candidate.toLowerCase() !== input.owner.toLowerCase())
    // One Promise.all, so viem multicalls every operators() read.
    const checks = await Promise.all(list.map(async (candidate) => ({
      candidate,
      ok: await input.isOperator(candidate),
    })))
    return checks.find((check) => check.ok)?.candidate ?? null
  } catch {
    return null
  }
}
