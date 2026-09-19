import { describe, expect, it } from 'vitest'
import { ownershipRole, refuseGrant, refuseNomination } from '../lib/policy.js'

const OWNER = '0x1111111111111111111111111111111111111111'
const INCOMING = '0x2222222222222222222222222222222222222222'
const STRANGER = '0x3333333333333333333333333333333333333333'

describe('ownershipRole', () => {
  it('knows the owner', () => {
    expect(ownershipRole(OWNER, null, OWNER)).toBe('owner')
  })

  // The affordance this exists for: acceptOwnership is the first write in the
  // app whose caller is deliberately NOT the owner. Gating it on isOwner hides
  // it from the only person who can use it.
  it('knows the nominee, who is not the owner', () => {
    expect(ownershipRole(OWNER, INCOMING, INCOMING)).toBe('incoming')
  })

  it('gives a stranger nothing', () => {
    expect(ownershipRole(OWNER, INCOMING, STRANGER)).toBe('none')
  })

  it('gives a disconnected visitor nothing', () => {
    expect(ownershipRole(OWNER, INCOMING, null)).toBe('none')
  })

  it('is case-insensitive, because wallets disagree about checksums', () => {
    expect(ownershipRole(OWNER.toUpperCase(), null, OWNER.toLowerCase())).toBe('owner')
    expect(ownershipRole(OWNER, INCOMING.toUpperCase(), INCOMING.toLowerCase())).toBe('incoming')
  })

  it('prefers owner when the owner is somehow also the nominee', () => {
    expect(ownershipRole(OWNER, OWNER, OWNER)).toBe('owner')
  })

  it('gives nothing when the owner has not been read yet', () => {
    // A read that failed must not promote a visitor. Every gate in this app is
    // a positive observation of the chain.
    expect(ownershipRole(null, null, OWNER)).toBe('none')
  })
})

const AGENT = '0x4444444444444444444444444444444444444444'
const isOperator = (operators: string[]) => async (a: string) =>
  operators.some((o) => o.toLowerCase() === a.toLowerCase())
const unreadable = async (): Promise<boolean> => { throw new Error('forno refused the read') }

/**
 * Checked before the wallet opens, because each of these ends in a paid
 * transaction that confirms nothing or undoes the point of the account.
 */
describe('refuseNomination', () => {
  it('lets a fresh address through', async () => {
    expect(await refuseNomination(INCOMING, null, isOperator([AGENT]))).toBeNull()
  })

  it('refuses what is not an address', async () => {
    expect(await refuseNomination('0x12', null, isOperator([]))).toMatch(/not a valid address/)
  })

  // pollUntil reads pendingOwner() first thing, and it already equals the
  // nominee -- so this "confirmed" on its first read, for a transaction it had
  // not seen land. TopUpDrawer refuses the same shape for the same reason.
  it('refuses the wallet that is already nominated, whatever its case', async () => {
    expect(await refuseNomination(INCOMING.toUpperCase().replace('0X', '0x'), INCOMING, isOperator([])))
      .toMatch(/already nominated/)
  })

  // The owner may not be made an agent (AgentAccessPanel); this is the same
  // rule from the other side, and the worse one: an agent that owns the
  // account can sweep everything the limits protect, with a hot key.
  it('refuses an authorised agent', async () => {
    expect(await refuseNomination(AGENT, null, isOperator([AGENT]))).toMatch(/authorised agent/)
  })

  // Fail closed: not knowing whether the nominee is an agent is not a yes.
  it('refuses when the agent check cannot be read', async () => {
    expect(await refuseNomination(INCOMING, null, unreadable)).toMatch(/Nothing was sent/)
  })
})

describe('refuseGrant', () => {
  it('lets a fresh agent through', async () => {
    expect(await refuseGrant(AGENT, OWNER, isOperator([]))).toBeNull()
  })

  it('refuses what is not an address', async () => {
    expect(await refuseGrant('agent', OWNER, isOperator([]))).toMatch(/valid Celo address/)
  })

  it('refuses the owner wallet', async () => {
    expect(await refuseGrant(OWNER.toUpperCase().replace('0X', '0x'), OWNER, isOperator([])))
      .toMatch(/separate agent wallet/)
  })

  // The dashboard's list is what 24 hours of history could verify, so an agent
  // authorised earlier and never used is missing from it -- and granting it
  // again "confirmed" on pollUntil's first read, and cost gas for nothing.
  it('refuses a wallet the contract already trusts, listed or not', async () => {
    expect(await refuseGrant(AGENT, OWNER, isOperator([AGENT]))).toMatch(/already an authorised agent/)
  })

  it('refuses when the check cannot be read', async () => {
    expect(await refuseGrant(AGENT, OWNER, unreadable)).toMatch(/Nothing was sent/)
  })
})
