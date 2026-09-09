import { describe, it, expect } from 'vitest'
import { accountHealth } from '../lib/accountHealth.js'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2' as `0x${string}`
const OPERATOR = '0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6'

/** A healthy account: every gate passed, protection off. */
const healthy = {
  account: ACCOUNT,
  paused: false,
  loading: false,
  daily: 1_000_000n,
  perTx: 500_000n,
  balance: 2_000_000n,
  allowlistEnabled: false,
  operator: OPERATOR,
  operatorLoading: false,
  agentTransactionsLeft: 17,
  isOwner: true,
}

describe('accountHealth', () => {
  it('reports a healthy account with protection off, unqualified', () => {
    const out = accountHealth(healthy)
    expect(out.badge).toBe('Ready')
    expect(out.tone).toBe('ok')
    expect(out.body).not.toContain('approved')
  })

  it('names the restriction when recipient protection is on', () => {
    // The defect: payeeAllowlist is a mapping and is not enumerable, so an
    // account with protection on and an empty allowlist reads exactly like a
    // healthy one and refuses every execute() with PayeeNotAllowed. This does
    // not claim the list is populated -- it names the restriction.
    const out = accountHealth({ ...healthy, allowlistEnabled: true })
    expect(out.badge).toBe('Ready')
    expect(out.body).toContain('approved addresses only')
    expect(out.body).toContain('every other payee is refused')
  })

  it('keeps protection-on as ok, because being restricted is not a fault', () => {
    expect(accountHealth({ ...healthy, allowlistEnabled: true }).tone).toBe('ok')
  })

  it('offers the owner a way to review recipients, and offers nobody else one', () => {
    expect(accountHealth({ ...healthy, allowlistEnabled: true }).action)
      .toEqual({ href: '#policy-controls', label: 'Review recipients' })
    expect(accountHealth({ ...healthy, allowlistEnabled: true, isOwner: false }).action)
      .toBeUndefined()
  })
})

/**
 * Every earlier gate is checked against allowlistEnabled: true, so the new
 * branch cannot swallow one. Each of these is a worse problem than a
 * restriction, and each has to keep outranking it.
 */
describe('accountHealth ordering is unchanged by the allowlist', () => {
  const protectedOn = { ...healthy, allowlistEnabled: true }

  it('states nothing before the first read returns', () => {
    expect(accountHealth({ ...protectedOn, loading: true }).badge).toBe('Syncing')
  })

  it('reports a pause above everything else', () => {
    expect(accountHealth({ ...protectedOn, paused: true }).badge).toBe('Paused')
  })

  it('reports an unset daily cap as needing setup', () => {
    expect(accountHealth({ ...protectedOn, daily: 0n }).badge).toBe('Needs setup')
  })

  it('reports an unset per-transaction cap as needing setup', () => {
    expect(accountHealth({ ...protectedOn, perTx: 0n }).badge).toBe('Needs setup')
  })

  it('does not guess while the operator is still being verified', () => {
    expect(accountHealth({ ...protectedOn, operatorLoading: true }).badge).toBe('Checking')
  })

  it('reports a missing operator as needing setup', () => {
    expect(accountHealth({ ...protectedOn, operator: null }).badge).toBe('Needs setup')
  })

  it('says none was FOUND, never that none exists', () => {
    // The history is read over 24 hours and `operators` cannot be enumerated,
    // so absence of a log is not absence of an operator. An owner told the
    // account has no agent may stop looking for one that can still spend.
    const body = accountHealth({ ...protectedOn, operator: null }).body
    expect(body).toContain('recent activity')
    expect(body).toContain('cannot be asked to list')
    expect(body).not.toContain('No active operator could be verified')
  })

  it('reports an empty account as needing funds', () => {
    expect(accountHealth({ ...protectedOn, balance: 0n }).badge).toBe('Needs funds')
  })

  it('does not guess while the agent float is still being read', () => {
    expect(accountHealth({ ...protectedOn, agentTransactionsLeft: null }).badge).toBe('Checking')
  })

  it('reports a stalled agent as needing gas', () => {
    expect(accountHealth({ ...protectedOn, agentTransactionsLeft: 0 }).badge).toBe('Needs gas')
  })
})
