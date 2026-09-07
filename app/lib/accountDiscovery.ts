import { isValidAddress } from './address.js'

export type ExplorerTransaction = {
  blockNumber?: unknown
  contractAddress?: unknown
  from?: unknown
  isError?: unknown
  to?: unknown
}

export type DiscoveredAccountCandidate = {
  address: `0x${string}`
  deployBlock: string
}

/**
 * Explorer data only supplies candidates. A caller must still verify owner()
 * and the Leash interface against Celo RPC before presenting an account.
 */
export function deploymentCandidates(
  value: unknown,
  owner: string,
  limit = 100,
): DiscoveredAccountCandidate[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: DiscoveredAccountCandidate[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const tx = raw as ExplorerTransaction
    const address = typeof tx.contractAddress === 'string' ? tx.contractAddress : ''
    const block = typeof tx.blockNumber === 'string' ? tx.blockNumber : ''
    const from = typeof tx.from === 'string' ? tx.from : ''
    const isCreation = tx.to === '' || tx.to === null
    const key = address.toLowerCase()
    if (
      !isCreation || tx.isError !== '0' ||
      from.toLowerCase() !== owner.toLowerCase() ||
      !isValidAddress(address) || !/^\d+$/.test(block) || seen.has(key)
    ) continue
    seen.add(key)
    result.push({ address, deployBlock: block })
    if (result.length >= limit) break
  }
  return result
}

export function etherscanTransactionsUrl(owner: string, apiKey: string, page: number): string {
  const query = new URLSearchParams({
    chainid: '42220',
    module: 'account',
    action: 'txlist',
    address: owner,
    startblock: '0',
    endblock: '999999999',
    page: String(page),
    offset: '1000',
    sort: 'desc',
    apikey: apiKey,
  })
  return `https://api.etherscan.io/v2/api?${query}`
}
