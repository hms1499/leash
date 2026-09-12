import { describe, expect, it } from 'vitest'
import { ownershipRole } from '../lib/policy.js'

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
