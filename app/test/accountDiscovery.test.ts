import { describe, expect, it } from 'vitest'
import { deploymentCandidates, describeDiscovery, etherscanTransactionsUrl } from '../lib/accountDiscovery.js'

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

describe('describeDiscovery', () => {
  it('reports a clean pass the way it always did', () => {
    expect(describeDiscovery({ verified: 3, unreadable: 0, historyTruncated: false }))
      .toBe('3 compatible protected accounts found in Celo history.')
  })

  it('says account, singular, for one', () => {
    expect(describeDiscovery({ verified: 1, unreadable: 0, historyTruncated: false }))
      .toContain('1 compatible protected account found')
  })

  it('never claims Celo history was searched when part of it went unread', () => {
    // The defect: an owner with three accounts and a rate-limited RPC was told
    // "0 compatible protected accounts found in Celo history."
    const out = describeDiscovery({ verified: 0, unreadable: 40, historyTruncated: false })
    expect(out).not.toContain('found in Celo history')
    expect(out).toContain('40 could not be checked')
    expect(out).toContain('may be incomplete')
  })

  it('reports what it did confirm alongside what it could not', () => {
    const out = describeDiscovery({ verified: 2, unreadable: 5, historyTruncated: false })
    expect(out).toContain('2 compatible protected accounts confirmed')
    expect(out).toContain('5 could not be checked')
  })

  it('agrees with itself about one unreadable candidate', () => {
    expect(describeDiscovery({ verified: 1, unreadable: 1, historyTruncated: false }))
      .toContain('did not answer for it')
  })

  it('appends the truncation note on both branches', () => {
    expect(describeDiscovery({ verified: 1, unreadable: 0, historyTruncated: true }))
      .toContain('Some older deployments may not be shown.')
    expect(describeDiscovery({ verified: 1, unreadable: 2, historyTruncated: true }))
      .toContain('Some older deployments may not be shown.')
  })
})
