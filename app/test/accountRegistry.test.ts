import { beforeEach, describe, expect, it } from 'vitest'
import {
  accountDeployBlock,
  forgetPolicyAccount,
  listPolicyAccounts,
  migrateLegacyAccount,
  savePolicyAccount,
  selectPolicyAccount,
} from '../lib/accountRegistry.js'

const OWNER = '0x1111111111111111111111111111111111111111'
const OTHER_OWNER = '0x2222222222222222222222222222222222222222'
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('policy account registry', () => {
  let storage: Storage
  beforeEach(() => { storage = new MemoryStorage() })

  it('keeps multiple accounts scoped to one owner without duplicates', () => {
    savePolicyAccount(storage, OWNER, { address: A, deployBlock: '10', addedAt: 1 })
    savePolicyAccount(storage, OWNER, { address: B, addedAt: 2 })
    savePolicyAccount(storage, OWNER, { address: A, verifiedAt: 20, addedAt: 3 })

    expect(listPolicyAccounts(storage, OWNER)).toEqual([
      { address: A, deployBlock: '10', verifiedAt: 20, addedAt: 1 },
      { address: B, deployBlock: undefined, addedAt: 2 },
    ])
    expect(listPolicyAccounts(storage, OTHER_OWNER)).toEqual([])
  })

  it('migrates the matching legacy singleton and preserves its deploy block', () => {
    storage.setItem('leash.account', A)
    storage.setItem('leash.accountOwner', OWNER.toUpperCase())
    storage.setItem('leash.deployBlock', '123')

    expect(migrateLegacyAccount(storage, OWNER)[0]).toMatchObject({ address: A, deployBlock: '123' })
    expect(accountDeployBlock(storage, OWNER, A)).toBe(123n)
  })

  it('does not migrate a different owner wallet', () => {
    storage.setItem('leash.account', A)
    storage.setItem('leash.accountOwner', OTHER_OWNER)
    expect(migrateLegacyAccount(storage, OWNER)).toEqual([])
  })

  it('selects an account and forgets only the local entry', () => {
    savePolicyAccount(storage, OWNER, { address: A, deployBlock: '10', addedAt: 1 })
    selectPolicyAccount(storage, OWNER, A)

    expect(storage.getItem('leash.account')).toBe(A)
    expect(storage.getItem('leash.deployBlock')).toBe('10')
    expect(forgetPolicyAccount(storage, OWNER, A)).toEqual([])
  })

  it('ignores corrupt stored data instead of crashing the app', () => {
    storage.setItem(`leash.accounts.${OWNER}`, '{broken')
    expect(listPolicyAccounts(storage, OWNER)).toEqual([])
  })

  it('drops obsolete local labels while migrating cached entries', () => {
    storage.setItem(`leash.accounts.${OWNER}`, JSON.stringify([
      { address: A, deployBlock: '10', addedAt: 1, label: 'Old label' },
    ]))
    expect(listPolicyAccounts(storage, OWNER)).toEqual([
      { address: A, deployBlock: '10', addedAt: 1 },
    ])
  })
})
