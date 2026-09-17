import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOOKUP_UNCERTAIN, accountLookupNote, findOwnedAccounts, newestAccount,
  type OwnedAccountsResult, type Verification,
} from '../lib/ownedAccounts.js'

const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57' as const
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`
const candidates = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ address: addr(i + 1), deployBlock: String(i + 1) }))

function ok(accounts: ReturnType<typeof candidates>, historyTruncated = false) {
  return async () => ({ ok: true, body: { accounts, historyTruncated } })
}

describe('findOwnedAccounts', () => {
  it('keeps only verified accounts, and counts the ones Celo did not answer for', async () => {
    const verdicts: Verification[] = ['verified', 'unreadable', 'wrong-owner', 'incompatible', 'verified']
    const result = await findOwnedAccounts(OWNER, new AbortController().signal, {
      fetchCandidates: ok(candidates(5), true),
      verify: async (address) => verdicts[Number(BigInt(address)) - 1],
    })
    expect(result).toEqual({
      status: 'ok',
      verified: [candidates(5)[0], candidates(5)[4]],
      unreadable: 1,
      historyTruncated: true,
    })
  })

  // The AccountsPage defect of 2026-09-17, now held by behaviour rather than
  // by a source ratchet: a run replaced while its response was read must not
  // report anything about the owner it was started for.
  it('stops when replaced after the response arrives', async () => {
    const controller = new AbortController()
    let verified = 0
    const result = await findOwnedAccounts(OWNER, controller.signal, {
      fetchCandidates: async () => { controller.abort(); return { ok: false, body: {} } },
      verify: async () => { verified++; return 'verified' },
    })
    expect(result).toEqual({ status: 'aborted' })
    expect(verified).toBe(0)
  })

  it('stops between batches of five', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await findOwnedAccounts(OWNER, controller.signal, {
      fetchCandidates: ok(candidates(7)),
      verify: async () => { calls++; controller.abort(); return 'verified' },
    })
    expect(result).toEqual({ status: 'aborted' })
    expect(calls).toBe(5)
  })

  it('tells a cancelled request from a failed one', async () => {
    const controller = new AbortController()
    controller.abort()
    const reject = async () => { throw new Error('network') }
    expect(await findOwnedAccounts(OWNER, controller.signal, { fetchCandidates: reject }))
      .toEqual({ status: 'aborted' })
    expect(await findOwnedAccounts(OWNER, new AbortController().signal, { fetchCandidates: reject }))
      .toEqual({ status: 'failed' })
  })

  it('names an unconfigured explorer, and fails on any other bad response', async () => {
    const signal = new AbortController().signal
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: false, body: { code: 'DISCOVERY_NOT_CONFIGURED' } }),
    })).toEqual({ status: 'not-configured' })
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: false, body: {} }),
    })).toEqual({ status: 'failed' })
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: true, body: {} }),
    })).toEqual({ status: 'failed' })
  })
})

describe('newestAccount', () => {
  // Compared as numbers: '9' sorts after '10' as a string.
  it('picks the highest deploy block', () => {
    expect(newestAccount([
      { address: addr(1), deployBlock: '9' },
      { address: addr(2), deployBlock: '10' },
    ])).toEqual({ address: addr(2), deployBlock: '10' })
  })

  it('has nothing to pick from an empty list', () => {
    expect(newestAccount([])).toBeNull()
  })
})

describe('accountLookupNote', () => {
  const found = (n: number, extra: Partial<Extract<OwnedAccountsResult, { status: 'ok' }>> = {}) =>
    ({ status: 'ok', verified: candidates(n), unreadable: 0, historyTruncated: false, ...extra }) as const

  it('says nothing when the answer is clear', () => {
    expect(accountLookupNote(found(0))).toBeNull()
    expect(accountLookupNote(found(1))).toBeNull()
    expect(accountLookupNote({ status: 'aborted' })).toBeNull()
  })

  it('says which of several it resumed', () => {
    expect(accountLookupNote(found(3))).toBe(
      'This wallet owns 3 protected accounts. Resumed the newest; open My accounts to choose another.',
    )
  })

  // "None" built from a read that did not happen is a claim this app refuses.
  it('will not imply there is none when it could not tell', () => {
    expect(accountLookupNote(found(0, { unreadable: 2 }))).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote(found(0, { historyTruncated: true }))).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote({ status: 'failed' })).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote({ status: 'not-configured' })).toBe(LOOKUP_UNCERTAIN)
  })
})

describe('one implementation of account discovery', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))

  it('AccountsPage uses findOwnedAccounts and no verifier of its own', () => {
    const source = readFileSync(join(ROOT, 'components/AccountsPage.tsx'), 'utf8')
    expect(source).toContain('findOwnedAccounts(owner, signal)')
    expect(source).not.toContain('function verifyPolicyAccount')
    expect(source).not.toContain('function answeredByTheContract')
  })
})
