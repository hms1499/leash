import { describe, expect, it } from 'vitest'
import { deploymentCandidates, etherscanTransactionsUrl } from '../lib/accountDiscovery.js'

const OWNER = '0x1111111111111111111111111111111111111111'
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('deploymentCandidates', () => {
  it('keeps successful direct contract creations by the requested owner', () => {
    expect(deploymentCandidates([
      { from: OWNER, to: '', contractAddress: A, blockNumber: '12', isError: '0' },
      { from: OWNER, to: null, contractAddress: B, blockNumber: '13', isError: '0' },
    ], OWNER)).toEqual([
      { address: A, deployBlock: '12' },
      { address: B, deployBlock: '13' },
    ])
  })

  it('rejects normal calls, failed creations, other owners and duplicates', () => {
    expect(deploymentCandidates([
      { from: OWNER, to: B, contractAddress: A, blockNumber: '1', isError: '0' },
      { from: OWNER, to: '', contractAddress: A, blockNumber: '2', isError: '1' },
      { from: B, to: '', contractAddress: A, blockNumber: '3', isError: '0' },
      { from: OWNER, to: '', contractAddress: A, blockNumber: '4', isError: '0' },
      { from: OWNER, to: '', contractAddress: A.toUpperCase(), blockNumber: '4', isError: '0' },
    ], OWNER)).toEqual([{ address: A, deployBlock: '4' }])
  })

  it('builds a server-side Celo V2 query without changing the owner', () => {
    const url = new URL(etherscanTransactionsUrl(OWNER, 'secret', 2))
    expect(url.origin + url.pathname).toBe('https://api.etherscan.io/v2/api')
    expect(url.searchParams.get('chainid')).toBe('42220')
    expect(url.searchParams.get('address')).toBe(OWNER)
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('apikey')).toBe('secret')
  })
})
